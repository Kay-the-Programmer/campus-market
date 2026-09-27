import React, { useEffect, useRef, useState } from 'react';
import {
  Plus, Pencil, Trash2, Eye, EyeOff, ArrowUp, ArrowDown, Loader2,
  ImagePlus, ImageOff, Sparkles, LayoutGrid, GalleryHorizontalEnd, Palette, AlertTriangle,
} from 'lucide-react';
import {
  PromoSlot, PromoPlacement, PromoTheme,
  PROMO_THEMES, PROMO_THEME_GRADIENT, PROMO_THEME_TILE, promoAppearance, contrastRatio,
} from '../../types';
import { api } from '../../services/api';
import { Modal, ErrorBanner, Field } from '../shared/Modal';
import { uploadImageFile } from '../../utils/images';
import { ColorField } from './ColorField';
import { ListingImage } from '../shared/ListingImage';

/*
 * Banners are decorative and full-bleed, so they are compressed harder than
 * listing photos: this image ships to every visitor on the busiest page, and
 * a crisp 1600px original would dominate the payload for no visible gain.
 * The rendering itself is the shared pipeline in utils/images.ts; only the
 * size and quality differ from a listing photo.
 */
const BANNER_MAX_EDGE = 1280;
const BANNER_QUALITY = 0.8;

type Draft = {
  id?: string;
  placement: PromoPlacement;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaLink: string;
  badge: string;
  imageUrl: string;
  imageOverlay: number;
  theme: PromoTheme;
  /* Custom colours, '' meaning "follow the theme". Kept as strings rather
     than string|null because they are bound to text inputs, and an input
     whose value goes null is an uncontrolled-component warning. */
  bgColor: string;
  textColor: string;
  buttonColor: string;
  buttonTextColor: string;
  wide: boolean;
  active: boolean;
};

const emptyDraft = (placement: PromoPlacement): Draft => ({
  placement,
  title: '',
  subtitle: '',
  ctaLabel: placement === 'CAROUSEL' ? 'Explore listings' : '',
  ctaLink: '/browse',
  badge: '',
  imageUrl: '',
  imageOverlay: 40,
  theme: 'BLUE',
  bgColor: '',
  textColor: '',
  buttonColor: '',
  buttonTextColor: '',
  wide: false,
  active: true,
});

const toDraft = (p: PromoSlot): Draft => ({
  id: p.id,
  placement: p.placement,
  title: p.title,
  subtitle: p.subtitle ?? '',
  ctaLabel: p.ctaLabel ?? '',
  ctaLink: p.ctaLink ?? '',
  badge: p.badge ?? '',
  imageUrl: p.imageUrl ?? '',
  imageOverlay: p.imageOverlay,
  theme: p.theme,
  bgColor: p.bgColor ?? '',
  textColor: p.textColor ?? '',
  buttonColor: p.buttonColor ?? '',
  buttonTextColor: p.buttonTextColor ?? '',
  wide: p.wide,
  active: p.active,
});

/**
 * One representative colour per theme.
 *
 * <p>Each theme is a three-stop gradient, so no single hex is "the" colour -
 * this is the first stop, which is the one the eye reads as the theme. Used
 * only to fill the picker and the placeholder when a colour is unset, so
 * being approximate is fine; it is never saved.
 */
const THEME_BASE: Record<PromoTheme, string> = {
  BLUE: '#2563eb',
  GREEN: '#007d55',
  PURPLE: '#8455ef',
  DARK: '#0b1c30',
  AMBER: '#c2410c',
};

/** Suggestions, so an admin never has to guess the filter syntax. */
const LINK_PRESETS: { label: string; value: string }[] = [
  { label: 'Home feed', value: '/browse' },
  { label: 'Products', value: '/browse?type=Product' },
  { label: 'Services', value: '/browse?type=Service' },
  { label: 'Food', value: '/browse?type=Food' },
  { label: 'Search: textbook', value: '/browse?q=textbook' },
  { label: 'Post a listing', value: '/sell' },
  { label: 'Downschool', value: '/browse?campusZone=DOWNSCHOOL' },
  { label: 'Upschool', value: '/browse?campusZone=UPSCHOOL' },
];

interface PromoEditorProps {
  onNotice: (message: string) => void;
}

/**
 * The home-page editor: carousel slides and "Special offers" tiles.
 *
 * Both are the same record with a different `placement`, so one editor serves
 * both rather than two near-identical screens.
 */
export const PromoEditor: React.FC<PromoEditorProps> = ({ onNotice }) => {
  const [promos, setPromos] = useState<PromoSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<PromoPlacement>('CAROUSEL');

  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PromoSlot | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const res = await api.admin.getPromos();
    setError(res.error || null);
    setPromos(res.promos || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const visible = promos
    .filter((p) => p.placement === section)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  /*
   * What each colour would be if left alone.
   *
   * Shown in the swatch and the placeholder so "following the theme" is a
   * visible state rather than an empty box. A carousel slide is white copy on
   * a dark gradient; a tile is dark copy on a light tint - so the defaults
   * differ by placement, and showing the carousel's to someone editing a tile
   * would be a confident lie.
   */
  const themeDefaults = React.useMemo(() => {
    if (!draft) return { background: '#2563eb', text: '#ffffff', button: '#ffffff', buttonText: '#0b1c30' };
    return draft.placement === 'CAROUSEL'
      ? { background: THEME_BASE[draft.theme], text: '#ffffff', button: '#ffffff', buttonText: THEME_BASE[draft.theme] }
      : { background: '#eff4ff', text: THEME_BASE[draft.theme], button: THEME_BASE[draft.theme], buttonText: '#ffffff' };
  }, [draft]);

  const customColorCount = draft
    ? [draft.bgColor, draft.textColor, draft.buttonColor, draft.buttonTextColor].filter(Boolean).length
    : 0;

  /*
   * Only pairs where BOTH colours are custom are checked.
   *
   * A custom colour against a theme default is not a real pairing - the theme
   * background is a gradient, so any single number for it would be wrong, and
   * warning on a guess trains people to ignore the warning.
   */
  const contrastWarnings = React.useMemo(() => {
    if (!draft) return [];
    const out: string[] = [];
    if (draft.textColor && draft.bgColor && contrastRatio(draft.textColor, draft.bgColor) < 4.5) {
      out.push('Text is hard to read against the background.');
    }
    if (draft.buttonTextColor && draft.buttonColor
      && contrastRatio(draft.buttonTextColor, draft.buttonColor) < 4.5) {
      out.push('Button text is hard to read against the button.');
    }
    return out;
  }, [draft]);

  const save = async () => {
    if (!draft) return;
    if (!draft.title.trim()) {
      setError('Give the panel a headline.');
      return;
    }
    setBusy(true);
    setError(null);

    const payload = {
      placement: draft.placement,
      title: draft.title.trim(),
      subtitle: draft.subtitle.trim() || undefined,
      ctaLabel: draft.ctaLabel.trim() || undefined,
      ctaLink: draft.ctaLink.trim() || undefined,
      badge: draft.badge.trim() || undefined,
      imageUrl: draft.imageUrl || undefined,
      imageOverlay: draft.imageOverlay,
      theme: draft.theme,
      // Sent as '' rather than omitted: this endpoint replaces the whole
      // panel, so an absent key and a cleared colour must not look the same.
      bgColor: draft.bgColor,
      textColor: draft.textColor,
      buttonColor: draft.buttonColor,
      buttonTextColor: draft.buttonTextColor,
      wide: draft.wide,
      active: draft.active,
    };

    const res = draft.id
      ? await api.admin.updatePromo(draft.id, payload)
      : await api.admin.createPromo(payload);
    setBusy(false);

    if (res.success) {
      setDraft(null);
      onNotice(draft.id ? 'Panel updated.' : 'Panel added.');
      load();
    } else {
      setError(res.error || 'Could not save that panel.');
    }
  };

  const toggleActive = async (p: PromoSlot) => {
    const res = await api.admin.setPromoActive(p.id, !p.active);
    if (res.success) {
      onNotice(p.active ? `"${p.title}" hidden.` : `"${p.title}" is live.`);
      load();
    } else {
      setError(res.error || 'Could not update that panel.');
    }
  };

  /** Swaps a panel with its neighbour and persists the whole section's order. */
  const move = async (index: number, direction: -1 | 1) => {
    const next = [...visible];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];

    // Optimistic: reordering should feel instant, and a failure reloads anyway.
    setPromos((prev) => [
      ...prev.filter((p) => p.placement !== section),
      ...next.map((p, i) => ({ ...p, sortOrder: i })),
    ]);

    const res = await api.admin.reorderPromos(section, next.map((p) => p.id));
    if (!res.success) {
      setError(res.error || 'Could not save the new order.');
      load();
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    const res = await api.admin.deletePromo(deleteTarget.id);
    setBusy(false);
    if (res.success) {
      onNotice(`"${deleteTarget.title}" deleted.`);
      setDeleteTarget(null);
      load();
    } else {
      setError(res.error || 'Could not delete that panel.');
    }
  };

  const pickImage = async (file?: File) => {
    if (!file || !draft) return;
    setImageBusy(true);
    setError(null);
    try {
      const url = await uploadImageFile(file, { maxEdge: BANNER_MAX_EDGE, quality: BANNER_QUALITY, filename: 'promo.webp' });
      setDraft({ ...draft, imageUrl: url });
    } catch (e: any) {
      setError(e?.message || 'Could not process that image.');
    }
    setImageBusy(false);
  };

  /* ------------------------------------------------------------------ */
  const renderPreview = (d: Draft) => {
    // The same resolver the home page uses, so the preview cannot flatter the
    // result - a preview that disagrees with the page is worse than none.
    const look = promoAppearance(d, d.placement === 'CAROUSEL' ? 'carousel' : 'tile');

    if (d.placement === 'CAROUSEL') {
      return (
        <div
          className={`relative rounded-2xl overflow-hidden h-32 ${look.backgroundClass} p-4 flex flex-col justify-center`}
          style={look.panelStyle}
        >
          {d.imageUrl && (
            <>
              <ListingImage src={d.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-[#0b1c30]" style={{ opacity: d.imageOverlay / 100 }} />
            </>
          )}
          <div className="relative z-10">
            <p
              className={`font-extrabold text-base leading-tight line-clamp-1 ${d.textColor ? '' : 'text-white'}`}
              style={d.textColor ? { color: d.textColor } : undefined}
            >
              {d.title || 'Headline'}
            </p>
            {d.subtitle && (
              <p
                className={`text-[11px] mt-1 line-clamp-2 ${d.textColor ? 'opacity-85' : 'text-white/85'}`}
                style={d.textColor ? { color: d.textColor } : undefined}
              >
                {d.subtitle}
              </p>
            )}
            {d.ctaLabel && (
              <span
                className={`inline-block mt-2 px-3 py-1 rounded-full text-[11px] font-bold ${
                  d.buttonColor ? '' : 'bg-white'} ${d.buttonTextColor ? '' : 'text-[#0b1c30]'}`}
                style={look.buttonStyle}
              >
                {d.ctaLabel}
              </span>
            )}
          </div>
        </div>
      );
    }
    const tile = PROMO_THEME_TILE[d.theme];
    return (
      <div
        className={`relative rounded-2xl overflow-hidden h-32 ${
          d.imageUrl && !d.bgColor ? 'bg-[#0b1c30]' : look.backgroundClass
        } p-4 flex flex-col justify-between ${d.wide ? '' : 'max-w-[220px]'}`}
        style={look.panelStyle}
      >
        {d.imageUrl && (
          <>
            <ListingImage src={d.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-[#0b1c30]" style={{ opacity: d.imageOverlay / 100 }} />
          </>
        )}
        <div className="relative z-10 flex items-start justify-between">
          <div className={`p-1.5 rounded-lg ${d.imageUrl ? 'bg-white/20 text-white' : `bg-white/70 ${tile.text}`}`}>
            <Sparkles className="w-4 h-4" />
          </div>
          {d.badge && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/80 text-[#0b1c30]">
              {d.badge}
            </span>
          )}
        </div>
        <div className="relative z-10">
          <p
            className={`text-sm font-bold leading-tight ${
              d.textColor ? '' : d.imageUrl ? 'text-white' : 'text-[#0b1c30]'
            }`}
            style={d.textColor ? { color: d.textColor } : undefined}
          >
            {d.title || 'Tile title'}
          </p>
          {d.subtitle && (
            <p className={`text-[10px] mt-0.5 line-clamp-2 ${d.imageUrl ? 'text-white/80' : 'text-[#737686]'}`}>
              {d.subtitle}
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Home page</h1>
          <p className="text-sm text-slate-500 mt-1">
            Edit the hero carousel and the Special offers tiles. Changes are live immediately —
            no deploy needed.
          </p>
        </div>
        <button
          onClick={() => setDraft(emptyDraft(section))}
          className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold flex items-center gap-1.5 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add panel
        </button>
      </div>

      <ErrorBanner message={error} />

      <div className="flex items-center gap-1">
        {([
          ['CAROUSEL', 'Hero carousel', GalleryHorizontalEnd],
          ['BENTO', 'Special offers', LayoutGrid],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              section === key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            <span className="opacity-60">
              {promos.filter((p) => p.placement === key).length}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-16 justify-center text-slate-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading panels…
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16">
          <ImageOff className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="font-bold text-slate-800">Nothing in this section</h3>
          <p className="text-sm text-slate-500 mt-1">
            {section === 'CAROUSEL'
              ? 'With no slides the hero is hidden entirely.'
              : 'With no tiles the Special offers row is hidden entirely.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((p, i) => (
            <div
              key={p.id}
              className={`border rounded-2xl p-4 transition-opacity ${
                p.active ? 'border-slate-200' : 'border-dashed border-slate-300 opacity-60'
              }`}
            >
              <div className="flex flex-wrap items-start gap-4">
                <div className="w-40 shrink-0">{renderPreview(toDraft(p))}</div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-slate-900">{p.title}</p>
                    {!p.active && (
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold">
                        Hidden
                      </span>
                    )}
                    {p.wide && p.placement === 'BENTO' && (
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold">
                        Wide
                      </span>
                    )}
                  </div>
                  {p.subtitle && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{p.subtitle}</p>
                  )}
                  <p className="text-[11px] text-slate-400 mt-1.5 font-mono">
                    {p.ctaLabel ? `[${p.ctaLabel}] → ` : '→ '}
                    {p.ctaLink || 'no link'}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    title="Move up"
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === visible.length - 1}
                    title="Move down"
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => toggleActive(p)}
                    title={p.active ? 'Hide' : 'Publish'}
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
                  >
                    {p.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => setDraft(toDraft(p))}
                    title="Edit"
                    className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(p)}
                    title="Delete"
                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ------------------------------------------------ create / edit ---- */}
      <Modal
        isOpen={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Edit panel' : 'New panel'}
        subtitle={draft?.placement === 'CAROUSEL' ? 'Hero carousel slide' : 'Special offers tile'}
        footer={
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setDraft(null)} className="btn-ghost !rounded-xl !text-sm">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {draft?.id ? 'Save changes' : 'Add panel'}
            </button>
          </div>
        }
      >
        {draft && (
          <div className="space-y-1">
            <div className="mb-4">{renderPreview(draft)}</div>

            <Field label="Appears in">
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['CAROUSEL', 'Hero carousel'],
                  ['BENTO', 'Special offers'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDraft({ ...draft, placement: key })}
                    className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                      draft.placement === key
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Headline">
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className="input-base text-sm"
                placeholder="Textbook season"
              />
            </Field>

            <Field label="Supporting line (optional)">
              <textarea
                value={draft.subtitle}
                onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
                rows={2}
                className="input-base text-sm resize-none"
                placeholder="Save up to 70% on used course books."
              />
            </Field>

            {draft.placement === 'CAROUSEL' ? (
              <Field label="Button text (optional)" hint="Leave empty for a slide with no button.">
                <input
                  value={draft.ctaLabel}
                  onChange={(e) => setDraft({ ...draft, ctaLabel: e.target.value })}
                  className="input-base text-sm"
                  placeholder="Browse books"
                />
              </Field>
            ) : (
              <Field label="Badge (optional)" hint="Small corner flag, e.g. New or Hot.">
                <input
                  value={draft.badge}
                  onChange={(e) => setDraft({ ...draft, badge: e.target.value })}
                  className="input-base text-sm"
                  placeholder="New"
                />
              </Field>
            )}

            <Field
              label="Links to"
              hint="Must be an in-app path starting with /. External links are not allowed here."
            >
              <input
                value={draft.ctaLink}
                onChange={(e) => setDraft({ ...draft, ctaLink: e.target.value })}
                className="input-base text-sm font-mono"
                placeholder="/browse?type=Food"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {LINK_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setDraft({ ...draft, ctaLink: preset.value })}
                    className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                      draft.ctaLink === preset.value
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Colour theme">
              <div className="flex flex-wrap gap-2">
                {PROMO_THEMES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setDraft({ ...draft, theme: t.value })}
                    className={`w-14 h-9 rounded-lg bg-gradient-to-br ${PROMO_THEME_GRADIENT[t.value]} border-2 transition-all ${
                      draft.theme === t.value ? 'border-slate-900 scale-105' : 'border-transparent'
                    }`}
                    title={t.label}
                  />
                ))}
              </div>
            </Field>

            {/*
              Custom colours, below the themes rather than instead of them.

              The presets are the designed answers and stay one tap away; these
              exist for a campaign that has to match something external - a
              sponsor's brand, a university's colours - which no fixed palette
              can anticipate. Anything left blank follows the theme, so this
              whole section is skippable.
            */}
            <div className="rounded-2xl border border-slate-200 p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-slate-500" />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Custom colours
                </h4>
                {customColorCount > 0 && (
                  <span className="ml-auto text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                    {customColorCount} set
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ColorField
                  label="Background"
                  value={draft.bgColor}
                  onChange={(v) => setDraft({ ...draft, bgColor: v })}
                  fallback={themeDefaults.background}
                  hint="Replaces the theme gradient with a flat colour."
                />
                <ColorField
                  label="Text"
                  value={draft.textColor}
                  onChange={(v) => setDraft({ ...draft, textColor: v })}
                  fallback={themeDefaults.text}
                  hint="Headline, subtitle and badge."
                />
                <ColorField
                  label="Button"
                  value={draft.buttonColor}
                  onChange={(v) => setDraft({ ...draft, buttonColor: v })}
                  fallback={themeDefaults.button}
                />
                <ColorField
                  label="Button text"
                  value={draft.buttonTextColor}
                  onChange={(v) => setDraft({ ...draft, buttonTextColor: v })}
                  fallback={themeDefaults.buttonText}
                />
              </div>

              {/*
                A warning, never a block. Text over a background image is
                legitimately low-contrast against the panel colour underneath
                it, and refusing to save that would be wrong - but white on
                white reaching the home page because nobody checked would be
                worse.
              */}
              {contrastWarnings.length > 0 && (
                <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-[11px] text-amber-900 leading-relaxed">
                    {contrastWarnings.map((w) => <p key={w}>{w}</p>)}
                    <p className="text-amber-700 mt-0.5">
                      You can still save this — check the preview above first.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <Field
              label="Background image (optional)"
              hint="Sits over the colour theme. Compressed automatically before upload."
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickImage(e.target.files?.[0])}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={imageBusy}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {imageBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                  {draft.imageUrl ? 'Replace' : 'Upload'}
                </button>
                {draft.imageUrl && (
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, imageUrl: '' })}
                    className="px-3 py-2 rounded-xl text-red-600 text-sm font-semibold hover:bg-red-50 flex items-center gap-1.5"
                  >
                    <ImageOff className="w-4 h-4" /> Remove
                  </button>
                )}
              </div>
            </Field>

            {draft.imageUrl && (
              <Field
                label={`Darken image (${draft.imageOverlay}%)`}
                hint="Raise this until the text is comfortably readable."
              >
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={draft.imageOverlay}
                  onChange={(e) => setDraft({ ...draft, imageOverlay: Number(e.target.value) })}
                  className="w-full accent-slate-900"
                />
              </Field>
            )}

            <div className="flex flex-wrap items-center gap-4 pt-1">
              {draft.placement === 'BENTO' && (
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.wide}
                    onChange={(e) => setDraft({ ...draft, wide: e.target.checked })}
                    className="w-4 h-4 accent-slate-900"
                  />
                  Double width
                </label>
              )}
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                  className="w-4 h-4 accent-slate-900"
                />
                Visible on the home page
              </label>
            </div>
          </div>
        )}
      </Modal>

      {/* ------------------------------------------------------- delete ---- */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete this panel?"
        subtitle={deleteTarget?.title}
        footer={
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setDeleteTarget(null)} className="btn-ghost !rounded-xl !text-sm">
              Keep it
            </button>
            <button
              onClick={remove}
              disabled={busy}
              className="px-4 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete
            </button>
          </div>
        }
      >
        <p className="text-xs text-slate-600">
          This cannot be undone. If you only want it off the home page for now, hide it instead —
          the eye icon — and it keeps its content and position.
        </p>
      </Modal>
    </div>
  );
};
