"""Independent reference palettes (PIL median-cut) for the sample images.

Used only by the Playwright harness (verify.js) to prove that the palette the
browser produces actually corresponds to the colors in the image. Not part of
the app.

Run from tests/:  python make-reference.py
"""
import json
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLES = os.path.join(HERE, "..", "images", "samples")


def median_cut(img, n=8):
    """Vanilla median-cut quantization: repeatedly split the widest channel."""
    pixels = list(img.convert("RGB").getdata())

    def spread(bx):
        r = [p[0] for p in bx]; g = [p[1] for p in bx]; b = [p[2] for p in bx]
        return (max(r) - min(r), max(g) - min(g), max(b) - min(b))

    boxes = [pixels]
    while len(boxes) < n:
        best, best_spread, best_ch = -1, -1, 0
        for i, bx in enumerate(boxes):
            if len(bx) < 2:
                continue
            for ch, sp in enumerate(spread(bx)):
                if sp > best_spread:
                    best, best_spread, best_ch = i, sp, ch
        if best < 0:
            break
        bx = sorted(boxes.pop(best), key=lambda p: p[best_ch])
        mid = len(bx) // 2
        boxes += [bx[:mid], bx[mid:]]

    return [
        [round(sum(p[c] for p in bx) / len(bx)) for c in range(3)]
        for bx in boxes if bx
    ]


def main():
    ref = {}
    for name in sorted(os.listdir(SAMPLES)):
        if not name.lower().endswith(".png"):
            continue
        img = Image.open(os.path.join(SAMPLES, name))
        ref[name] = ["#%02X%02X%02X" % tuple(c) for c in median_cut(img, 8)]
        print(name, ref[name])
    with open(os.path.join(HERE, "reference-palettes.json"), "w") as f:
        json.dump(ref, f, indent=2)


if __name__ == "__main__":
    main()