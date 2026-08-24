import React, { useEffect, useRef, useState } from 'react';
import {
  Plus, Pencil, Trash2, Eye, EyeOff, ArrowUp, ArrowDown, Loader2,
  ImagePlus, ImageOff, Sparkles, LayoutGrid, GalleryHorizontalEnd,
} from 'lucide-react';
import {
  PromoSlot, PromoPlacement, PromoTheme,
  PROMO_THEMES, PROMO_THEME_GRADIENT, PROMO_THEME_TILE,
} from '../../types';
import { api } from '../../services/api';
import { Modal, ErrorBanner, Field } from '../shared/Modal';

/*
 * Banners are decorative and full-bleed, so they are compressed harder than
 * listing photos: this image ships to every visitor on the busiest page, and
 * a crisp 1600px original would dominate the payload for no visible gain.
 */
const MAX_DIMENSION = 1280;
const IMAGE_QUALITY = 0.8;

function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('That file is not an image we can read.'));
    };
    img.onload = () => {
      const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');

      URL.revokeObjectURL(objectUrl);

      if (!ctx) {
        reject(new Error('Could not process that image.'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(async (blob) => {
        if (!blob) {
          reject(new Error('Could not process that image.'));
          return;
        }
        const res = await api.uploads.image(blob, 'promo.webp');
        if (res.ok && res.url) {
          resolve(res.url);
        } else {
          reject(new Error(res.error || 'Could not upload that image.'));
        }
      }, 'image/webp', IMAGE_QUALITY);
    };
    img.src = objectUrl;
  });
}

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
  wide: p.wide,
  active: p.active,
});

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
      const url = await compressImageFile(file);
      setDraft({ ...draft, imageUrl: url });
    } catch (e: any) {
      setError(e?.message || 'Could not process that image.');
    }
    setImageBusy(false);
  };

  /* ------------------------------------------------------------------ */
  const renderPreview = (d: Draft) => {
    if (d.placement === 'CAROUSEL') {
      return (
        <div
          className={`relative rounded-2xl overflow-hidden h-32 bg-gradient-to-br ${PROMO_THEME_GRADIENT[d.theme]} p-4 flex flex-col justify-center`}
        >
          {d.imageUrl && (
            <>
              <img src={d.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-[#0b1c30]" style={{ opacity: d.imageOverlay / 100 }} />
            </>
          )}
          <div className="relative z-10">
            <p className="text-white font-extrabold text-base leading-tight line-clamp-1">
              {d.title || 'Headline'}
            </p>
            {d.subtitle && (
              <p className="text-white/85 text-[11px] mt-1 line-clamp-2">{d.subtitle}</p>
            )}
            {d.ctaLabel && (
              <span className="inline-block mt-2 px-3 py-1 rounded-full bg-white text-[#0b1c30] text-[11px] font-bold">
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
        className={`relative rounded-2xl overflow-hidden h-32 ${d.imageUrl ? 'bg-[#0b1c30]' : tile.bg} p-4 flex flex-col justify-between ${d.wide ? '' : 'max-w-[220px]'}`}
      >
        {d.imageUrl && (
          <>
            <img src={d.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
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
          <p className={`text-sm font-bold leading-tight ${d.imageUrl ? 'text-white' : 'text-[#0b1c30]'}`}>
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
