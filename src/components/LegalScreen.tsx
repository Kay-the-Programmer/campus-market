import React from 'react';
import { ShieldCheck, ArrowLeft, Lock, FileText, CheckCircle2 } from 'lucide-react';

interface LegalScreenProps {
  onBack: () => void;
}

export const LegalScreen: React.FC<LegalScreenProps> = ({ onBack }) => {
  return (
    <div className="min-h-screen bg-[#f8f9ff] py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-slate-600 hover:text-blue-600 transition-colors font-medium text-sm mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="bg-white border border-slate-200/80 rounded-3xl p-8 sm:p-12 shadow-xs space-y-8">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Legal & Campus Marketplace Policies
              </h1>
              <p className="text-sm text-slate-500">
                Terms of Use, Student Verification & Community Safety Guidelines
              </p>
            </div>
          </div>

          <div className="space-y-6 text-slate-700 text-sm leading-relaxed">
            <section className="space-y-2">
              <h2 className="text-lg font-bold text-slate-900">1. Student-Only Verified Membership</h2>
              <p>
                CampusMarket is exclusively restricted to currently enrolled students, faculty, and staff with a verified university email address (.edu). Accounts cannot be transferred or sold to unaffiliated parties.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-bold text-slate-900">2. Role-Based Access & Moderation Policy</h2>
              <p>
                To maintain a safe peer-to-peer exchange, all users are subject to CampusMarket's Role-Based Access Control (RBAC) rules. Admins reserve the right to remove prohibited listings, suspend accounts, or permanently ban violators without prior notice.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-bold text-slate-900">3. Direct Peer-to-Peer Transactions</h2>
              <p>
                CampusMarket provides the communication and discovery platform. 100% of the item price remains between the student buyer and seller. We recommend meeting in well-lit, public campus locations during daylight hours.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-bold text-slate-900">4. Privacy & Sensitive Contact Protection</h2>
              <p>
                In compliance with student privacy standards, sensitive contact information (email, phone number, dorm address) is automatically hidden from unauthenticated guests and is only shared with verified peers during active transactions.
              </p>
            </section>
          </div>

          <div className="border-t border-slate-100 pt-6 flex items-center justify-between text-xs text-slate-400">
            <span>© 2026 CampusMarket Student Exchange</span>
            <span className="flex items-center gap-1 text-emerald-600 font-semibold">
              <ShieldCheck className="w-4 h-4" />
              100% Campus Safe
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
