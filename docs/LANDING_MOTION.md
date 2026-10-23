# Landing-page motion

Lot uses [Motion for React](https://motion.dev/docs/react), formerly Framer Motion, for a small set of landing-page interactions. The visual reference is [Kris Anfalova's XRS landing page](https://dribbble.com/shots/27613363-XRS-Prop-Trading-Platform-Landing-Page): layered product cards and deliberate easing. Lot keeps its own forest/ivory palette, typography, product content, and practice-only framing. No reference assets are copied.

## Choreography

| Moment | Behavior |
| --- | --- |
| Hero heading | Three masked lines enter in sequence, retaining one accessible heading name |
| Product preview | A single finite settle gives the preview depth; one decorative illustrative-order card follows |
| Stock selection | A spring-driven indicator follows the selected button; the matching quote/chart fades between examples |
| Replay illustration | The observed portion of the price path draws once when it enters view, ending at the current moment |
| FAQ | User-triggered expansion animates height and opacity; the plus rotates into a close mark |
| CTA links | A small directional icon movement responds to hover on pointer devices |

The hero settles in approximately 1.4 seconds. Stock transitions take about 170ms per phase, FAQ expansion 280ms, and the replay path one second. There are no recurring floating loops, animated profit counters, autoplay product videos, or scroll interception. The rest of the page stays still.

The order card is decorative and explicitly illustrative. It does not submit a trade or claim a successful order. It is hidden at widths of 900px and below to keep the preview clear. Existing mobile layout and navigation remain in place.

## Reduced motion and keyboard access

One `matchMedia` subscription, exposed through React's `useSyncExternalStore`, follows `prefers-reduced-motion`, including changes made while the page is open. The footer's Animations on/off control lets a visitor explicitly override that default for the current browser tab. Its single non-sensitive preference is saved in sessionStorage so a reload preserves the choice; blocked storage falls back gracefully. Reduced mode uses zero-duration transitions, skips entrances, and renders the replay path complete. The server-side snapshot defaults to reduced motion. MotionConfig receives the same preference so its transform policy agrees with the explicit timing rules.

Preview buttons retain their native keyboard behavior and `aria-pressed` state. FAQ buttons expose `aria-expanded` and `aria-controls`; closed answers are inert and hidden from assistive technology, and their content is clipped during the visual transition. Focus stays on the disclosure button. The heading retains its complete accessible name; split visual lines and the decorative order card are hidden from assistive technology.

Native video controls, captions, transcript, manual playback, and no-signup demo links are preserved.

## Implementation boundaries

- [`LandingMotion.tsx`](../src/LandingMotion.tsx) contains the animation components; [`Site.tsx`](../src/Site.tsx) composes them into the landing page. [`product.css`](../src/product.css) owns masking, layering, and responsive styles.
- `LazyMotion` uses `domAnimation`, with lightweight `m` components. The selected-tab indicator animates a transform rather than loading the larger layout-animation feature bundle.
- The Motion version is pinned in `package.json` and its dependency integrity hashes are committed in `package-lock.json`. Code is bundled locally; no animation CDN or third-party script is loaded at runtime.
- CodeGuard review covers escaped React content, safe local routes, dependency integrity, and credential/certificate/crypto boundaries. This change introduces no raw HTML sinks, credential handling, certificate material, cryptography, data collection, or API mutations. The session-only animation preference contains no account or authentication data. The production dependency audit reported no vulnerabilities when the package was added.

Frontend compilation and lint are the static checks for this change. Browser review covers the rendered hero, stock selection by mouse and keyboard, and FAQ expansion/collapse with matching accessibility states. The preview browser requested reduced motion, and its static presentation was observed before explicitly enabling page animations and recording the full-motion hero. The session choice survived a reload. Mobile-device emulation was not performed. Automated tests were not added or invoked locally for this UI request; existing repository CI is separate.
