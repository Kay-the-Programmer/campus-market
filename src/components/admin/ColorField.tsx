import React, { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';

interface ColorFieldProps {
  label: string;
  /** "#rrggbb", or '' to inherit the theme. */
  value: string;
  onChange: (value: string) => void;
  /** Shown in the swatch and the placeholder when nothing is set. */
  fallback: string;
  hint?: string;
}

/** Complete six-digit hex, which is the only form the API and database accept. */
const FULL_HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * One colour, pickable two ways.
 *
 * <p>The swatch and the text box are the same value: designers reach for the
 * picker, and anyone working to a brand sheet has the code already and wants
 * to paste it. Offering only one of the two makes the other person do
 * arithmetic.
 *
 * <p>The text box keeps its own draft state rather than writing straight
 * through. A controlled input that normalises on every keystroke fights the
 * person typing - "#2563eb" passes through "#2", "#25", "#256", none of which
 * are colours - so the draft is committed only once it is a complete hex, and
 * reverted on blur if it never becomes one.
 */
export const ColorField: React.FC<ColorFieldProps> = ({
  label, value, onChange, fallback, hint,
}) => {
  const [draft, setDraft] = useState(value);

  // Reset, or a change from the picker, has to reach the text box.
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

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-xs font-semibold text-slate-700">{label}</label>
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
          The native picker. Wrapped in a label with the input visually on top
          but transparent, because <input type="color"> cannot be styled - every
          browser draws its own chrome - and the swatch has to match the rest of
          this form.
        */}
        <label
          className="relative w-10 h-10 rounded-xl border border-slate-300 shrink-0 cursor-pointer overflow-hidden"
          style={{ backgroundColor: effective }}
          title={`Pick ${label.toLowerCase()}`}
        >
          <input
            type="color"
            value={effective}
            onChange={(e) => onChange(e.target.value.toLowerCase())}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label={label}
          />
        </label>

        <input
          type="text"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}
          // A half-typed value is not an error worth keeping on screen once
          // the field is left; snap back to what is actually saved.
          onBlur={() => setDraft(value)}
          placeholder={fallback}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
        />
      </div>

      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
      {!isSet && (
        <p className="text-[11px] text-slate-400 mt-1">
          Following the theme. Pick a colour to override it.
        </p>
      )}
    </div>
  );
};
