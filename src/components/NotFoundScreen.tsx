import React from 'react';
import { AlertCircle, ArrowLeft, Home, Search } from 'lucide-react';

interface NotFoundScreenProps {
  onBackHome: () => void;
}

export const NotFoundScreen: React.FC<NotFoundScreenProps> = ({ onBackHome }) => {
  return (
    <div className="min-h-screen bg-[#f8f9ff] flex items-center justify-center p-6">
      <div className="bg-white border border-slate-200/80 rounded-3xl p-10 max-w-md w-full text-center shadow-xs">
        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 mb-2">404</h1>
        <h2 className="text-lg font-bold text-slate-800 mb-2">Page Not Found</h2>
        <p className="text-sm text-slate-500 mb-8 leading-relaxed">
          The CampusMarket page or route you requested does not exist or has been removed.
        </p>
        <button
          onClick={onBackHome}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm transition-colors flex items-center justify-center space-x-2"
        >
          <Home className="w-4 h-4" />
          <span>Return to Campus Feed</span>
        </button>
      </div>
    </div>
  );
};
