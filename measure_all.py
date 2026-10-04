import os
from PIL import Image

RAW_DIR = r"paper\User Manual Screenshots"

# Figure C-01:
# Raw: srh-link-toda-ionic.duckdns.org_login(iPhone 16).png (1179 x 2556)
# Cropped to: crop_box=(0, 600, 1179, 1950) -> cropped height = 1350
# Let's inspect the cropped image elements:
# Logo is centered at x=589. Top of logo card ~ 750 (raw) -> in crop: 750 - 600 = 150. Center of tricycle icon ~ 240.
# "SRH LINK-TODA" title: y ~ 1160 (raw) -> in crop: 560.
# Subtitle "Connect with verified TODA drivers...": y ~ 1300 (raw) -> in crop: 700.
# GET STARTED button: y ~ 1480 (raw) -> in crop: 880.
# I ALREADY HAVE AN ACCOUNT: y ~ 1650 (raw) -> in crop: 1050.

# Let's verify by testing exact color bounding boxes in python:
def inspect_fig1():
    img = Image.open(os.path.join(RAW_DIR, "srh-link-toda-ionic.duckdns.org_login(iPhone 16).png"))
    crop = img.crop((0, 600, 1179, 1950))
    # find blue button "GET STARTED" (color ~ #2563eb = 37, 99, 235)
    # find "I ALREADY HAVE AN ACCOUNT" button border
    print("Fig 1 cropped size:", crop.size)

inspect_fig1()
