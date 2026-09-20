# Session Zero — visual standards

Backlog #61. A reference doc for future sessions to read *before* building
any UI, so new work stays visually consistent with what's already shipped
instead of inventing its own ad hoc Tailwind classes from scratch.

**This documents an existing convention, it does not introduce a new one.**
Session Zero has no shared `Button`/`Card`/`Input` component today — every
button, card, and input is styled inline, per-file, with Tailwind utility
classes (see backlog #60's own judgment call, which deliberately kept that
convention for the home-page redesign rather than extracting components).
That's a legitimate lightweight-app choice, not an oversight this doc is
here to fix. What follows is the *pattern* each kind of element already
follows across the app, written down as copy-paste-able class strings, so
the pattern stays consistent even though the markup itself isn't shared.

If a second or third UI surface ever needs true reusable components (not
just consistent classes), that's a separate, larger decision — pulling
`clsx`/`tailwind-variants` or hand-rolling a `components/ui/` folder — and
should be its own backlog item, not something this doc silently commits to.

## Color palette

**Neutral base (default, most of the app).** Black-and-white, using
opacity steps on `black`/`white` rather than a gray scale, so the same
class works in both themes via Tailwind's `dark:` variant:

| Use | Light | Dark |
|---|---|---|
| Primary text | `text-black` (default) | `dark:text-white` (default) |
| Secondary/body text | `text-black/70` | `dark:text-white/70` |
| Muted/meta text | `text-black/60` | `dark:text-white/60` |
| Faint/footnote text | `text-black/50` | `dark:text-white/50` |
| Strong border | `border-black/20` | `dark:border-white/20` |
| Subtle border | `border-black/10` | `dark:border-white/10` |
| Inverted button (primary action) | `bg-black text-white` | `dark:bg-white dark:text-black` |

**Accent (hero/marketing surfaces only — backlog #60).** A warm
amber-to-rose gradient, reserved for the home-page hero and not (yet) used
in-app for functional UI. Treat this as the brand accent going forward for
similar marketing-style surfaces (e.g. #81's dual-path explainer), not as
a replacement for the neutral palette used in functional screens:

- Gradient background: `from-amber-100 via-orange-50 to-rose-100` /
  dark: `dark:from-amber-950 dark:via-neutral-950 dark:to-rose-950`
- Gradient text (wordmark-style emphasis): `bg-gradient-to-r
  from-amber-600 to-rose-600 bg-clip-text text-transparent` / dark:
  `dark:from-amber-400 dark:to-rose-400`
- Decorative blur accents: `bg-amber-300/40 blur-3xl` and
  `bg-rose-300/40 blur-3xl` (dark: `/20` and `/10` respectively — the dark
  variants are intentionally dimmer, not a straight opacity carry-over)

**Icon badge colors (feature-card icons, backlog #60).** A small rotating
set used to differentiate icon badges on a row of feature cards — not
tied to specific semantic meaning, just visual variety:

- `bg-amber-100 text-amber-700` / `dark:bg-amber-500/10 dark:text-amber-400`
- `bg-rose-100 text-rose-700` / `dark:bg-rose-500/10 dark:text-rose-400`
- `bg-indigo-100 text-indigo-700` / `dark:bg-indigo-500/10 dark:text-indigo-400`

**Semantic colors (functional, not decorative).**

- Error text: `text-red-600` (dark: `dark:text-red-400`, used inconsistently
  today — some spots omit the dark variant; new error text should include
  both `text-red-600 dark:text-red-400`)
- Unread/notification count badge: `bg-red-600 text-white` on a
  `rounded-full` pill
- Focus ring (accessibility pass, backlog #53 — applied globally in
  `app/globals.css`, not per-component): `outline: 2px solid #2563eb`
  (dark: `#60a5fa`) via `:focus-visible`

Don't introduce new semantic colors (e.g. a green "success" state) ad hoc —
red for errors/urgency is the only semantic color in use today. If a
future feature needs one, pick a Tailwind color, document it here, and
reuse it rather than letting each new feature invent its own.

## Typography

No custom font is loaded — `next/font/google` (Geist) failed to build in
network-restricted sandboxes early in this project (see backlog #13), so
the app uses system font stacks (`system-ui, -apple-system, "Segoe UI",
sans-serif`), set once in `app/globals.css`'s `@theme inline` block. Don't
add a webfont without solving that sandbox constraint first.

Heading/text scale in use, smallest-surface-first:

| Role | Classes |
|---|---|
| Page hero (marketing only, e.g. home) | `text-4xl font-bold tracking-tight sm:text-5xl` |
| Page title (functional screens) | `text-xl font-semibold` |
| Section heading | `text-lg font-semibold` |
| Body text | default size, or `text-sm` for secondary/meta copy |
| Fine print / footnote | `text-xs` |

There's no `h3`/`h4` convention yet in use — when a third heading level is
needed, `text-base font-semibold` is the natural next step down from
`text-lg font-semibold`, but this hasn't been needed anywhere yet, so
treat it as a suggestion, not an established pattern.

## Spacing

No 4/8/12/16px grid is formally declared, but usage is consistent with
Tailwind's default scale used directly (no custom spacing tokens):

- Page-level vertical rhythm between sections: `gap-10` (large) or
  `gap-6` (tighter, within a hero or form)
- Card/section internal padding: `p-5` (feature cards), `px-5 py-2.5`
  (buttons), `px-3 py-1.5` (compact buttons/inputs), `px-2 py-0.5`
  (badges/pills)
- The shared `<main>` container (`app/layout.tsx`) is `max-w-4xl` with
  `py-6` — any full-bleed section (like the home hero) has to explicitly
  escape it with the `-mt-6 mx-[calc(50%-50vw)] w-screen` pattern used in
  backlog #60; don't reach for this outside a real full-bleed need, it's
  an escape hatch, not a default.

## Component patterns

These are class strings pulled directly from shipped code, not aspirational
— copy the pattern that matches what you're building.

**Primary button** (main call-to-action; inverted black/white):
```
rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white shadow-sm
transition hover:-translate-y-0.5 hover:shadow-lg
dark:bg-white dark:text-black
```
A more compact variant (`rounded` instead of `rounded-lg`, `px-3 py-1.5`
or `px-4 py-2`, no hover-lift) is used throughout functional forms
(sign-in, post-a-campaign, profile edit) — reach for the compact version
inside forms/toolbars, the larger hover-lift version only for a true
hero-level call to action.

**Secondary/outline button:**
```
inline-flex items-center rounded-lg border border-black/20 bg-white/70
px-5 py-2.5 text-sm font-medium backdrop-blur transition
hover:-translate-y-0.5 hover:border-black/40
dark:border-white/20 dark:bg-black/30 dark:hover:border-white/40
```
(Drop `bg-white/70`/`backdrop-blur` outside a hero/image context — plain
`border border-black/20 dark:border-white/20` is enough on a flat
background, as seen in most in-app secondary buttons.)

**Card (feature card / content card):**
```
rounded-xl border border-black/10 p-5 transition hover:-translate-y-1
hover:shadow-md
dark:border-white/10
```
Functional (non-hover, non-marketing) cards typically drop the
`transition`/`hover:` lift and just use
`rounded-xl border border-black/10 p-5 dark:border-white/10`, or
`rounded-lg` for a smaller/denser card.

**Badge / pill** (tags, counts, status):
```
rounded-full border border-black/20 px-2 py-0.5 text-xs
dark:border-white/20
```
Subtler variant for less prominent tags: `border-black/10
dark:border-white/10`. For a filled/urgent badge (e.g. unread count):
`rounded-full bg-red-600 px-1 text-xs font-medium text-white` (no border).

**Form field (text input / select / textarea):**
```
rounded border border-black/20 px-3 py-1.5
dark:border-white/20 dark:bg-transparent
```
Every form field in the app follows this one pattern regardless of type —
there's no separate "focused"/"invalid" state styling beyond the global
`:focus-visible` outline in `app/globals.css`; don't add a per-field
focus/error border style without also deciding whether to retrofit it
everywhere else, since today it'd be a one-off inconsistency.

**Error message:**
```
text-sm text-red-600 dark:text-red-400
```
(rendered conditionally, directly above or below the field/form it
relates to — no toast/banner system exists in this app.)

## Motion

Two conventions, both introduced in backlog #60:

- **Hover-lift** on interactive cards/buttons: `transition
  hover:-translate-y-0.5` (buttons) or `hover:-translate-y-1` (cards),
  paired with a shadow increase (`hover:shadow-lg` / `hover:shadow-md`).
- **Ambient decorative motion** (hero blobs/icons only): a shared
  `home-blob-float` keyframe defined once in `app/globals.css`, applied
  via Tailwind's arbitrary-value `animate-[home-blob-float_..._infinite]`
  utility, always gated behind the `motion-safe:` variant so
  `prefers-reduced-motion` users never receive it — consistent with the
  accessibility pass in backlog #53. Reuse this keyframe rather than
  defining a new one for similar ambient effects; don't apply
  `motion-safe:animate-*` to anything functional (buttons, form
  feedback) — it's for decoration only.

## What's deliberately not standardized yet

- No shared React components (see top of doc) — pattern consistency is
  enforced by convention and this doc, not by the type system.
- No design tokens/CSS custom properties beyond `--background` and
  `--foreground` — colors are literal Tailwind utility classes throughout.
- No spacing/type scale beyond "use Tailwind's defaults consistently."
- Only one semantic color (red, for errors/urgency) exists. Extend
  deliberately, not per-feature.

Future sessions: if you introduce a genuinely new pattern (a new badge
style, a new button variant, a second semantic color), add it to this doc
in the same session rather than leaving it undocumented for the next
person to reverse-engineer from a diff.
