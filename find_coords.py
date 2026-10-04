import os
from PIL import Image

RAW_DIR = r"paper\User Manual Screenshots"

def find_colored_box(img, color_rgb, tolerance=15, min_width=100, min_height=30):
    w, h = img.size
    pix = img.load()
    matches = []
    # scan grid
    matched_pixels = []
    for y in range(0, h, 4):
        for x in range(0, w, 4):
            r, g, b = pix[x, y][:3]
            if (abs(r - color_rgb[0]) <= tolerance and 
                abs(g - color_rgb[1]) <= tolerance and 
                abs(b - color_rgb[2]) <= tolerance):
                matched_pixels.append((x, y))
    if not matched_pixels:
        return None
    # find clusters or bounding box
    xs = [p[0] for p in matched_pixels]
    ys = [p[1] for p in matched_pixels]
    return min(xs), min(ys), max(xs), max(ys)

print("Finder ready")
