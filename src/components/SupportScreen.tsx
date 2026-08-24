import React, { useState } from 'react';
import {
  ShieldCheck,
  Search,
  MessageSquare,
  HelpCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Send,
  Lock,
  Star,
  Zap,
  UserCheck
} from 'lucide-react';
import { AuthSession, FAQItem } from '../types';
import { useToast } from './shared/ToastProvider';

/**
 * Help-page copy, kept here rather than fetched.
 *
 * <p>These are not stand-ins for data the API should be serving - there is no
 * FAQ endpoint because there is nothing dynamic about them. They are the site's
 * own words about how it works, which belong with the screen that says them.
 * They moved out of the old mock-data module so that module could be deleted
 * along with the fictional listings it also held.
 */
const FAQS: FAQItem[] = [
  {
    id: 'faq-1',
    question: 'How do I report a scam or suspicious listing?',
    answer: 'Use the "Report this listing" button on the listing detail screen, or contact our Campus Marketplace Manager directly through the Support tab. Our moderation team reviews flagged listings within 2 hours.',
    category: 'Safety',
  },
  {
    id: 'faq-2',
    question: 'What are the recommended campus pickup locations?',
    answer: 'We recommend meeting in well-lit, high-traffic campus spots during daylight hours: Student Union lobby, Main Campus Library entrance, or designated Student Centers.',
    category: 'Safety',
  },
  {
    id: 'faq-3',
    question: 'How do I edit or delete my listing?',
    answer: 'Go to your Profile > My Listings, select any Active listing you posted, and tap "Edit" or "Mark as Sold". You can also remove draft listings anytime.',
    category: 'Selling',
  },
  {
    id: 'faq-4',
    question: 'Is there a fee for selling on CampusMarket?',
    answer: 'No! CampusMarket is 100% free for verified students. 100% of the item price stays between student buyers and sellers.',
    category: 'General',
  },
];

interface SupportScreenProps {
  onBackToBrowse: () => void;
  /** Prefills the contact form with whoever is actually signed in. */
  currentUser?: AuthSession;
}

export const SupportScreen: React.FC<SupportScreenProps> = ({
  onBackToBrowse,
  currentUser,
}) => {
  const toast = useToast();
  const [activeFaqId, setActiveFaqId] = useState<string | null>(FAQS[0].id);
  /*
   * The signed-in person, or empty for a guest to fill in.
   *
   * These two boxes arrived prefilled with "Alex Rivera / alex.rivera@campus.edu"
   * for everybody - a name out of the old fixture file, sitting in a form whose
   * whole purpose is to tell us who is asking. Anyone who did not notice would
   * have sent us somebody else's details.
   */
  const [fullName, setFullName] = useState(
    currentUser && currentUser.role !== 'guest' ? currentUser.name : '',
  );
  const [email, setEmail] = useState(
    currentUser && currentUser.role !== 'guest' ? currentUser.email : '',
  );
  const [subject, setSubject] = useState('Account Issue');
  const [message, setMessage] = useState('');
  const [isSent, setIsSent] = useState(false);

  const toggleFaq = (id: string) => {
    setActiveFaqId(activeFaqId === id ? null : id);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setIsSent(true);
    setTimeout(() => {
      toast.success('Message sent. Our campus team replies within 24 hours.');
      setMessage('');
      setIsSent(false);
    }, 600);
  };

  return (
    <div className="min-h-screen bg-[#f8f9ff] pb-28">
      {/* Secondary Top Navigation matching screen 10 */}
      <div className="bg-white border-b border-slate-200/80 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-6 text-sm font-semibold">
            <button
              onClick={onBackToBrowse}
              className="text-slate-500 hover:text-slate-800 transition-colors"
            >
              Explore
            </button>
            <button
              onClick={() => toast.info('Activity history is coming soon.')}
              className="text-slate-500 hover:text-slate-800 transition-colors"
            >
              Activity
            </button>
            <span className="text-blue-600 border-b-2 border-blue-600 pb-1">
              Help Center
            </span>
          </div>

          {/* Search Help */}
          <div className="relative hidden sm:block w-64">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search help..."
              className="w-full pl-9 pr-3 py-2 rounded-full bg-slate-100 text-xs font-medium text-slate-800 outline-hidden"
            />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6">
        {/* Sub-nav links matching screen 10 */}
        <div className="flex items-center space-x-6 border-b border-slate-200/80 pb-3 mb-8 text-xs sm:text-sm font-semibold">
          <a href="#about" className="text-blue-600 border-b-2 border-blue-600 pb-2">
            About CampusMarket
          </a>
          <a href="#how-it-works" className="text-slate-500 hover:text-slate-800">
            How It Works
          </a>
          <a href="#safety-tips" className="text-slate-500 hover:text-slate-800">
            Safety Tips
          </a>
          <a href="#faqs" className="text-slate-500 hover:text-slate-800">
            FAQs
          </a>
        </div>

        {/* Hero Banner matching screen 10 */}
        <div className="bg-blue-600 rounded-3xl p-8 sm:p-12 text-white shadow-xl relative overflow-hidden mb-8">
          <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/30 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
          <div className="max-w-2xl relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mb-4 backdrop-blur-xs">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight">
              Empowering the campus community through safe, student-to-student exchange.
            </h1>
            <p className="text-blue-100 text-sm sm:text-base mt-3 leading-relaxed">
              We built CampusMarket to bridge the gap between dorm rooms and lecture halls, creating a frictionless secondary market where value stays within the student body.
            </p>
          </div>
        </div>

        {/* Origins & Sustainable Future matching screen 10 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-12" id="about">
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs">
            <h3 className="text-lg font-bold text-blue-600 mb-2">Our Origins</h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              CampusMarket began as a small discord server for a handful of seniors looking to sell their furniture before graduation. We quickly realized that students needed a more robust, secure, and centralized hub that didn't rely on generic social media platforms prone to spam and non-campus outsiders.
            </p>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs">
            <h3 className="text-lg font-bold text-blue-600 mb-2">
              Sustainable Future
            </h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              Every textbook resold and every mini-fridge passed down contributes to a more sustainable campus ecosystem. Our goal is to minimize waste and maximize student savings by ensuring that every functional item finds a second life right here on campus grounds.
            </p>
          </div>
        </div>

        {/* How It Works matching screen 10 */}
        <div className="text-center mb-12" id="how-it-works">
          <h2 className="text-2xl font-extrabold text-slate-900">How It Works</h2>
          <p className="text-sm text-slate-500 mt-1">
            Simple, secure, and student-focused commerce in four easy steps.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
              <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3 font-bold">
                1
              </div>
              <h4 className="font-bold text-slate-900 text-sm">List your item</h4>
              <p className="text-xs text-slate-500 mt-1">
                Take a few photos and set your price in seconds.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
              <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3 font-bold">
                2
              </div>
              <h4 className="font-bold text-slate-900 text-sm">Chat with buyers</h4>
              <p className="text-xs text-slate-500 mt-1">
                Use our secure in-app messaging to negotiate details.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
              <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3 font-bold">
                3
              </div>
              <h4 className="font-bold text-slate-900 text-sm">Meet on campus</h4>
              <p className="text-xs text-slate-500 mt-1">
                Exchange items safely at designated student centers.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
              <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3 font-bold">
                4
              </div>
              <h4 className="font-bold text-slate-900 text-sm">Complete deal</h4>
              <p className="text-xs text-slate-500 mt-1">
                Mark as sold and rate your experience for the community.
              </p>
            </div>
          </div>

          {/* Handshake Photo Banner matching screen 10 */}
          <div className="mt-8 rounded-3xl overflow-hidden aspect-16/7 max-w-4xl mx-auto shadow-md border border-slate-200">
            <img
              src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200&auto=format&fit=crop&q=80"
              alt="Students meeting on campus"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Community Safety Tips matching screen 10 */}
        <div
          className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs mb-12"
          id="safety-tips"
        >
          <div className="flex items-center space-x-3 mb-5">
            <div className="p-2.5 rounded-xl bg-blue-600 text-white">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900">
                Community Safety Tips
              </h3>
              <p className="text-xs text-slate-500">
                Your security is our top priority. Follow these guidelines for a safe trade.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex items-start space-x-3 text-sm">
              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                1
              </div>
              <div>
                Meet in public campus locations (e.g.,{' '}
                <span className="font-bold text-slate-900">Student Union, Library</span>
                ) during daylight hours.
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex items-start space-x-3 text-sm">
              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                2
              </div>
              <div>
                Don't pay before seeing and inspecting the item in person.{' '}
                <span className="font-bold text-slate-900">Verify quality</span>{' '}
                first.
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex items-start space-x-3 text-sm">
              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                3
              </div>
              <div>
                Bring a friend along or{' '}
                <span className="font-bold text-slate-900">let someone know</span>{' '}
                your exact meeting details and time.
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex items-start space-x-3 text-sm">
              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                4
              </div>
              <div>
                Trust your instincts—if a deal feels off or too good to be true,{' '}
                <span className="font-bold text-slate-900">walk away</span>.
              </div>
            </div>
          </div>
        </div>

        {/* FAQs and Contact Support Grid matching screen 10 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16" id="faqs">
          {/* FAQ Accordion */}
          <div>
            <h3 className="text-xl font-extrabold text-slate-900 mb-4">
              Frequently Asked Questions
            </h3>

            <div className="space-y-3">
              {FAQS.map((faq) => {
                const isOpen = activeFaqId === faq.id;
                return (
                  <div
                    key={faq.id}
                    className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-2xs"
                  >
                    <button
                      onClick={() => toggleFaq(faq.id)}
                      className="w-full p-4 text-left flex items-center justify-between font-bold text-slate-900 hover:text-blue-600 transition-colors"
                    >
                      <span>{faq.question}</span>
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-blue-600 shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 text-xs sm:text-sm text-slate-600 border-t border-slate-100 pt-3">
                        {faq.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Send us a Message Contact Form matching screen 10 */}
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs">
            <div className="flex items-center space-x-3 mb-5">
              <div className="p-2.5 rounded-xl bg-blue-600 text-white">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Send us a Message
                </h3>
                <p className="text-xs text-slate-500">
                  Need a hand with your transaction or found a bug? We're here to help.
                </p>
              </div>
            </div>

            <form onSubmit={handleSendMessage} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-800 text-sm font-medium outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  University Email
                </label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-500 text-sm font-medium outline-hidden"
                />
                <span className="text-[11px] text-slate-400 block mt-1">
                  Email is locked to your verified campus account.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Subject
                </label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-800 text-sm font-medium bg-white outline-hidden"
                >
                  <option value="Account Issue">Account Issue</option>
                  <option value="Listing Report">Report Suspicious Listing</option>
                  <option value="Safety Dispute">Safety & Dispute Support</option>
                  <option value="General Question">General Feedback</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Message
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  placeholder="How can we help you today?"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-800 text-sm font-medium outline-hidden resize-none"
                ></textarea>
              </div>

              <button
                type="submit"
                disabled={isSent}
                className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition-colors flex items-center justify-center space-x-2"
              >
                <span>{isSent ? 'Sending...' : 'Send Message'}</span>
                {!isSent && <span className="text-base">→</span>}
              </button>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-center">
                <div className="p-2 rounded-xl bg-slate-50">
                  <span className="text-[10px] uppercase text-slate-400 font-bold block">
                    Response Time
                  </span>
                  <span className="text-xs font-bold text-slate-700">
                    &lt; 24 Hours
                  </span>
                </div>
                <div className="p-2 rounded-xl bg-slate-50">
                  <span className="text-[10px] uppercase text-slate-400 font-bold block">
                    Status
                  </span>
                  <span className="text-xs font-bold text-emerald-600 flex items-center justify-center">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5"></span>
                    Systems Live
                  </span>
                </div>
              </div>
            </form>
          </div>
        </div>

        {/* Safety & Verification 4 Cards matching screen 10 bottom */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 text-center shadow-2xs">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2 font-bold">
              <UserCheck className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-900 text-sm">ID Verification</h4>
            <p className="text-xs text-slate-500 mt-1">
              Every user is verified via .edu email to ensure a safe student-only network.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 text-center shadow-2xs">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2 font-bold">
              <Lock className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-900 text-sm">Secure Chats</h4>
            <p className="text-xs text-slate-500 mt-1">
              All communications are encrypted and monitored for scam keywords.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 text-center shadow-2xs">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2 font-bold">
              <Star className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-900 text-sm">Peer Ratings</h4>
            <p className="text-xs text-slate-500 mt-1">
              Our transparent rating system helps you choose reliable trading partners.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 text-center shadow-2xs">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2 font-bold">
              <Zap className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-900 text-sm">Fast Response</h4>
            <p className="text-xs text-slate-500 mt-1">
              Report issues and get assistance within hours, not days.
            </p>
          </div>
        </div>

        {/* Footer matching screen 10 */}
        <footer className="border-t border-slate-200 pt-6 pb-10 text-center sm:flex sm:items-center sm:justify-between text-xs text-slate-400 font-medium">
          <div>© 2024 CampusMarket Inc. Built for students, by students.</div>
          <div className="flex items-center justify-center space-x-6 mt-3 sm:mt-0">
            <a href="#terms" className="hover:text-slate-600">
              Terms
            </a>
            <a href="#privacy" className="hover:text-slate-600">
              Privacy
            </a>
            <a href="#guidelines" className="hover:text-slate-600">
              Community Guidelines
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
};
