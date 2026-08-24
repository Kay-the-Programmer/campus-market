import React from 'react';
import { X } from 'lucide-react';

/**
 * One applied filter, removable on its own.
 *
 * Shared by the search results page and the browse feed so both express
 * "what is narrowing this" the same way. The whole pill is the remove target
 * rather than just the ×: a 12px icon is a poor tap target on a phone, and
 * there is nothing else the pill could usefully do when pressed.
 */
export const FilterPill: React.FC<{ label: string; onRemove: () => void }> = ({
  label,
  onRemove,
}) => (
  <button
    onClick={onRemove}
    // The visible label is the filter's value ("Service", "Upschool"), which
    // says nothing about what pressing it does - so the accessible name says.
    aria-label={`Remove filter: ${label}`}
    className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#eff4ff] border border-[#dbe1ff] text-[#2563eb] text-[11px] font-bold hover:bg-[#dbe1ff] transition-colors"
  >
    {label}
    <X className="w-3 h-3" />
  </button>
);
