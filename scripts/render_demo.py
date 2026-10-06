"""Render a product film from genuine CUA capture and actual interaction coordinates.

Development tools: Pillow, numpy, imageio-ffmpeg (not application dependencies).
Run: .venv/bin/python scripts/render_demo.py [--preview]
"""

import argparse
from bisect import bisect_right
from functools import lru_cache
import json
from pathlib import Path
import subprocess

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
CAPTURE = ROOT / ".sites-runtime/recording-polished"
OUT = ROOT / ".sites-runtime/demo-film"
OUT.mkdir(parents=True, exist_ok=True)
M = json.loads((CAPTURE / "manifest.json").read_text())
W, H, FPS = 1920, 1080, 60
INTRO, OUTRO = 2.4, 3.0
PAPER, FOREST, LIME = "#f6f8f3", "#172b20", "#c9f17e"
FX, FY, FW, FH = 136, 106, 1648, 924
RAW = sum(s["duration"] for s in M["sections"])
DURATION = INTRO + RAW + OUTRO
FONT_PATH = next((CAPTURE / "fonts").glob("*.ttf"))


def font(size, weight=600):
    f = ImageFont.truetype(str(FONT_PATH), size)
    f.set_variation_by_axes([weight])
    return f


FONTS = {
    "heading": font(46, 650),
    "brand": font(55, 750),
    "footer": font(18, 500),
    "title": font(104, 650),
    "intro_brand": font(88, 750),
    "subtitle": font(32, 500),
    "url": font(30, 600),
}
OFFSETS = []
SECTIONS = []
elapsed = 0
for section in M["sections"]:
    OFFSETS.append(elapsed)
    frames = M["frames"][section["first"] : section["first"] + section["count"]]
    SECTIONS.append({**section, "frames": frames, "times": [f["t"] for f in frames]})
    elapsed += section["duration"]
EVENTS = [{**e, "time": OFFSETS[e["section"]] + e["t"]} for e in M["events"]]
CAPTURE_W, SH = Image.open(CAPTURE / M["frames"][0]["file"]).size
SX, SY = CAPTURE_W / M["viewport"]["width"], SH / M["viewport"]["height"]
SW = CAPTURE_W - 12  # Remove only the captured browser scrollbar; retain coordinate scaling.


def ease(p):
    p = min(1.0, max(0.0, p))
    return p * p * p * (p * (p * 6 - 15) + 10)


def mix(a, b, p):
    return a + (b - a) * p


@lru_cache(maxsize=14)
def source(index):
    return Image.open(CAPTURE / M["frames"][index]["file"]).convert("RGB").crop((0, 0, SW, SH))


def frame_index(raw_time):
    n = min(len(SECTIONS) - 1, max(0, bisect_right(OFFSETS, raw_time) - 1))
    section = SECTIONS[n]
    t = max(0, raw_time - OFFSETS[n])
    i = min(len(section["frames"]) - 1, max(0, bisect_right(section["times"], t) - 1))
    return section["first"] + i


# Each view change is located in the recorded pixels, rather than assumed from
# click time. During the edit, the genuine before/after images crossfade briefly.
TRANSITIONS = []
for event in EVENTS:
    if event["label"] not in {
        "Try the demo",
        "Choose Apple",
        "Review buy",
        "Confirm buy",
        "Portfolio",
        "Return to Apple",
        "Review sell",
        "Confirm sell",
        "Activity",
    }:
        continue
    before = frame_index(event["time"] - 0.03)
    prior = np.array(source(before).resize((160, 90)), dtype=float)
    section = SECTIONS[event["section"]]
    for index in range(before + 1, section["first"] + section["count"]):
        t = OFFSETS[event["section"]] + M["frames"][index]["t"]
        if t > event["time"] + 0.9:
            break
        difference = np.abs(np.array(source(index).resize((160, 90)), dtype=float) - prior).mean()
        if difference > (1.4 if "Review" in event["label"] or "Confirm" in event["label"] else 2.4):
            TRANSITIONS.append({"time": t, "before": before, "after": index, "duration": 0.32, "label": event["label"]})
            break

# Zooms are timed to actions; navigation gets a deliberate pull-back before the
# pointer traverses the screen. All camera rectangles stay inside the capture.
CAMERA = [(0, 1.0, SW / 2, SH / 2)]
for event in EVENTS:
    t = event["time"]
    x, y = event["x"] * SX, event["y"] * SY
    if event["label"] in {"Portfolio", "Activity"}:
        CAMERA.extend([(t - 1.2, 1.0, SW / 2, SH / 2), (t + 0.45, 1.0, SW / 2, SH / 2)])
        CAMERA.append(
            (t + 1.6, 1.15 if event["label"] == "Portfolio" else 1.16, 900 * SX, 475 * SY if event["label"] == "Portfolio" else 350 * SY)
        )
    elif event["label"] == "Try the demo":
        CAMERA.extend([(t - 0.9, 1.0, SW / 2, SH / 2), (t + 0.3, 1.12, x, y), (t + 1.25, 1.0, SW / 2, SH / 2)])
    else:
        z = 1.42 if event["label"] in {"Search stocks", "Choose Apple", "Return to Apple"} else 1.62
        CAMERA.append((t - 0.1, z, x, y))
        CAMERA.append((t + 0.6, z, x, y))
CAMERA.append((RAW - 0.05, 1.16, 900 * SX, 350 * SY))
CAMERA.sort(key=lambda k: k[0])
CAM_TIMES = [k[0] for k in CAMERA]


def camera(t):
    i = max(0, min(len(CAMERA) - 2, bisect_right(CAM_TIMES, t) - 1))
    a, b = CAMERA[i], CAMERA[i + 1]
    p = ease((t - a[0]) / max(0.01, b[0] - a[0]))
    z, cx, cy = [mix(a[j], b[j], p) for j in range(1, 4)]
    cw, ch = SW / z, SH / z
    cx = min(SW - cw / 2, max(cw / 2, cx))
    cy = min(SH - ch / 2, max(ch / 2, cy))
    return cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2


MASK = Image.new("L", (FW, FH), 0)
ImageDraw.Draw(MASK).rounded_rectangle((0, 0, FW - 1, FH - 1), radius=19, fill=255)
BASE = Image.new("RGB", (W, H), PAPER)
shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle((FX, FY + 8, FX + FW, FY + FH + 8), radius=20, fill=(23, 43, 32, 24))
BASE.paste(shadow.filter(ImageFilter.GaussianBlur(16)), (0, 0), shadow.filter(ImageFilter.GaussianBlur(16)))
TITLES = [
    "Try the demo. Skip the forms.",
    "Find Apple. Choose two shares.",
    "Review it. Make the call.",
    "Review it. Make the call.",
    "See your portfolio update.",
    "Sell one share. Follow the result.",
    "Sell one share. Follow the result.",
    "Sell one share. Follow the result.",
    "Every trade, in one place.",
]


# Supersampled cursor edges remain crisp during 60 fps movement.
CURSOR = Image.new("RGBA", (144, 200), (0, 0, 0, 0))
cd = ImageDraw.Draw(CURSOR)
cp = [(0, 0), (0, 32), (8, 25), (14, 40), (21, 37), (15, 22), (26, 21)]
cd.polygon([((x + 6) * 4, (y + 7) * 4) for x, y in cp], fill=(0, 0, 0, 50))
cd.polygon([((x + 4) * 4, (y + 4) * 4) for x, y in cp], fill=(255, 255, 255, 255), outline=(23, 43, 32, 255), width=7)
CURSOR = CURSOR.resize((36, 50), Image.Resampling.LANCZOS)


def draw_cursor(img, raw_time, crop):
    previous = (300 * SX, 510 * SY)
    pos = previous
    for event in EVENTS:
        destination = (event["x"] * SX, event["y"] * SY)
        travel = 0.95
        if raw_time < event["time"] - travel:
            break
        if raw_time < event["time"]:
            p = ease((raw_time - event["time"] + travel) / travel)
            # A small bowed path avoids mechanical straight-line motion.
            bend = 20 * np.sin(np.pi * p)
            pos = (mix(previous[0], destination[0], p), mix(previous[1], destination[1], p) - bend)
            break
        pos = destination
        previous = destination
    x0, y0, x1, y1 = crop

    def project(point):
        return FX + (point[0] - x0) / (x1 - x0) * FW, FY + (point[1] - y0) / (y1 - y0) * FH

    px, py = project(pos)
    # Keep all cursor graphics in the genuine product window.
    layer = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for event in EVENTS:
        dt = raw_time - event["time"]
        if 0 <= dt <= 0.52:
            x, y = project((event["x"] * SX, event["y"] * SY))
            x, y = x - FX, y - FY
            r = 9 + 33 * ease(dt / 0.52)
            alpha = int(185 * (1 - dt / 0.52))
            d.ellipse((x - r, y - r, x + r, y + r), fill=(201, 241, 126, int(alpha * 0.3)), outline=(102, 147, 59, alpha), width=3)
    px, py = px - FX, py - FY
    last_click = max((e["time"] for e in EVENTS if e["time"] <= raw_time), default=-9)
    press = 1 - 0.14 * max(0, 1 - abs(raw_time - last_click - 0.07) / 0.11)
    sprite = CURSOR.resize((round(36 * press), round(50 * press)), Image.Resampling.LANCZOS)
    layer.paste(sprite, (round(px - 4 * press), round(py - 4 * press)), sprite)
    img.paste(layer, (FX, FY), layer)


def product(t):
    img = BASE.copy()
    crop = camera(t)
    index = frame_index(t)
    screen = source(index).transform((FW, FH), Image.Transform.EXTENT, crop, resample=Image.Resampling.BICUBIC)
    for transition in TRANSITIONS:
        dt = t - transition["time"]
        if 0 <= dt < transition["duration"]:
            previous = source(transition["before"]).transform((FW, FH), Image.Transform.EXTENT, crop, resample=Image.Resampling.BICUBIC)
            screen = Image.blend(previous, screen, ease(dt / transition["duration"]))
            break
    img.paste(screen, (FX, FY), MASK)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((FX, FY, FX + FW - 1, FY + FH - 1), radius=19, outline="#dfe6da", width=2)
    n = min(len(OFFSETS) - 1, max(0, bisect_right(OFFSETS, t) - 1))
    heading = Image.new("RGBA", (W, 90), (0, 0, 0, 0))
    hd = ImageDraw.Draw(heading)
    change = t - OFFSETS[n]
    if n > 0 and TITLES[n] != TITLES[n - 1] and change < 0.3:
        alpha = ease(change / 0.3)
        hd.text((FX, 25), TITLES[n - 1], font=FONTS["heading"], fill=(23, 43, 32, round(255 * (1 - alpha))))
        hd.text((FX, 25), TITLES[n], font=FONTS["heading"], fill=(23, 43, 32, round(255 * alpha)))
    else:
        hd.text((FX, 25), TITLES[n], font=FONTS["heading"], fill=FOREST)
    img.paste(heading, (0, 0), heading)
    d.text((1700, 19), "lot", font=FONTS["brand"], fill=FOREST)
    d.text((1782, 19), ".", font=FONTS["brand"], fill="#86ad52")
    d.text((FX, 1045), "Virtual funds. Simulated prices.", font=FONTS["footer"], fill="#637064")
    text = "lot-trading-lab.vercel.app/demo"
    width = d.textlength(text, font=FONTS["footer"])
    d.text((W - FX - width, 1045), text, font=FONTS["footer"], fill="#637064")
    draw_cursor(img, t, crop)
    return img


def bookend(t, ending=False):
    img = Image.new("RGB", (W, H), FOREST)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    p = ease(t / 0.9)
    dy = (1 - p) * 26
    alpha = round(255 * p)
    d.text((176, 138 + dy), "lot", font=FONTS["intro_brand"], fill=(246, 248, 243, alpha))
    d.text((308, 138 + dy), ".", font=FONTS["intro_brand"], fill=(201, 241, 126, alpha))
    lines = ["Your next idea.", "Your trading ground."] if ending else ["Practice trading.", "Keep your money."]
    for i, line in enumerate(lines):
        q = ease((t - 0.12 - i * 0.09) / 0.8)
        d.text((176, 365 + i * 140 + 24 * (1 - q)), line, font=FONTS["title"], fill=(246, 248, 243, round(255 * q)))
    subtitle = "Try the demo. No signup." if ending else "Virtual money. No signup. Just practice."
    d.text((180, 735 + dy), subtitle, font=FONTS["subtitle"], fill=(201, 241, 126, alpha))
    if ending:
        d.text((180, 870 + dy), "lot-trading-lab.vercel.app/demo", font=FONTS["url"], fill=(246, 248, 243, alpha))
    img.paste(layer, (0, 0), layer)
    return img


def render(t):
    if t < INTRO:
        img = bookend(t)
        if t > INTRO - 0.5:
            img = Image.blend(img, product(0), ease((t - INTRO + 0.5) / 0.5))
    elif t < INTRO + RAW:
        img = product(t - INTRO)
        if t > INTRO + RAW - 0.5:
            img = Image.blend(img, bookend(t - (INTRO + RAW - 0.5), True), ease((t - INTRO - RAW + 0.5) / 0.5))
    else:
        img = bookend(t - INTRO - RAW + 0.5, True)
    return img


parser = argparse.ArgumentParser()
parser.add_argument("--preview", action="store_true")
args = parser.parse_args()
preview_times = [
    1.2,
    INTRO + 2,
    INTRO + OFFSETS[1] + 2.3,
    INTRO + OFFSETS[1] + 5,
    INTRO + OFFSETS[2] + 2.6,
    INTRO + OFFSETS[3] + 2.8,
    INTRO + OFFSETS[4] + 3.7,
    INTRO + OFFSETS[6] + 2.8,
    INTRO + OFFSETS[8] + 4,
    DURATION - 1.3,
]
for t in preview_times:
    render(t).save(OUT / f"preview-{t:05.2f}.jpg", quality=95)
contact = Image.new("RGB", (1920, 1250), PAPER)
d = ImageDraw.Draw(contact)
for i, t in enumerate(preview_times):
    frame = render(t)
    frame.thumbnail((630, 354))
    x, y = (i % 3) * 640, (i // 3) * 312
    frame = frame.resize((530, 298), Image.Resampling.LANCZOS)
    contact.paste(frame, (x + 10, y + 12))
contact.save(OUT / "storyboard.jpg", quality=95)
(OUT / "edit.json").write_text(
    json.dumps(
        {
            "duration": DURATION,
            "fps": FPS,
            "size": [W, H],
            "camera": CAMERA,
            "events": EVENTS,
            "transitions": TRANSITIONS,
            "source_frames": len(M["frames"]),
        },
        indent=2,
    )
)
print(json.dumps({"duration": DURATION, "frames": round(DURATION * FPS), "transitions": len(TRANSITIONS)}), flush=True)
if args.preview:
    raise SystemExit(0)

ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
command = [
    ffmpeg,
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-s",
    f"{W}x{H}",
    "-r",
    str(FPS),
    "-i",
    "-",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    str(OUT / "lot-walkthrough.mp4"),
]
process = subprocess.Popen(command, stdin=subprocess.PIPE)
try:
    for i in range(round(DURATION * FPS)):
        process.stdin.write(render(i / FPS).tobytes())
        if i % (FPS * 5) == 0:
            print(f"Rendered {i / FPS:.0f}/{DURATION:.1f} seconds", flush=True)
finally:
    process.stdin.close()
if process.wait() != 0:
    raise SystemExit("FFmpeg encoding failed; published asset was not replaced.")
render(INTRO + OFFSETS[2] + 2.9).save(OUT / "lot-walkthrough.jpg", quality=93)
print("Film ready:", OUT / "lot-walkthrough.mp4", flush=True)
