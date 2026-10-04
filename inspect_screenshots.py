import os
from PIL import Image

folder = r"paper\User Manual Screenshots"
files = [f for f in os.listdir(folder) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]

print(f"Total screenshots found: {len(files)}")
files.sort()
for i, f in enumerate(files):
    path = os.path.join(folder, f)
    with Image.open(path) as img:
        w, h = img.size
        print(f"[{i+1:02d}] {f} | Size: {w}x{h} | Ratio: {w/h:.2f}")
