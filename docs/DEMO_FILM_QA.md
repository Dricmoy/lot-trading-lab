# Polished Lot walkthrough verification

## Artifact and motion

The new film was recorded in a fresh local guest workspace. It contains 380 actual browser frames and 12 actual interaction coordinates. The pointer and 60 fps camera movement are postproduction additions grounded in that log. Capture, manifest, fonts, and edit metadata remain local in ignored `.sites-runtime/recording-polished/` and `.sites-runtime/demo-film/`.

The entire H.264 export decoded without error: 2902 frames, 1920×1080, 60 fps, 48.366667 seconds, 5,564,008 bytes, yuv420p, no audio. SHA-256: `25f5741df091bf9e43c58169e0a88fdfdd2d201f0f3e47e7806abddc2a0c0376`. Original public filenames remain for direct-link compatibility; the landing uses the new `lot-walkthrough-polished` assets together.

Visual review included all chapters and encoded frame progression through all eight view crossfades, plus the camera and cursor approach to Search. The transition contact sheet includes six frames per change, sampled before, within, and after each dissolve. Camera/cursor interpolation uses smoothstep with zero velocity at its endpoints. Preview review caught overly tight Portfolio/Activity crops; the final overview zooms preserve company names and both fill amounts. Only the browser scrollbar was trimmed; cursor projection retains the original viewport scaling.

Evidence: `docs/screenshots/demo-film-storyboard.jpg` and `docs/screenshots/demo-film-motion.jpg`. These are extracted/preview images, not substitutes for playback checks.

Actual recorded results: buy two AAPL shares for $475.28, Portfolio shows 27 AAPL shares and $75,052.87 cash, sell one share for $237.53, Activity shows both fills. Opening and closing titles communicate virtual funds and no-signup demo access. English captions follow the new timeline; the written transcript describes searching Apple and the complete flow.

## Local checks

Frontend build, ESLint, Ruff, and whitespace checks passed. No test suites were added or run for this media-only follow-up. The actual landing play button started the new MP4: `paused=false`, `readyState=4`, decoded dimensions 1920×1080, duration 48.366667, English captions showing. Playback advanced from 0.24 to 9.53 seconds; the search crop and animated pointer were visibly present. Local desktop playback reached `ended=true` at 48.366667 seconds. A second complete local playback at 390×844 also reached the end. Phone document width was 375px within a 390px viewport; the 336×190 player stayed inside the layout. The custom play overlay now appears only before the first play, so it does not cover the ending invitation; native controls still support replay.

## Public release

Deployment `dpl_VPEowvjXCiRE9NkwD4iuYWzUaKHU` reached READY and was assigned to `https://lot-trading-lab.vercel.app`. Frontend, API functions, and static assets built successfully; no backend or database change was made. Public `/api/health` returned 200. The video returned 200 `video/mp4`, exactly 5,564,008 bytes and the same SHA-256 as the reviewed local export. A `bytes=0-1023` request returned 206 with `Content-Range: bytes 0-1023/5564008`. Poster and captions returned 200 with `image/jpeg` and `text/vtt`.

Actual public landing playback selected the new asset, decoded 1920×1080 at duration 48.366667, reached `readyState=4`, and advanced to 13.54 and 27.49 seconds with `paused=false`. Public playback completed at 48.366667 seconds: `ended=true`, `paused=true`, no media error, and no custom overlay covering the closing title. The ending invitation was visibly present. Public browser console error log was empty. Temporary viewport overrides were reset. Public playback screenshot: `docs/screenshots/demo-film-public.jpg`; phone evidence: `docs/screenshots/demo-film-phone.jpg`.
