import type { Config } from 'tailwindcss';

/**
 * Design tokens are declared as CSS variables in globals.css and mapped here so
 * both Tailwind utilities and raw CSS share one source of truth.
 *
 * Palette policy (see CLAUDE.md > Design system):
 *   - One accent color only (amber). Everything else is a neutral gray scale.
 *   - No gradients / glow. Separation via thin borders, not shadows.
 */

/**
 * Typography scale, uniformly 1.5x Tailwind's defaults (see CLAUDE.md >
 * "Typography scale"). Scaling the *scale* rather than editing font sizes
 * component-by-component is deliberate: every `text-sm` in the app moves
 * together, so there is exactly one place to reason about type size.
 *
 * Line heights are NOT a flat 1.5x of the defaults — they follow the usual
 * typographic curve where larger type needs proportionally less leading.
 * Body sizes (xs/sm/base) sit at ~1.5, which is deliberately roomier than
 * Tailwind's default ~1.35-1.43 because this site's primary audience reads
 * Korean: CJK glyphs are full-width and have no descender-driven whitespace,
 * so identical leading reads tighter in ko/zh than in Latin. Display sizes
 * tighten to ~1.06-1.28 so headings don't drift apart.
 */
const fontSize: Record<string, [string, { lineHeight: string }]> = {
  xs: ['1.125rem', { lineHeight: '1.6875rem' }], //  18px / 27px  (was 12/16)
  sm: ['1.3125rem', { lineHeight: '2rem' }], //      21px / 32px  (was 14/20) — body default
  base: ['1.5rem', { lineHeight: '2.25rem' }], //    24px / 36px  (was 16/24)
  lg: ['1.6875rem', { lineHeight: '2.375rem' }], //  27px / 38px  (was 18/28)
  xl: ['1.875rem', { lineHeight: '2.625rem' }], //   30px / 42px  (was 20/28)
  '2xl': ['2.25rem', { lineHeight: '2.875rem' }], // 36px / 46px  (was 24/32)
  '3xl': ['2.8125rem', { lineHeight: '3.375rem' }], // 45px / 54px (was 30/36)
  '4xl': ['3.375rem', { lineHeight: '3.875rem' }], // 54px / 62px (was 36/40)
  '5xl': ['4.5rem', { lineHeight: '4.75rem' }], //   72px / 76px  (was 48/48)
};

/**
 * Spacing scale, also uniformly 1.5x (0.25rem/step -> 0.375rem/step).
 *
 * This exists for the same reason as the type scale above: type that grows
 * 1.5x inside unchanged padding reads cramped, and the alternative — hand-
 * editing `px-3`/`gap-2`/`size-4` across every component — is exactly the
 * per-component churn this project avoids. Because Tailwind derives padding,
 * margin, gap, width/height, inset and `size-*` from this one scale, scaling
 * it keeps every proportion the design already had, just larger.
 *
 * Deliberately NOT scaled: `px` (1px stays a hairline — borders and 1px
 * rules are not "space"), border radius (kept so the visual language reads
 * identical, only bigger), and breakpoints (px-based, so layout still
 * reflows at the same real viewport widths).
 */
const SPACING_STEPS = [
  0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28,
  32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96,
] as const;

const spacing: Record<string, string> = {
  0: '0px',
  px: '1px',
  ...Object.fromEntries(
    SPACING_STEPS.map((step) => [String(step), `${step * 0.375}rem`]),
  ),
  // Named, fixed 44px accessibility floor for tappable things — see the
  // minHeight/minWidth note below. Lives in `spacing` as well so `size-touch`
  // works for square icon buttons.
  touch: '2.75rem',
};

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--color-bg) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--color-surface-2) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        fg: 'rgb(var(--color-fg) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        'accent-fg': 'rgb(var(--color-accent-fg) / <alpha-value>)',
        positive: 'rgb(var(--color-positive) / <alpha-value>)',
        negative: 'rgb(var(--color-negative) / <alpha-value>)',
        // Warning states alias the amber accent (no new hue — the one-accent
        // rule stays intact). Previously `text-warning`/`border-warning` were
        // referenced but undefined, so those elements silently lost their
        // color treatment.
        warning: 'rgb(var(--color-accent) / <alpha-value>)',
        // Seasonal-mode identity mark only — see globals.css for the scope
        // this hue is allowed in.
        seasonal: 'rgb(var(--color-seasonal) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
      },
      fontSize,
      spacing,
      // Only two weights are used across the app: regular (400) and medium (500).
      fontWeight: {
        normal: '400',
        medium: '500',
      },
      borderColor: {
        DEFAULT: 'rgb(var(--color-border) / <alpha-value>)',
      },
      minHeight: {
        // WCAG 2.5.5-style floor for anything tappable. A fixed 44px, not a
        // scale step, precisely because it must NOT drift if the scale is
        // ever retuned — it's an accessibility floor, not a design rhythm.
        touch: '2.75rem',
      },
      minWidth: {
        touch: '2.75rem',
      },
      maxWidth: {
        // Left at 80rem on purpose while type grew 1.5x: the measure (chars
        // per line) tightens toward a more readable ~65-75 characters instead
        // of the very long lines 80rem gave at the old 14px body size.
        content: '80rem',
      },
    },
  },
  plugins: [],
};

export default config;
