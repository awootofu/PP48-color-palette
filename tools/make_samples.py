"""Generate the sample images used by the Color Palette Identifier demo.

Pure PIL, no external assets. Run:  python tools/make_samples.py
"""
import os
import math
import random
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "images", "samples")
W, H = 360, 260


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def gradient_mesh(path):
    """Four-corner bilinear gradient with a soft noise wash."""
    tl = (255, 94, 125)     # pink
    tr = (255, 196, 113)    # amber
    bl = (60, 120, 216)     # blue
    br = (47, 209, 165)     # teal
    img = Image.new("RGB", (W, H))
    px = img.load()
    for y in range(H):
        ty = y / (H - 1)
        for x in range(W):
            tx = x / (W - 1)
            px[x, y] = lerp(lerp(tl, tr, tx), lerp(bl, br, tx), ty)

    rnd = random.Random(7)
    noise = Image.new("L", (W // 4, H // 4))
    noise.putdata([rnd.randint(0, 60) for _ in range((W // 4) * (H // 4))])
    noise = noise.resize((W, H), Image.BICUBIC)
    return Image.blend(img, Image.merge("RGB", (noise, noise, noise)), 0.13)


def sunset(path):
    """Warm vertical gradient plus a sun disc and a dark horizon."""
    top = (26, 22, 58)
    mid = (196, 68, 104)
    bot = (252, 176, 69)
    img = Image.new("RGB", (W, H))
    px = img.load()
    for y in range(H):
        t = y / (H - 1)
        c = lerp(top, mid, t / 0.62) if t < 0.62 else lerp(mid, bot, (t - 0.62) / 0.38)
        for x in range(W):
            px[x, y] = c
    d = ImageDraw.Draw(img)
    cx, cy, r = int(W * 0.68), int(H * 0.60), 46
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 236, 178))
    d.rectangle([0, int(H * 0.82), W, H], fill=(36, 24, 38))
    return img


def forest(path):
    """Layered greens with canopy blobs."""
    img = Image.new("RGB", (W, H), (28, 74, 48))
    px = img.load()
    for y in range(H):
        t = y / (H - 1)
        c = lerp((38, 104, 66), (14, 42, 30), t)
        for x in range(W):
            px[x, y] = c
    d = ImageDraw.Draw(img)
    rnd = random.Random(21)
    for _ in range(120):
        cx, cy = rnd.randint(0, W), rnd.randint(0, int(H * 0.75))
        r = rnd.randint(14, 40)
        shade = rnd.choice([(58, 138, 82), (24, 88, 58), (96, 168, 96), (18, 62, 44)])
        d.ellipse([cx - r, cy - r // 2, cx + r, cy + r // 2], fill=shade)
    d.rectangle([0, int(H * 0.88), W, H], fill=(16, 34, 26))
    return img


def color_blocks(path):
    """A clean 4x3 grid of clearly distinct colors."""
    cols = [4, 3]
    grid = [
        (230, 57, 70),   (241, 196, 15), (26, 188, 156), (52, 152, 219),
        (155, 89, 182),  (230, 126, 34), (22, 160, 133), (192, 57, 43),
        (41, 128, 185),  (244, 208, 63), (39, 174, 96),  (44, 62, 80),
    ]
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    cw, ch = W / cols[0], H / cols[1]
    for i, c in enumerate(grid):
        x, y = (i % cols[0]) * cw, (i // cols[0]) * ch
        d.rectangle([x, y, x + cw, y + ch], fill=c)
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    out = os.path.abspath(OUT)
    jobs = [
        ("gradient-mesh.png", gradient_mesh),
        ("sunset.png", sunset),
        ("forest.png", forest),
        ("color-blocks.png", color_blocks),
    ]
    for name, fn in jobs:
        img = fn(os.path.join(out, name))
        p = os.path.join(out, name)
        img.save(p, "PNG", optimize=True)
        print("wrote", p, os.path.getsize(p), "bytes")


if __name__ == "__main__":
    main()