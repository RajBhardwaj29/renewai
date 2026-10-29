# RenewAI brand identity

The marketing website's blue renewal mark and mixed-case RenewAI wordmark are
the official identity. Application integration: 29 October 2026.

## Original sources

Retrieved read-only from `RajBhardwaj29/renewai-website` on 29 October 2026:

- [Logo component](https://github.com/RajBhardwaj29/renewai-website/blob/main/src/components/brand/Logo.tsx),
  blob `dc102bf92446fff9bf000e8dc0595214c42017dc`.
- [Brand tokens and typography](https://github.com/RajBhardwaj29/renewai-website/blob/main/src/styles.css),
  blob `8b27814dd7bf45196d0f859a9c0b0f8ecd11e17e`.
- [Original favicon](https://github.com/RajBhardwaj29/renewai-website/blob/main/public/favicon.svg),
  blob `da944c58f7da944301f2d8abd24d258650dccb32`.

The marketing repository and deployment were not modified.

## Application usage

Import `Logo` or `LogoMark` from `@/components/Logo`.

- `<Logo />`: dark wordmark on light surfaces.
- `<Logo tone="light" />`: light wordmark on dark surfaces.
- `<LogoMark />`: decorative mark within an already labelled control.

The original SVG viewBox, paths, node, rounding, opacity and stroke widths are
unchanged. Both wordmark variants retain the same blue symbol and blue AI suffix.
The original Geist font, semibold weight, tight tracking, 1.15rem wordmark, 1.75rem
mark and 0.625rem gap are retained. The application's existing desktop root scale
continues to scale the complete logo proportionally.

Logo-only CSS tokens reproduce the marketing component's actual OKLCH values,
without changing application interface colors. No new dependency or font is
needed. Keep proportions intact; do not substitute an icon-library symbol.

`frontend/app/icon.svg` is the original favicon copied verbatim. The ICO fallback
contains 16, 32 and 48 pixel rasterizations of that SVG. Next.js discovers both
files automatically. The source site's favicon uses its own original hex colors;
the component uses its original OKLCH tokens, exactly as in the marketing project.

Brand links retain their existing destinations and click handlers. Authentication,
API requests, contract workflows, backend and stored data are outside this change.
