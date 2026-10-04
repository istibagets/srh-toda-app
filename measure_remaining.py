import os
from PIL import Image

RAW_DIR = r"paper\User Manual Screenshots"

def find_y_for_text(im, x, y_start, y_end, is_dark=True):
    pix = im.load()
    for y in range(y_start, y_end, 5):
        r, g, b = pix[x, y][:3]
        if is_dark and (r < 80 and g < 80 and b < 80):
            return y
        elif not is_dark and (r > 200 and g > 200 and b > 200):
            return y
    return None

# Check Figure C-13:
im13a = Image.open(os.path.join(RAW_DIR, "srh-link-toda-ionic.duckdns.org_tabs_history(iPhone 16).png"))
im13b = Image.open(os.path.join(RAW_DIR, "srh-link-toda-ionic.duckdns.org_tabs_history(iPhone 16) (1).png"))
print("13A size:", im13a.size)
print("13B size:", im13b.size)

# Check Figure C-14:
im14a = Image.open(os.path.join(RAW_DIR, "srh-link-toda-ionic.duckdns.org_tabs_earnings(iPhone 16).png"))
im14b = Image.open(os.path.join(RAW_DIR, "srh-link-toda-ionic.duckdns.org_tabs_earnings(iPhone 16) (1).png"))
print("14A size:", im14a.size)
print("14B size:", im14b.size)

# Check Figure C-15:
im15a = Image.open(os.path.join(RAW_DIR, "srh-link-toda-ionic.duckdns.org_tabs_admin(iPhone 16) (1).png"))
im15b = Image.open(os.path.join(RAW_DIR, "srh-link-toda-ionic.duckdns.org_tabs_admin(iPhone 16) (2).png"))
print("15A size:", im15a.size)
print("15B size:", im15b.size)

# Check Figure C-16:
im16a = Image.open(os.path.join(RAW_DIR, "srh-link-toda-ionic.duckdns.org_tabs_admin(iPhone 16) (4).png"))
im16b = Image.open(os.path.join(RAW_DIR, "srh-link-toda-ionic.duckdns.org_tabs_admin(iPhone 16) (5).png"))
print("16A size:", im16a.size)
print("16B size:", im16b.size)

# Check Figure C-17:
im17a = Image.open(os.path.join(RAW_DIR, "srh-link-toda-ionic.duckdns.org_tabs_admin(iPhone 16) (7).png"))
im17b = Image.open(os.path.join(RAW_DIR, "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (7).png"))
print("17A size:", im17a.size)
print("17B size:", im17b.size)

# Check Figure C-21:
im21a = Image.open(os.path.join(RAW_DIR, "srh-link-toda-ionic.duckdns.org_tabs_profile(iPhone 16) (5).png"))
im21b = Image.open(os.path.join(RAW_DIR, "srh-link-toda-ionic.duckdns.org_tabs_profile(iPhone 16) (4).png"))
print("21A size:", im21a.size)
print("21B size:", im21b.size)
