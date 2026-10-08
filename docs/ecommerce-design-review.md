# Ecommerce design best practices, read against CampusMarket

Source: Elementor, "Ecommerce Website Design (2026): Best Practices + Examples".
It is a generalist checklist with a WordPress/WooCommerce sales pitch attached — the
tooling half (Elementor, its hosting, its AI) is irrelevant to us. What is worth
keeping is the checklist. Below, each principle is scored against what the app
already does, so the list ends with a short set of real gaps rather than a wall of
advice we have already taken.

## Already covered

| Principle from the article | Where we do it |
|---|---|
| Prominent search with autocomplete | `search/SearchSuggestions.tsx` — debounced, recent searches, trending, popular categories, image thumbnails |
| Filtering and sorting | `search/FilterPill.tsx`, `PriceRangeSlider.tsx`, `browse/resolveSort.ts` |
| Breadcrumbs showing position | `shared/Breadcrumbs.tsx`, used on detail and search |
| Hero section above the fold | `BrowseScreen.tsx` hero carousel, admin-editable via `admin/PromoEditor.tsx` |
| Category showcases / curated collections | `browse/CategoryStrip.tsx`, `SuggestedCategories.tsx`, `SpecialOffers.tsx` |
| Multiple product images with zoom | `shared/ListingGallery.tsx` + `ImageLightbox.tsx` |
| Reviews and star ratings, prominent | Seller rating beside the name *and* per-listing reviews in `DetailScreen.tsx` |
| Trust badges | `verified` badge on detail, profile and saved cards |
| Mobile-first, touch targets, responsive | Tailwind throughout, `nav/BottomNav.tsx`, sticky action bar on detail |
| Image optimisation | `shared/ListingImage.tsx` — `srcSet`/`sizes` per call site, lazy except heroes |
| Loading states instead of blank screens | `DetailSkeleton.tsx`, route-level `React.lazy` in `App.tsx` |
| Good empty states | `browse/NoResultsSuggestions.tsx`, `shared/pickSuggestions.ts` |
| Cross-sell / recently viewed | "Similar listings" on detail, "Your recently viewed items" on browse |
| Compression and security headers | `Caddyfile` — gzip/zstd, CSP, hardening headers |
| Consistent visual branding | Design tokens in `src/index.css` (`--color-primary: #004ac6`) |

## Does not transfer

- **Guest checkout, payment methods, Apple/Google Pay, shipping cost tables.** We
  deliberately have no centralised payments — handover is peer-to-peer at a campus
  meetup. The equivalent question for us is not "fewer checkout steps" but "how few
  steps from listing to an agreed meetup", which is the Deal/Order flow.
- **Urgency copy ("Limited Stock Available").** On a marketplace where a stranger
  with one bike writes the listing, manufactured scarcity reads as a scam signal and
  cuts against the trust work.
- **Newsletter capture as the main below-fold goal.** Our equivalent already exists
  as `browse/SocialChannelsBanner.tsx` and push opt-in.

## Worth doing

(1), (2), (3), (5) and (8) are done — see `shared/VerifiedBadge.tsx`,
`nav/CategoryMenu.tsx`, the feed trail in `BrowseScreen.tsx`, `vercel.json`
with the matching block in the `Caddyfile`, and the description prompts in
`SellScreen.tsx`. What is left — (4) seller replies to reviews, (6) live counts
above the fold — both need a backend change: a reply column on the review model,
and a public stats endpoint, since the only counts today are admin-only. (7), the
accessibility sweep, is still open and needs no backend.

1. **Verified badge on browse and search cards.** It is on detail, profile and saved
   cards, but the feed — where buyers decide what to click — does not show it. The
   cheapest trust win available, since `SellerProfile.verified` is already on the wire.
2. **Mega menu / full category navigation in the top bar.** `TopNav.tsx` carries
   search and account only; the category strip row was removed. Desktop users get no
   persistent view of the catalogue's shape. A hover panel over the existing
   categories endpoint would restore it without bringing the old row's cost back.
3. **Breadcrumbs on browse and category views**, not only detail and search, so a
   filtered feed is an addressable, understandable place.
4. **Seller replies to reviews.** The article's "responsive customer service" point:
   a seller answering a two-star review is stronger social proof than the star itself.
   Needs a reply field on the review model.
5. **Static asset caching on the Vercel side.** `vercel.json` sets rewrites but no
   `headers` — Vite's hashed bundles should be `Cache-Control: immutable`, and the
   Caddy path should match.
6. **Social proof on the hero / above the fold.** Live counts ("412 listings, 1,200
   students") where a shop would put testimonials. We have the numbers server-side
   already for the admin dashboard.
7. **An accessibility pass.** `aria-` appears in ~50 components, which means it is
   habitual but unaudited — worth one deliberate keyboard-and-contrast sweep over the
   carousel, search overlay, modals and the filter pills.
8. **Benefit-led listing descriptions.** We cannot write sellers' copy, but
   `SellScreen.tsx` can prompt for it: condition, reason for selling, what's included.

## The accessibility sweep (item 7)

What it found, rather than what was feared. The carousel already honours
`prefers-reduced-motion` and pauses on hover and on user request; the search
overlay is a proper labelled dialog; the bottom nav sets `aria-current`; the
filter pills carry an accessible name that says what pressing one does. The
habitual `aria-` use was, on inspection, mostly correct.

Two things were not.

**Dialogs were divs.** The shared `Modal` shell - worn by the report, review,
booking, mark-sold and become-seller dialogs - had no role, no name, no
Escape, and no focus handling, so a dialog announced nothing and Tab walked
the feed behind the overlay. `AuthModal`, the front door, had its own markup
and the same gaps. Both now share `shared/useDialog.ts`: role and name,
Escape, focus into the panel on open and back to the opener on close, and a
Tab trap. Verified in a real browser as well as in jsdom - eight Tabs stayed
inside the sign-in dialog, Escape closed it, focus returned to the Log In
button. Focus lands on the panel rather than the first control, which here is
the × - landing there means Enter dismisses a dialog just opened.

**`#a0a3b1` fails contrast.** 2.51:1 on white, against the 4.5:1 that normal
text needs, and it is used as a text colour in 90 places across 28 files -
counts, placeholders, category eyebrows. `#737686` passes at exactly 4.50:1,
so the fix is probably to replace one with the other, but it darkens a lot of
small print at once and that is a design call rather than a sweep. Left alone,
flagged here. `#c3c6d7` (10 uses) and `#b4c5ff` (21) are worse still at
1.70:1; most are decorative icons where it does not apply, but they want
checking one at a time.
