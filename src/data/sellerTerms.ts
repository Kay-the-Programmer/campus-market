/**
 * The seller terms, in one place because three surfaces show them: the
 * application modal, the Google signup profile step, and the public legal
 * page. Copy that disagrees with itself is worse than no copy at all when the
 * thing being agreed to is what an admin later enforces.
 *
 * Plain language on purpose. These are read by students on a phone, usually in
 * the thirty seconds before they tap Apply, and a wall of legalese is read by
 * nobody - which defeats the point of asking them to accept it.
 */

/**
 * Bumped whenever the clauses below change in a way that alters what someone
 * is agreeing to - not for typo fixes.
 *
 * The backend keeps its own copy of this string (SellerTerms.CURRENT_VERSION)
 * and refuses an acceptance that does not match it, which is what makes a
 * stale cached bundle fail loudly instead of recording someone as having
 * accepted terms they were never shown. Change one, change the other.
 */
export const SELLER_TERMS_VERSION = '2026-09-30';

export interface SellerTermsClause {
  title: string;
  body: string;
}

export const SELLER_TERMS: SellerTermsClause[] = [
  {
    title: 'You sell as yourself',
    body: 'Your account is personal and tied to your verified campus email. Do not sell '
      + 'on behalf of someone outside campus, and do not hand your account to anyone else.',
  },
  {
    title: 'Applying is not approval',
    body: 'An admin reviews every application. You can only list once it is approved, and '
      + 'approval can be withdrawn later if these terms are broken.',
  },
  {
    title: 'Only list what you may sell',
    body: 'You must own the item or have the right to sell it. Nothing illegal, stolen, '
      + 'counterfeit, unsafe, or barred by campus rules - including weapons, drugs, alcohol '
      + 'and any service that helps someone cheat on academic work.',
  },
  {
    title: 'Describe it honestly',
    body: 'Photos, condition, price and availability must match what you are actually '
      + 'handing over. A reduced price must be a real reduction from a price you were '
      + 'genuinely asking.',
  },
  {
    title: 'Food and services carry extra duty',
    body: 'If you sell food, you are responsible for preparing and storing it safely and '
      + 'for telling buyers about ingredients that commonly cause reactions. If you sell a '
      + 'service, deliver what you described, when you said you would.',
  },
  {
    title: 'Honour the orders you accept',
    body: 'Meet buyers at the agreed campus location and time, or cancel early enough for '
      + 'them to make other plans. Repeatedly accepting orders you do not fulfil is grounds '
      + 'for removal.',
  },
  {
    title: 'CampusMarket does not handle the money',
    body: 'Payment is between you and the buyer, in person. The platform takes no cut and '
      + 'holds no funds, which also means it cannot reverse a payment or refund you if a '
      + 'trade goes wrong.',
  },
  {
    title: 'Keep the conversation here',
    body: 'Arrange trades in CampusMarket chat. If a dispute is reported, that thread is '
      + 'the record an admin has to work from - there is nothing to check if the deal '
      + 'happened somewhere else.',
  },
  {
    title: 'Treat buyer details as private',
    body: 'A phone number or meeting spot shared with you for a trade is for that trade '
      + 'only. Do not reuse it to market to them, and do not pass it on.',
  },
  {
    title: 'Moderation is part of selling here',
    body: 'Admins may remove listings, hold new sellers’ incoming orders for review, '
      + 'and suspend or ban accounts. You are responsible for what you sell, including any '
      + 'tax or regulatory obligation that comes with it.',
  },
];
