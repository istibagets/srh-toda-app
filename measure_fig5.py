import os
from PIL import Image

RAW_DIR = r"paper\User Manual Screenshots"

def find_text_y(im, x_range, y_range, threshold_dark=80):
    pix = im.load()
    ys = []
    for y in range(y_range[0], y_range[1], 5):
        for x in range(x_range[0], x_range[1], 10):
            r, g, b = pix[x, y][:3]
            if r < threshold_dark and g < threshold_dark and b < threshold_dark:
                ys.append(y)
                break
    return ys

# Figure C-05:
im_5a = Image.open(os.path.join(RAW_DIR, "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16).png"))
im_5b = Image.open(os.path.join(RAW_DIR, "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (4).png"))
im_5c = Image.open(os.path.join(RAW_DIR, "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (6).png"))

print("Fig 5A dark rows:", min(find_text_y(im_5a, (200, 900), (1000, 1800))), max(find_text_y(im_5a, (200, 900), (1000, 1800))))
# 5b button
pix5b = im_5b.load()
for y in range(1700, 2200, 10):
    r, g, b = pix5b[589, y][:3]
    if b > 200 and r < 50:
        print("5B button at y =", y)
        break

# 5C white box 'Need Assistance?'
pix5c = im_5c.load()
for y in range(1300, 1800, 10):
    r, g, b = pix5c[589, y][:3]
    if r > 240 and g > 240 and b > 240:
        print("5C white box at y =", y)
        break
