import React from 'react';
import { X, AlertCircle, CheckCircle2 } from 'lucide-react';

/** Shared shell so every dialog in the app looks and behaves the same. */
export const Modal: React.FC<{
  isOpen: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ isOpen, title, subtitle, onClose, children, footer }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#213145]/50 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-modal border border-[#e5eeff] max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h3 className="text-lg font-bold text-[#0b1c30]">{title}</h3>
            {subtitle && <p className="text-xs text-[#737686] mt-1">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 -mr-2 -mt-1 text-[#737686] hover:text-[#0b1c30] rounded-full hover:bg-[#f8f9ff]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="p-6 pt-4 border-t border-[#e5eeff] mt-4">{footer}</div>}
      </div>
    </div>
  );
};

export const ErrorBanner: React.FC<{ message?: string | null }> = ({ message }) =>
  message ? (
    <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2.5">
      <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
      <p className="text-xs text-red-700 font-semibold">{message}</p>
    </div>
  ) : null;

export const SuccessBanner: React.FC<{ message?: string | null }> = ({ message }) =>
  message ? (
    <div className="mb-4 flex items-start gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5">
      <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
      <p className="text-xs text-emerald-800 font-medium">{message}</p>
    </div>
  ) : null;

export const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({
  label,
  children,
  hint,
}) => (
  <div className="mb-4">
    <label className="block text-xs font-semibold text-[#434655] mb-1.5">{label}</label>
    {children}
    {hint && <p className="mt-1 text-[11px] text-[#737686]">{hint}</p>}
  </div>
);
