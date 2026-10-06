# Lot product walkthrough

## Current polished film

Recorded October 5, 2026 from the running Lot app during a fresh local guest session. The capture contains 380 genuine browser frames across nine continuous sections, with gaps between recording steps removed. Twelve actual click coordinates and timestamps ground the animated pointer. Original captures and the interaction manifest remain in the ignored `.sites-runtime/recording-polished/` directory; the previous capture remains intact.

The film is a postproduction edit of actual product use. Camera crops ease toward the real click targets, with gentle pullbacks before navigation. The pointer is reconstructed from logged coordinates and animated between actual actions, with click pulses. Eight brief view crossfades, chapter headings, and animated opening/closing titles complete the edit. UI content and execution outcomes are captured pixels, never recreated or fabricated. Overview zooms preserve company names, holdings, and fill amounts.

Demo entered without registration. Bought two AAPL shares for $475.28; Portfolio showed 27 AAPL shares and $75,052.87 cash. Sold one share for $237.53. Activity showed both completed trades. All funds and prices are simulated. No credentials, personal accounts, or external market keys appear.

Delivery: H.264 MP4, 1920×1080, 60 fps, approximately 48 seconds, no audio. Camera and cursor render at 60 fps; underlying browser capture frames repeat between updates. The MP4 uses faststart. English descriptive captions, an HTML transcript, native controls, an accessible play button, and a direct-video fallback accompany it. The landing requests only the poster until Play. Versioned asset names prevent a cached old movie from appearing with new captions.

Render script: `scripts/render_demo.py`. Development tools: Pillow 12.3.0, numpy 2.5.3, and FFmpeg distributed by imageio-ffmpeg 0.6.0. They are not application runtime dependencies. Title lettering uses Manrope from the official Google Fonts repository under its OFL license. The renderer requires the local capture manifest, frames, and font; these are intentionally excluded from deployment.

Assets: `lot-walkthrough-polished.mp4`, `lot-walkthrough-polished.jpg`, and `lot-walkthrough-polished.vtt`. The previous 40-second video remains available under its original filename for existing direct links.
