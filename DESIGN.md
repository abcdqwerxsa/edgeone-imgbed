# Design System: imgbed (Light Gallery)

## 1. Visual Theme & Atmosphere
A restrained, gallery-airy interface — editorial, high-whitespace, single confident accent. The atmosphere is like a well-lit photography studio: white surfaces let images dominate, charcoal type provides structure, and one desaturated emerald punctuates only what matters. Density sits at daily-app balanced (5), variance moderate-offset (6), motion fluid-but-restrained (5). Nothing screams; hierarchy is earned through weight, spacing, and one color.

## 2. Color Palette & Roles
- **Canvas** (#FAFAFA) — App background, near-white
- **Pure Surface** (#FFFFFF) — Cards, dropzone, inputs, modals
- **Surface Tint** (#F5F5F4) — Inset fields, code values, media backdrops
- **Charcoal Ink** (#18181B) — Primary text, primary button fill (Zinc-950, never pure black)
- **Secondary Ink** (#3F3F46) — Body emphasis
- **Muted Steel** (#71717A) — Secondary text, metadata
- **Faint** (#A1A1AA) — Tertiary labels, disabled
- **Hairline** (#E7E7E9) — 1px structural borders (Zinc-200 family)
- **Emerald** (#0F8A5C) — Single accent: links, active nav, focus rings, copy-success, brand dot
- **Emerald Deep** (#0B7149) — Accent hover/press
- **Emerald Soft** (rgba(15,138,92,0.09)) — Focus glow, soft fills
- **Danger** (#DC2626) — Delete only, sparingly

Constraint: exactly one accent. Emerald saturation ~70% (< 80%). No purple, no neon, no pure black, no blue glow.

## 3. Typography Rules
- **Display/UI:** system stack — `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI Variable", system-ui, "PingFang SC"` — tight tracking (-0.02em) on headings, weight-driven hierarchy (500/600/650), not size shouting.
- **Body:** same stack at 15px / 1.55 leading, ~65ch max.
- **Mono:** `ui-monospace, "SF Mono", "JetBrains Mono", Menlo` — for all links, filenames, sizes, `UPLOAD_TOKEN`.
- **Scale:** headings use `clamp()` (e.g. dropzone title `clamp(16px, 2.4vw, 19px)`); body floor 1rem.
- **Numbers:** tabular-nums for file sizes/metadata.
- **Banned:** Inter, generic serif fonts, emoji as iconography (use inline SVG line icons instead).

## 4. Component Stylings
- **Buttons:** Flat fills, no outer glow. Primary = charcoal ink (#18181B) → hover #27272A; Ghost = 1px hairline + surface; Accent = emerald. Tactile `translateY(1px)` on active. Min-height 38px (>44px tap zone honored on mobile).
- **Dropzone:** Generously rounded (22px), 1.5px dashed hairline, large vertical padding (`clamp(40px,9vw,76px)`). Drag/hover → emerald border + soft tint + faint scale. Focus-visible → 4px emerald ring. Inline SVG upload icon (no emoji).
- **Cards (results):** White surface, 1px hairline, 16px radius, whisper shadow. Thumbnail 92px square cover. Copy rows = uppercase micro-label + mono value (truncated) + ghost copy button that flashes emerald on success.
- **Gallery:** Auto-fill grid (minmax 168px). Square aspect media, hairline card, shadow on hover only. Action overlay (copy/delete) fades in on hover with a top-down charcoal gradient.
- **Inputs/Modal:** Native `<dialog>`. Label-less single field, helper text references `UPLOAD_TOKEN` in mono chip. Focus → emerald border + soft ring.
- **Chip (token status):** Pill, 1px hairline, status dot (emerald when set, faint when not).
- **Loaders:** Textual empty/loading states ("加载中…" / "还没有图片…"), no spinners.

## 5. Layout Principles
- Sticky translucent header (blur + 82% canvas) → feels floaty, content-led.
- `.wrap` max-width 1040px, centered, 24px gutters (16px mobile).
- Header uses `margin-right:auto` on brand to push nav/chip right — no flex percentage math.
- Gallery grid via `auto-fill minmax()` — CSS Grid, no media-query column hacks.
- Full-height via `100dvh` (never `h-screen`). Generous section gaps (40–80px).

## 6. Motion & Interaction
- Global ease approximates spring: `cubic-bezier(0.22, 1, 0.36, 1)`, 150–200ms.
- View/result entrance: `rise` keyframe (opacity + 6px translateY).
- Hover transitions on borders, shadows, color only. Active press = 1px translate.
- Copy success = button flashes emerald + toast.
- Reduced-motion: `@media (prefers-reduced-motion: reduce)` kills all animation/transition.

## 7. Anti-Patterns (Banned)
- No emoji anywhere (SVG line icons only).
- No Inter; no generic serif in this utility UI.
- No pure black (#000000) — use #18181B.
- No purple/blue neon, no outer glows, no gradient text on headers.
- No 3-equal-column feature card row.
- No fake round numbers, no AI copywriting ("Elevate / Seamless / Unleash").
- No overlapping elements; clean spatial zones, hairline separation.
- No broken image links.
- No `h-screen`; no `calc()` flex hacks.

## 8. Responsive
- Single source of truth scales from 360px → desktop.
- Below 640px: result cards stack (thumb full-width 180px), gallery tightens to 140px cells, token label hides (icon-only chip), gutters 16px.
- All tap targets ≥ 34–38px (mobile, with the dropzone/nav/chip comfortable).
- No horizontal scroll anywhere.
