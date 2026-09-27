import React, { useId, useEffect, useState } from 'react';
import { RotateCcw, Pipette } from 'lucide-react';

interface ColorFieldProps {
  label: string;
  /** "#rrggbb", or '' to inherit the theme. */
  value: string;
  onChange: (value: string) => void;
  /** Shown in the swatch and the placeholder when nothing is set. */
  fallback: string;
  hint?: string;
  /** Quick-pick swatches. Usually the theme palette plus black and white. */
  presets?: { value: string; label: string }[];
}

/** Complete six-digit hex, which is the only form the API and database accept. */
const FULL_HEX = /^#[0-9a-fA-F]{6}$/;

/** Chrome's screen colour picker. Absent in Safari and Firefox, so optional. */
function eyeDropper(): { open: () => Promise<{ sRGBHex: string }> } | null {
  const ctor = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
  return ctor ? new ctor() : null;
}

/**
 * One colour, pickable several ways.
 *
 * <p>The swatch, the code box and the presets are the same value: designers
 * reach for the picker, anyone working to a brand sheet has the code already
 * and wants to paste it, and most panels only ever want one of a handful of
 * colours. Offering one route makes the other two people do arithmetic.
 *
 * <p>The text box keeps its own draft state rather than writing straight
 * through. A controlled input that normalises on every keystroke fights the
 * person typing - "#2563eb" passes through "#2", "#25", "#256", none of which
 * are colours - so the draft is committed only once it is a complete hex, and
 * reverted on blur if it never becomes one.
 */
export const ColorField: React.FC<ColorFieldProps> = ({
  label, value, onChange, fallback, hint, presets,
}) => {
  const [draft, setDraft] = useState(value);
  const hexId = useId();
  const [dropper] = useState(() => (typeof window === 'undefined' ? null : eyeDropper()));

  // Reset, a preset, or a change from the picker all have to reach the box.
  useEffect(() => { setDraft(value); }, [value]);

  const effective = value || fallback;
  const isSet = Boolean(value);

  const commit = (raw: string) => {
    const next = raw.trim();
    // Typing the six digits without the "#" is the commonest way to paste a
    // brand colour; accepting it is free.
    const withHash = next && !next.startsWith('#') ? `#${next}` : next;
    if (withHash === '') {
      onChange('');
      return;
    }
    if (FULL_HEX.test(withHash)) {
      onChange(withHash.toLowerCase());
    }
  };

  const pickFromScreen = async () => {
    if (!dropper) return;
    try {
      const { sRGBHex } = await dropper.open();
      onChange(sRGBHex.toLowerCase());
    } catch {
      // Cancelling the eyedropper rejects. That is not an error.
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        {/* htmlFor, not a bare <label>: the picker below owns the aria-label,
            so without this the code box is unlabelled to a screen reader. */}
        <label htmlFor={hexId} className="block text-xs font-semibold text-slate-700">
          {label}
        </label>
        {isSet && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Use theme
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/*
          The native picker. Wrapped in a label with the input on top but
          transparent, because <input type="color"> cannot be styled - every
          browser draws its own chrome - and the swatch has to match this form.
          focus-within is what keeps it keyboard-visible: the input doing the
          focusing has no opacity of its own to show a ring on.
        */}
        <label
          className="relative w-10 h-10 rounded-xl border border-slate-300 shrink-0 cursor-pointer overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-1"
          style={{ backgroundColor: effective }}
          title={`Pick ${label.toLowerCase()}`}
        >
          <input
            type="color"
            value={effective}
            onChange={(e) => onChange(e.target.value.toLowerCase())}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label={`${label} colour picker`}
          />
        </label>

        <input
          id={hexId}
          type="text"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}
          // Replacing a colour is far commoner than editing one digit of it.
          onFocus={(e) => e.target.select()}
          // A half-typed value is not an error worth keeping on screen once
          // the field is left; snap back to what is actually saved.
          onBlur={() => setDraft(value)}
          placeholder={fallback}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
        />

        {/* Progressive enhancement: Chrome only, and the whole point is
            matching a colour that lives outside this form - a sponsor's logo
            sitting in another window. */}
        {dropper && (
          <button
            type="button"
            onClick={pickFromScreen}
            title="Pick a colour from anywhere on screen"
            aria-label={`Pick ${label.toLowerCase()} from screen`}
            className="w-9 h-9 shrink-0 rounded-xl border border-slate-300 text-slate-500 hover:text-slate-800 hover:border-slate-400 flex items-center justify-center transition-colors"
          >
            <Pipette className="w-4 h-4" />
          </button>
        )}
      </div>

      {presets && presets.length > 0 && (
        <div className="flex items-center gap-1.5 mt-2">
          {presets.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange(p.value)}
              title={p.label}
              aria-label={`${label}: ${p.label}`}
              className={`w-5 h-5 rounded-md border transition-transform hover:scale-110 ${
                value === p.value ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-300'
              }`}
              style={{ backgroundColor: p.value }}
            />
          ))}
        </div>
      )}

      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
      {!isSet && (
        <p className="text-[11px] text-slate-400 mt-1">
          Following the theme. Pick a colour to override it.
        </p>
      )}
    </div>
  );
};
