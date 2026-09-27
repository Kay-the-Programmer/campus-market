import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bold, Eye, Italic, Pencil } from 'lucide-react';
import { BlockSize } from '../../utils/richText';
import {
  ActiveMarks,
  Mark,
  TextSelection,
  activeMarks,
  blockSizeAt,
  setBlockSize,
  toggleMark,
} from '../../utils/richTextEdit';
import { RichText } from './RichText';

/**
 * A textarea with a bold / italic / size toolbar, for seller-written text.
 *
 * It stays a plain textarea rather than becoming a contenteditable rich editor.
 * That keeps the value a string the parent already knows how to handle - no
 * separate document model to serialise, no HTML to sanitise - and it means the
 * seller can still see and correct the markers by hand, which matters when they
 * paste text in from somewhere else.
 *
 * The cost of markers in a textarea is that "**tough** seller" does not look
 * like the finished thing, so the Preview toggle is part of the feature rather
 * than a nicety.
 */

const SIZE_OPTIONS: { size: BlockSize; label: string; hint: string }[] = [
  { size: 'normal', label: 'Normal', hint: 'Normal text size' },
  { size: 'medium', label: 'Medium', hint: 'Medium heading for this line' },
  { size: 'large', label: 'Large', hint: 'Large heading for this line' },
];

interface FormattedTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  id?: string;
  /** Shown under the toolbar; falls back to a short how-to. */
  hint?: React.ReactNode;
}

export const FormattedTextarea: React.FC<FormattedTextareaProps> = ({
  value,
  onChange,
  placeholder,
  rows = 5,
  maxLength,
  id,
  hint,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  /** What the toolbar should currently show as active. */
  const [toolbar, setToolbar] = useState<{ marks: ActiveMarks; size: BlockSize }>({
    marks: { bold: false, italic: false },
    size: 'normal',
  });
  const { marks, size: lineSize } = toolbar;

  /**
   * A selection to restore once React has re-rendered with the new value.
   * Applying a marker moves the text under the caret, and without this the
   * caret would jump to the end of the box on every button press.
   */
  const pendingSelection = useRef<[number, number] | null>(null);

  /**
   * Recompute the toolbar's active state from wherever the caret is now.
   *
   * Returning the existing object when nothing changed matters: this runs on
   * every caret move and every keystroke, and a fresh object each time would
   * re-render the editor on arrow keys for no visible reason.
   */
  const syncToolbar = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const selection: TextSelection = { value: el.value, start: el.selectionStart, end: el.selectionEnd };
    const next = { marks: activeMarks(selection), size: blockSizeAt(el.value, el.selectionStart) };
    setToolbar((current) =>
      current.size === next.size
        && current.marks.bold === next.marks.bold
        && current.marks.italic === next.marks.italic
        ? current
        : next,
    );
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    const pending = pendingSelection.current;
    if (!el || !pending) return;
    pendingSelection.current = null;
    // Only pull focus back if something else took it - a toolbar button reached
    // by keyboard, say. Clicking one cannot, because mousedown is prevented, and
    // re-focusing an already-focused field just fires events for no reason.
    if (document.activeElement !== el) el.focus();
    el.setSelectionRange(pending[0], pending[1]);
    syncToolbar();
  }, [value, syncToolbar]);

  /** Run one of the richTextEdit transforms against the live selection. */
  const transform = useCallback(
    (fn: (selection: TextSelection) => TextSelection) => {
      const el = textareaRef.current;
      if (!el) return;
      const next = fn({ value: el.value, start: el.selectionStart, end: el.selectionEnd });

      if (next.value === el.value) {
        // Nothing to re-render, so the effect above will not fire - put the
        // selection back here instead.
        el.setSelectionRange(next.start, next.end);
        syncToolbar();
        return;
      }
      if (maxLength !== undefined && next.value.length > maxLength) return;

      pendingSelection.current = [next.start, next.end];
      onChange(next.value);
    },
    [maxLength, onChange, syncToolbar],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    const key = event.key.toLowerCase();
    if (key !== 'b' && key !== 'i') return;
    event.preventDefault();
    transform((selection) => toggleMark(selection, key === 'b' ? 'bold' : 'italic'));
  };

  const markButton = (mark: Mark, Icon: typeof Bold, label: string, shortcut: string) => (
    <button
      type="button"
      // Without this the textarea blurs on mousedown and some browsers drop the
      // selection before the click lands, so the marker wraps nothing.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => transform((selection) => toggleMark(selection, mark))}
      aria-pressed={marks[mark]}
      // There is no caret to act on while the preview is up, so the buttons say
      // so rather than looking live and doing nothing.
      disabled={preview}
      title={`${label} (${shortcut})`}
      aria-label={`${label} (${shortcut})`}
      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-default ${
        marks[mark]
          ? 'bg-blue-600 text-white shadow-sm'
          : 'text-slate-600 enabled:hover:bg-white enabled:hover:text-slate-900'
      }`}
    >
      <Icon className="w-4 h-4" />
    </button>
  );

  return (
    <div>
      {/* Wraps rather than clips: the full row is a few pixels too wide for a
          375px phone, and the control that would fall off the end is the one
          that explains what the markers mean. */}
      <div className="flex flex-wrap items-center gap-1 p-1.5 rounded-t-xl bg-slate-100 border border-slate-200 border-b-0">
        {markButton('bold', Bold, 'Bold', 'Ctrl+B')}
        {markButton('italic', Italic, 'Italic', 'Ctrl+I')}

        <span aria-hidden="true" className="hidden sm:block w-px h-6 bg-slate-300 mx-1" />

        {/* On a phone the whole row will not fit, so the size buttons take a
            line of their own rather than wrapping raggedly around Preview. */}
        <div
          className="flex items-center gap-0.5 order-last w-full sm:order-none sm:w-auto"
          role="group"
          aria-label="Text size"
        >
          {SIZE_OPTIONS.map(({ size, label, hint: sizeHint }) => (
            <button
              key={size}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => transform((selection) => setBlockSize(selection, size))}
              aria-pressed={lineSize === size}
              disabled={preview}
              title={sizeHint}
              className={`px-2.5 h-9 rounded-lg text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-default ${
                lineSize === size
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 enabled:hover:bg-white enabled:hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setPreview((on) => !on)}
          aria-pressed={preview}
          aria-label={preview ? 'Back to editing' : 'Preview formatting'}
          className="ml-auto inline-flex items-center gap-1.5 px-2.5 h-9 rounded-lg text-xs font-bold text-slate-600 hover:bg-white hover:text-slate-900 transition-all"
        >
          {preview ? <Pencil className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {preview ? 'Edit' : 'Preview'}
        </button>
      </div>

      {preview ? (
        <div
          className="w-full px-4 py-3 rounded-b-xl bg-white border border-slate-200 text-slate-600 text-sm leading-relaxed"
          style={{ minHeight: `${rows * 1.5 + 1.5}rem` }}
        >
          {value.trim() ? (
            <RichText value={value} />
          ) : (
            <span className="text-slate-400">Nothing to preview yet.</span>
          )}
        </div>
      ) : (
        <textarea
          id={id}
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onKeyUp={syncToolbar}
          onSelect={syncToolbar}
          onClick={syncToolbar}
          onFocus={syncToolbar}
          rows={rows}
          maxLength={maxLength}
          placeholder={placeholder}
          className="w-full px-4 py-3 rounded-b-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
        />
      )}

      <div className="flex items-start justify-between gap-3 mt-1.5">
        <p className="text-[11px] text-slate-400 leading-snug">
          {hint ?? 'Select some text, then tap B or I. Size applies to the whole line.'}
        </p>
        {maxLength !== undefined && (
          <span className="text-[10px] text-slate-400 font-medium shrink-0">
            {value.length}/{maxLength}
          </span>
        )}
      </div>
    </div>
  );
};
