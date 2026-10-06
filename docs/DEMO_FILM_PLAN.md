# Produce Lot's polished product walkthrough

This plan tracks the new recorded-demo motion request. The repository is `/Users/dricmoybhattacharjee/Desktop/lot-trading-lab`. The public landing plays `public/demo/lot-walkthrough.mp4` through `src/Site.tsx`; the existing recording is genuine local guest trading. This task replaces that movie with a finished product film while preserving actual UI and trade outcomes.

## Purpose

Visitors should quickly understand Lot and follow the exact actions shown. The film will have a clear animated cursor, click feedback, smooth zooms around order controls, transitions between workspace views, readable chapter copy, and a closing invitation to try the demo. A landscape 1080p export will fit the landing player. The same no-signup workspace remains immediately available.

## Progress

- [x] (2026-10-05) Inspect existing source frames, encoded movie, clean checkout, and live goal.
- [x] (2026-10-05) Record a fresh local guest flow with interaction coordinates and timestamps.
- [x] (2026-10-05) Render camera motion, cursor animation, click feedback, chapter transitions, opening and closing titles.
- [x] (2026-10-05) Inspect motion throughout the rendered movie; update poster, captions, transcript, and landing aspect ratio.
- [x] (2026-10-05) Publish the replacement and verify actual playback and assets on the public alias.

## Decisions

Use real browser capture throughout the product flow. Record a 1600×900 landscape viewport and export at 1920×1080 with a restrained ivory/forest presentation. The cursor will be reconstructed from the actual recorded interaction coordinates, then animated between those points. UI numbers and fills are never fabricated. Camera movement will use gentle acceleration and deceleration, with a short pause at each target. Crossfades will connect distinct views; the action itself stays visible. Keep no audio, descriptive captions, native controls, and the written transcript.

## Context and implementation

Local Vite, Django, and Go serve the app at `http://127.0.0.1:5173`. Browser automation uses only the documented CUA interfaces. New raw frames and an interaction log go in ignored `.sites-runtime/recording-polished/`, leaving the previous original capture intact. `scripts/render_demo.py` will read that recording, animate the camera and cursor frame by frame, and pipe the finished frames to FFmpeg using the development-only Pillow and imageio-ffmpeg packages. These tools do not become application dependencies. The public MP4, poster, captions, and provenance are updated together. `src/Site.tsx` receives the new 16:9 dimensions, duration, transcript, and stable asset URLs.

## Milestones

First record a fresh local guest session: open demo, select Apple, buy two shares through review and confirmation, inspect the portfolio, sell one share, and inspect the two completed orders. Record each actual click coordinate before interacting and retain timestamps alongside screenshots. Confirm the displayed fills and portfolio values from the browser.

Next compose a short product film with an opening title, action chapters, quiet branded framing, smooth camera movement, cursor trails between targets, click pulses, view transitions, and closing invitation. Generate preview frames at each chapter and around every transition, watch the complete encoded movie, and revise any clipping, unreadable copy, abrupt camera movement, or cursor mismatch. Regenerate descriptive captions from the final timeline and preserve native playback controls.

Finally replace the landing movie and poster, check the actual local player at desktop and phone sizes, build the changed frontend, and publish under the existing approval. Verify the live video decodes at the intended dimensions, time advances after pressing Play, the asset supports byte ranges, and the public poster/captions match the new version. Save screenshot and release evidence. Commit and push only the reviewed changes to the personal project repository.

## Acceptance

The published film must visibly include smooth zooms that follow the actual click targets, a clear cursor and click feedback, coherent transitions between Trading, Portfolio, and Activity, genuine recorded fills, readable explanatory copy, and polished bookends. It must play through to the closing invitation in the landing player, with captions and transcript available. Screenshots alone do not prove temporal smoothness: inspect encoded frame progression at transitions and watch the full playback. No new backend behavior, database migration, or email-provider setup is required by this video goal.

## Recovery and evidence

Keep both original captures in ignored local directories. Rendering is repeatable and writes a staging movie before replacing the public asset. Failed renders leave the previous public movie usable. `public/demo/RECORDING.md` records provenance, motion effects, format, and actual trade results. `docs/DEMO_FILM_QA.md` will contain final frame, playback, motion, and deployment evidence.

## Outcomes and discoveries

The original movie contains 355 browser frames and genuine buy/sell outcomes, but does not contain a captured pointer. A fresh interaction log will allow accurate cursor reconstruction and more deliberate pacing. The new movie is a postproduction edit of actual product use; this distinction belongs in its provenance.

Fresh capture completed: 380 genuine frames, nine sections, 12 actual click coordinates at 1600×900. Buy filled $475.28; portfolio showed 27 AAPL shares and $75,052.87 cash; selling one filled $237.53. Revised overview zooms preserve company names and fill amounts. A 12-pixel browser scrollbar trim retains the original cursor coordinate scale. The revised storyboard was visually inspected before full encoding.

The polished film is published on the existing production alias. All 2,902 encoded frames decode; delivery is 1920×1080, 60 fps, 48.366667 seconds. Local desktop and phone playback, and public desktop playback, reached the closing invitation. Public MP4 bytes match the local export; byte-range delivery, poster, captions, and health returned the expected successful responses. Chapter/transition progression and cursor movement were reviewed from the encoded file. The replay overlay was removed at completion to keep the closing title clear. See `docs/DEMO_FILM_QA.md` for the completed release evidence.
