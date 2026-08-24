---
name: Campus Marketplace System
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#434655'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#004ac6'
  on-primary: '#ffffff'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#b4c5ff'
  secondary: '#6b38d4'
  on-secondary: '#ffffff'
  secondary-container: '#8455ef'
  on-secondary-container: '#fffbff'
  tertiary: '#006242'
  on-tertiary: '#ffffff'
  tertiary-container: '#007d55'
  on-tertiary-container: '#bdffdb'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#e9ddff'
  secondary-fixed-dim: '#d0bcff'
  on-secondary-fixed: '#23005c'
  on-secondary-fixed-variant: '#5516be'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-max: 1280px
  gutter: 1.5rem
  margin-mobile: 1rem
  stack-sm: 0.5rem
  stack-md: 1rem
  stack-lg: 2rem
---

## Brand & Style

The design system is built on a foundation of reliability, accessibility, and youthful energy. It prioritizes a peer-to-peer community experience that feels both professional enough to handle financial transactions and approachable enough for daily campus life. 

The aesthetic follows a **Modern Corporate** style with **Soft Minimalist** influences. This is achieved through high-clarity layouts, expansive whitespace to prevent cognitive load, and rounded organic shapes that reduce visual tension. The emotional response should be one of "effortless trust"—the UI stays out of the way of the marketplace while providing clear, friendly signals for safety and verification.

## Colors

The color palette utilizes a high-signal logic to help students navigate categories intuitively. 

- **Primary (Blue):** The core brand color used for navigation, primary actions, and "Product" listings. It signifies stability and utility.
- **Secondary (Purple):** Reserved specifically for "Services" to differentiate intangible offerings from physical goods.
- **Success/Food (Green):** Used for "Food" listings and positive status indicators (e.g., "Available").
- **Warning/Food (Orange):** An alternative for food/perishables or urgent alerts.
- **Neutral/Surface:** A light grey (`#f8fafc`) is used for the base background to make pure white (`#ffffff`) cards pop with maximum clarity.

## Typography

This design system utilizes **Inter** across all levels to ensure maximum legibility and a clean, systematic appearance. 

- **Headlines:** Use Bold (700) or SemiBold (600) weights with slight negative letter-spacing to create a strong visual anchor.
- **Body Text:** Standardizes on a 16px base for comfort, utilizing a 14px variant for secondary metadata (e.g., timestamps or location).
- **Labels:** Used for category chips and status badges. These often employ a slightly heavier weight to remain legible at smaller scales.

## Layout & Spacing

The system employs a **Fluid Grid** with fixed maximum constraints for desktop viewing. 

- **Grid:** A 12-column grid for desktop, 6-column for tablet, and 2-column for mobile listing views.
- **Margins:** 16px on mobile devices, scaling to 24px/32px on larger screens.
- **Rhythm:** An 8px linear scale is used for all internal component spacing to maintain mathematical harmony. 
- **Mobile Reflow:** In mobile views, complex filtering horizontal bars transition into a "Bottom Sheet" pattern to ensure easy thumb-reachability.

## Elevation & Depth

To maintain an "approachable" feel, this design system avoids harsh borders in favor of **Ambient Shadows**. 

- **Card Elevation:** Low-intensity, highly diffused shadows (e.g., `y: 4, blur: 20, opacity: 0.05, color: #000`) are used to lift white cards off the off-white background.
- **Interactive Depth:** On hover, cards should slightly increase their shadow spread and lift (Y-axis shift) to signal interactivity.
- **Tonal Layers:** The base background is the lowest tier, while modal overlays and bottom sheets sit on the highest tier, signaled by a 20% black backdrop blur.

## Shapes

The shape language is defined by significant corner rounding to communicate friendliness and safety.

- **Base Components:** Buttons and input fields use a standard 0.5rem (8px) radius.
- **Feature Elements:** Product cards and image containers use `rounded-2xl` (1rem / 16px) to create a soft, modern container.
- **Chips & Badges:** Use a full pill-shape (9999px) to distinguish them from functional buttons and clickable cards.

## Components

- **Buttons:** Primary buttons are solid Blue (#2563eb) with white text. Secondary buttons use a light blue ghost style. All buttons have a height of 48px for touch-accessibility.
- **Category Chips:** 
    - *Product:* Blue background (10% opacity), Blue text, Shopping Bag icon.
    - *Service:* Purple background (10% opacity), Purple text, Briefcase icon.
    - *Food:* Green background (10% opacity), Green text, Fork-and-Knife icon.
- **Cards:** White surfaces with 16px padding. Image at the top with 16px corner radius. Title in `headline-sm`, price in `headline-md` (Primary Blue).
- **Verified Badges:** A small Blue checkmark icon next to the seller's name.
- **Input Fields:** 1px border (#e2e8f0), 8px radius. On focus, the border transitions to Primary Blue with a subtle 2px outer glow.
- **Bottom Sheets:** For mobile filters, using a "handle" indicator at the top and a 24px top-corner radius.
- **Star Ratings:** Sized at 16px, using Quaternary Orange (#f59e0b) for filled states.