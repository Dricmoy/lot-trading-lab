# Lot design QA — October 5, 2026

final result: passed

This result covers the locally rendered redesign and the published landing/demo UI. Production trading and account integration passed separately. Email delivery remains unconfigured and is outside this visual pass.

## Comparison target and normalization

- Source visual truth: `/Users/dricmoybhattacharjee/.codex/generated_images/01a10f30-f21b-78a0-9eee-56ece1e426d3/exec-9562f48e-9adb-4544-a5c3-5640b5aae84e.png`. A copy is saved as `docs/screenshots/reference-option1.png`.
- Implementation: `http://127.0.0.1:5173/app`, `docs/screenshots/desktop-trading.jpg`.
- CSS viewport: 1440 × 1024; reported device pixel ratio: 1.
- Source pixels: 1487 × 1058. Implementation capture pixels: 1425 × 1013. The in-app capture is slightly smaller than the requested CSS viewport; its aspect ratio differs by less than one pixel at comparison scale.
- Both images are displayed at the same 1000 × 711.111 size in `docs/qa-comparison.html`. Focused views use equal 1440 × 1024 image frames with explicit clipping in `docs/qa-details.html` and `docs/qa-order.html`. This removes source resolution and capture-size differences before comparison.
- State: Trading, light theme, AAPL selected, market buy, chart idle with no tooltip. The reference uses illustrative values, ten shares, and a demo identity; the implementation uses one share and the registered disposable test account's saved holdings and cash. Those dynamic values are intentionally not identical.
- Full paired evidence: `docs/screenshots/comparison-full.jpg`.
- Focused paired evidence: `docs/screenshots/comparison-detail.jpg` and `docs/screenshots/comparison-order.jpg`.

Both source and implementation were opened together in the comparison page. The review did not infer fidelity from filenames or code alone.

## Findings and comparison history

1. **[P2, fixed] Desktop density pushed the watchlist too far down.** Earlier evidence: `docs/screenshots/desktop-trading-before.jpg` and `docs/screenshots/comparison-full-before.jpg`. The first implementation showed only one full row in the reference-size viewport. Fix: reduce desktop quote spacing and chart height, tighten watchlist rows, and keep the larger mobile quote treatment. Revised evidence: `desktop-trading.jpg` and the final paired comparison. All four rows are now visible at the desktop target size.
2. **[P2, fixed] Watch control clipped at tablet widths.** Initial browser observations showed legacy fixed width and hidden overflow truncating “Watching.” Fix: use intrinsic width, no shrinking, visible overflow, and a pressed state. Revised evidence: `docs/screenshots/tablet-768-trading.jpg` and `tablet-1024-trading.jpg`.
3. **[P2, fixed] The 768px chart was crowded by a second column.** Fix: stack chart, order ticket, watchlist, book, and portfolio summary at widths up to 900px. The phone navigation breakpoint remains separate. Revised evidence: `tablet-768-trading.jpg`.
4. **[P2, fixed] Smallest phone clipped quantity presets.** Fix: two-column preset layout at widths up to 370px. Revised evidence: `docs/screenshots/mobile-320-order.jpg`.
5. **[P1, fixed] Collapsed sidebar buttons lacked accessible names.** Fix: explicit navigation labels and current-page state. Browser accessibility snapshots now expose Trading, Portfolio, and Activity at every breakpoint.
6. **[P2, fixed] Narrow tablet quote facts truncated sector text.** Fix: wrap the facts beneath the price at 901–1100px. Revised evidence: `tablet-1024-trading.jpg`.

After these fixes, the full composition and focused controls were compared again. No actionable P0/P1/P2 finding remains in the reviewed states.

## Required fidelity surfaces

| Surface | Review result |
| --- | --- |
| Fonts and typography | Manrope provides the display hierarchy and DM Sans the body/UI text. Browser checks confirmed loaded Manrope at the heading's 650 weight and DM Sans at 400; the computed heading family is Manrope. Large title, compact quote, supporting text, controls, and phone wrapping were inspected in full and focused views. |
| Spacing and layout | Forest sidebar, ivory content canvas, prominent title, chart to the left of the order ticket, and watchlist below preserve the chosen structure. Desktop density was corrected. Phones use bottom navigation and a single-column flow; tablets retain useful chart width. |
| Colors and tokens | Forest `#172b20`, ivory `#f6f8f3`, sage selected states, and lime accents are centralized in `src/tokens.css`. Gain/loss states and keyboard focus remain distinct. Secondary text was darkened for readability. |
| Image quality and assets | Stock marks use real company logo assets, including SVGs and official favicons; sources are listed in `public/logos/SOURCES.md`. They remain sharp at their small display sizes. Navigation uses the existing Lucide icon family. The generated concept's decorative angular brand glyph and sparkle badge were omitted; the product retains Lot's typographic wordmark and uses a standard wallet icon, with no handmade approximation of generated artwork. |
| Copy and content | New landing and account copy describes the actual product. Registered names replace fake demo personas. Simulation disclosures remain visible. Engineering stack copy, execution-pipeline descriptions, and an unexplained IOC suffix were removed from product flows. No invented news, market capitalization, volume, or OHLC values were added. |

## Intentional adaptations

- The existing feed supplies closing samples, so the working chart uses accurate line/area data. It does not fabricate the concept's candles or volume bars.
- Only supported 1H/1D ranges are shown. Unsupported historical periods from the concept are omitted.
- The reference's invented news block is replaced with the actual simulated order book and portfolio summary.
- The order form retains the proven review/confirm flow, explicit whole-share input, presets, and cash accounting. The stock is selected through search or watchlist rather than a redundant symbol field.
- The landing page and authentication screens extend the same visual system; the selected concept contains no corresponding source screens for pixel comparison.

## Responsive and interaction evidence

- Desktop: 1440 × 1024 trading and landing; default browser-size review also performed.
- Tablet: 1024 × 900 and 768 × 1024 trading; 768 × 1024 landing.
- Phone: 390 × 844 trading, portfolio, activity, and limit outcome; 320 × 740 trading presets, landing, signup, login, forgot-password, and reset forms.
- No document-level horizontal overflow was found in the inspected responsive states. Wide holdings tables scroll within their card.
- Real browser flow: register, search, buy two AAPL shares, sell one, inspect portfolio/history, sign out, sign in, and restore cash/holdings. A non-crossing limit cancelled without changing cash. Recovery used a locally delivered message, then login restored the same account.
- The native reset dialog opened with focus inside and dismissed with Escape without resetting the portfolio. Account menu and mobile navigation were exercised. Form fields have labels, and password reveal controls are accessible.
- Browser error log checked after the flow: empty.
- Reduced-motion styling is present. Cross-browser coverage, a screen-reader audit, and accessibility certification were not performed.

## Implementation checklist

- [x] Compare full source and implementation in one input.
- [x] Compare important typography and order controls in focused inputs.
- [x] Fix desktop density and responsive clipping.
- [x] Verify practical trading and authentication against real local services.
- [x] Capture browser-rendered evidence and check console errors.
- [x] Record intentional product adaptations and remaining verification limits.

## Follow-up polish

No P3 work is required for this local handoff. A dedicated logo asset or a future candle feed can be considered separately; neither has been represented as implemented.

## Approved video and no-signup demo extension

- Prominent landing and navigation actions now open `/demo` directly, while signup/login offer a “Skip signup — try the demo” link. The existing isolated guest-account model remains in use. Existing registered sessions keep their owned workspace. No authentication or owner-feed protection was removed.
- The walkthrough contains actual recorded guest interactions in the running app: choose Apple, review/buy two shares, inspect Portfolio, review/sell one, and inspect Activity. Captured segments were edited to remove gaps between recording steps; no synthetic product animation or fabricated execution was substituted. Provenance is in `public/demo/RECORDING.md`.
- Video: H.264, 1440×1024, about 40 seconds, 873,005 bytes, no audio. Native playback controls, English descriptive captions, an HTML transcript, and a direct-download fallback are present. Preload is disabled until play.
- **[P2, fixed] Native playback controls initially required scrolling to the bottom of the large video.** Added an accessible, keyboard-operable “Play product walkthrough” overlay. Verified it starts actual playback (`paused=false`, `readyState=4`, duration 40.167 seconds) locally and on the public alias.
- New local phone evidence: `docs/screenshots/mobile-video.jpg` at 390×844 CSS (375×812 capture) and `mobile-320-video.jpg` at 320×740 CSS (305×705 capture). No document-level horizontal overflow; text, demo action, play overlay, and transcript remain usable. The large captured desktop UI is intentionally scaled inside the phone player; full-screen playback is available through native controls.
- Published evidence: `live-landing.jpg`, `live-video.jpg`, `live-video-desktop.jpg`, `live-mobile-video.jpg`, `live-mobile-portfolio.jpg`, and `live-demo-review.jpg`. The public demo opened without registration, stock search and order review worked, and mobile portfolio/navigation remained usable. Its existing guest portfolio was not reset or traded during this UI review. Full live buy/sell checks used separately created test identities.
- No new P0/P1/P2 finding remains in the reviewed extension. The original normalized full and focused source comparisons above remain applicable to the unchanged workspace composition.

Public desktop walkthrough reviewed at 1440×1024 (1425×1013 capture), including its play overlay and no-signup action. Public console error log: empty.

## October 5, 2026: polished recorded demo follow-up

The landing now plays a 48.366667-second, 1920×1080, 60 fps H.264 film from a new genuine guest-session recording. Smooth camera zooms track actual clicks; an animated pointer and click pulses clarify actions. Eight view crossfades, chapter copy, and animated opening/closing titles complete the edit. New poster/captions/transcript and versioned assets accompany it. The play overlay stays off after completion so the closing invitation remains readable.

All 2,902 frames decoded. Local desktop and 390×844 phone playback reached the end; no inspected phone horizontal overflow. Public playback reached `ended=true` with the correct duration/dimensions and no console errors. Public MP4 returned 200 `video/mp4`, matched the reviewed local SHA-256, and returned 206 for byte ranges. Poster/captions and `/api/health` returned 200. Production deployment: `dpl_VPEowvjXCiRE9NkwD4iuYWzUaKHU`, READY and aliased to the existing public site. Build, ESLint, Ruff, and whitespace checks passed; no test suites were added or run for this media-only follow-up. Full evidence: `docs/DEMO_FILM_QA.md`.
