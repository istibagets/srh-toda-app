import os
import math
from PIL import Image, ImageDraw, ImageFont

RAW_DIR = r"paper\User Manual Screenshots"
OUT_DIR = r"paper\arranged screenshots"
os.makedirs(OUT_DIR, exist_ok=True)

def get_font(size, bold=True):
    font_paths = [
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\seguiui.ttf",
        r"C:\Windows\Fonts\tahoma.ttf",
    ]
    for p in font_paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()

def draw_callout_with_arrow(draw, cx, cy, tx, ty, num_str, radius=32, fill_color="#2563EB", stroke_color="#FFFFFF"):
    """
    Draws a numbered circular badge at (cx, cy) and an arrow with an arrowhead pointing at (tx, ty).
    """
    dx = tx - cx
    dy = ty - cy
    dist = math.hypot(dx, dy)
    
    if dist > radius + 12:
        ux, uy = dx / dist, dy / dist
        px, py = -uy, ux
        sx = cx + ux * radius
        sy = cy + uy * radius
        
        arrow_len = 22
        arrow_w = 16
        bx = tx - ux * arrow_len
        by = ty - uy * arrow_len
        
        # Shadow
        draw.line([(sx + 3, sy + 3), (bx + 3, by + 3)], fill="#00000044", width=7)
        # White border
        draw.line([(sx, sy), (bx, by)], fill=stroke_color, width=7)
        # Vibrant solid core
        draw.line([(sx, sy), (bx, by)], fill=fill_color, width=4)
        
        # Arrowhead coordinates
        p_tip = (tx, ty)
        p_l = (bx + px * (arrow_w / 2), by + py * (arrow_w / 2))
        p_r = (bx - px * (arrow_w / 2), by - py * (arrow_w / 2))
        
        draw.polygon([(p_tip[0] + 3, p_tip[1] + 3), (p_l[0] + 3, p_l[1] + 3), (p_r[0] + 3, p_r[1] + 3)], fill="#00000044")
        draw.polygon([p_tip, p_l, p_r], fill=fill_color, outline=stroke_color)
        
        # Target dot at tip
        draw.ellipse([tx - 5, ty - 5, tx + 5, ty + 5], fill=fill_color, outline=stroke_color, width=2)
        
    # Badge Shadow
    draw.ellipse([cx - radius + 3, cy - radius + 4, cx + radius + 3, cy + radius + 4], fill="#00000055")
    # Badge circle
    draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=fill_color, outline=stroke_color, width=4)
    
    font = get_font(int(radius * 1.05), bold=True)
    bbox = draw.textbbox((0, 0), str(num_str), font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text((cx - tw / 2, cy - th / 2 - 2), str(num_str), fill="#FFFFFF", font=font)

def save_figure(img, filename):
    out_path = os.path.join(OUT_DIR, filename)
    try:
        img.save(out_path)
    except Exception:
        tmp_path = os.path.join(OUT_DIR, "tmp_" + filename)
        img.save(tmp_path)
        if os.path.exists(out_path):
            try:
                os.remove(out_path)
            except Exception:
                pass
        try:
            os.replace(tmp_path, out_path)
        except Exception:
            pass
    print(f"Saved {filename}")

def create_single_panel(img_filename, callouts, panel_title, crop_box=None, margin_x=140, target_width=1200):
    raw_img = Image.open(os.path.join(RAW_DIR, img_filename)).convert("RGBA")
    if crop_box:
        raw_img = raw_img.crop(crop_box)
        
    header_h = 80
    w = raw_img.width + margin_x * 2
    h = raw_img.height + header_h + 30
    
    canvas = Image.new("RGBA", (w, h), "#F8FAFC")
    draw = ImageDraw.Draw(canvas)
    
    font_title = get_font(36, bold=True)
    draw.rectangle([0, 0, w, header_h], fill="#0F172A")
    draw.text((40, 22), panel_title, fill="#FFFFFF", font=font_title)
    
    canvas.paste(raw_img, (margin_x, header_h + 15))
    draw.rectangle([margin_x, header_h + 15, margin_x + raw_img.width, header_h + 15 + raw_img.height], outline="#CBD5E1", width=3)
    
    for c in callouts:
        cx = margin_x + c["cx"] if "cx_abs" not in c else c["cx_abs"]
        cy = header_h + 15 + c["cy"] if "cy_abs" not in c else c["cy_abs"]
        tx = margin_x + c["tx"]
        ty = header_h + 15 + c["ty"]
        draw_callout_with_arrow(draw, cx, cy, tx, ty, str(c["num"]), radius=c.get("r", 32), fill_color=c.get("color", "#2563EB"))
        
    if target_width and canvas.width != target_width:
        ratio = target_width / canvas.width
        canvas = canvas.resize((target_width, int(canvas.height * ratio)), Image.Resampling.LANCZOS)
    return canvas.convert("RGB")

def create_double_panel(img1_name, img2_name, callouts1, callouts2, title1, title2, margin_side=120, target_width=1600):
    img1 = Image.open(os.path.join(RAW_DIR, img1_name)).convert("RGBA")
    img2 = Image.open(os.path.join(RAW_DIR, img2_name)).convert("RGBA")
    
    target_h = 2556
    img1 = img1.resize((int(img1.width * target_h / img1.height), target_h), Image.Resampling.LANCZOS)
    img2 = img2.resize((int(img2.width * target_h / img2.height), target_h), Image.Resampling.LANCZOS)
    
    gap = 60
    header_h = 90
    total_w = img1.width + img2.width + gap + margin_side * 2
    total_h = target_h + header_h + 40
    
    canvas = Image.new("RGBA", (total_w, total_h), "#F1F5F9")
    draw = ImageDraw.Draw(canvas)
    font_hdr = get_font(34, bold=True)
    
    x1 = margin_side
    draw.rectangle([x1, 15, x1 + img1.width, 15 + header_h - 15], fill="#1E293B")
    draw.text((x1 + 30, 26), title1, fill="#FFFFFF", font=font_hdr)
    canvas.paste(img1, (x1, header_h + 10))
    draw.rectangle([x1, header_h + 10, x1 + img1.width, header_h + 10 + target_h], outline="#CBD5E1", width=4)
    
    x2 = x1 + img1.width + gap
    draw.rectangle([x2, 15, x2 + img2.width, 15 + header_h - 15], fill="#1E293B")
    draw.text((x2 + 30, 26), title2, fill="#FFFFFF", font=font_hdr)
    canvas.paste(img2, (x2, header_h + 10))
    draw.rectangle([x2, header_h + 10, x2 + img2.width, header_h + 10 + target_h], outline="#CBD5E1", width=4)
    
    for c in callouts1:
        cx = c["cx_abs"] if "cx_abs" in c else (x1 + c["cx"])
        cy = header_h + 10 + c["cy"]
        tx = x1 + c["tx"]
        ty = header_h + 10 + c["ty"]
        draw_callout_with_arrow(draw, cx, cy, tx, ty, str(c["num"]), radius=c.get("r", 32), fill_color=c.get("color", "#2563EB"))
        
    for c in callouts2:
        cx = c["cx_abs"] if "cx_abs" in c else (x2 + c["cx"])
        cy = header_h + 10 + c["cy"]
        tx = x2 + c["tx"]
        ty = header_h + 10 + c["ty"]
        draw_callout_with_arrow(draw, cx, cy, tx, ty, str(c["num"]), radius=c.get("r", 32), fill_color=c.get("color", "#059669"))
        
    if target_width and canvas.width != target_width:
        ratio = target_width / canvas.width
        canvas = canvas.resize((target_width, int(canvas.height * ratio)), Image.Resampling.LANCZOS)
    return canvas.convert("RGB")

def create_triple_panel(img1_name, img2_name, img3_name, calls1, calls2, calls3, title1, title2, title3, target_width=1800):
    img1 = Image.open(os.path.join(RAW_DIR, img1_name)).convert("RGBA")
    img2 = Image.open(os.path.join(RAW_DIR, img2_name)).convert("RGBA")
    img3 = Image.open(os.path.join(RAW_DIR, img3_name)).convert("RGBA")
    
    target_h = 2556
    img1 = img1.resize((int(img1.width * target_h / img1.height), target_h), Image.Resampling.LANCZOS)
    img2 = img2.resize((int(img2.width * target_h / img2.height), target_h), Image.Resampling.LANCZOS)
    img3 = img3.resize((int(img3.width * target_h / img3.height), target_h), Image.Resampling.LANCZOS)
    
    gap = 40
    margin_side = 120
    header_h = 90
    total_w = img1.width + img2.width + img3.width + gap * 2 + margin_side * 2
    total_h = target_h + header_h + 40
    
    canvas = Image.new("RGBA", (total_w, total_h), "#F1F5F9")
    draw = ImageDraw.Draw(canvas)
    font_hdr = get_font(34, bold=True)
    
    panels = [
        (img1, title1, calls1, "#2563EB"),
        (img2, title2, calls2, "#059669"),
        (img3, title3, calls3, "#D97706"),
    ]
    
    curr_x = margin_side
    for i, (img, title, calls, color) in enumerate(panels):
        draw.rectangle([curr_x, 15, curr_x + img.width, 15 + header_h - 15], fill="#1E293B")
        draw.text((curr_x + 30, 26), title, fill="#FFFFFF", font=font_hdr)
        canvas.paste(img, (curr_x, header_h + 10))
        draw.rectangle([curr_x, header_h + 10, curr_x + img.width, header_h + 10 + target_h], outline="#CBD5E1", width=4)
        
        for c in calls:
            cx = c["cx_abs"] if "cx_abs" in c else (curr_x + c["cx"])
            cy = header_h + 10 + c["cy"]
            tx = curr_x + c["tx"]
            ty = header_h + 10 + c["ty"]
            draw_callout_with_arrow(draw, cx, cy, tx, ty, str(c["num"]), radius=c.get("r", 32), fill_color=c.get("color", color))
            
        curr_x += img.width + gap
        
    if target_width and canvas.width != target_width:
        ratio = target_width / canvas.width
        canvas = canvas.resize((target_width, int(canvas.height * ratio)), Image.Resampling.LANCZOS)
    return canvas.convert("RGB")

def create_desktop_panel(img_filename, callouts, panel_title, target_width=1600):
    img = Image.open(os.path.join(RAW_DIR, img_filename)).convert("RGBA")
    w, h = img.size
    
    header_h = 100
    canvas = Image.new("RGBA", (w, h + header_h), "#F8FAFC")
    draw = ImageDraw.Draw(canvas)
    
    font_title = get_font(46, bold=True)
    draw.rectangle([0, 0, w, header_h], fill="#0F172A")
    draw.text((45, 26), panel_title, fill="#FFFFFF", font=font_title)
    canvas.paste(img, (0, header_h))
    
    for c in callouts:
        cy = c["cy"] + header_h
        ty = c["ty"] + header_h
        draw_callout_with_arrow(draw, c["cx"], cy, c["tx"], ty, str(c["num"]), radius=c.get("r", 46), fill_color=c.get("color", "#2563EB"))
        
    if target_width and canvas.width != target_width:
        ratio = target_width / canvas.width
        canvas = canvas.resize((target_width, int(canvas.height * ratio)), Image.Resampling.LANCZOS)
    return canvas.convert("RGB")

print("Rendering all 21 arranged figures with precision callout badges and arrows...")

# 1. Figure C-01: Public Landing Page
fig1 = create_single_panel(
    "srh-link-toda-ionic.duckdns.org_login(iPhone 16).png",
    [
        {"num": 1, "cx": -70, "cy": 180, "tx": 400, "ty": 260},
        {"num": 2, "cx": -70, "cy": 570, "tx": 220, "ty": 570},
        {"num": 3, "cx": 1250, "cy": 700, "tx": 960, "ty": 700},
        {"num": 4, "cx": -70, "cy": 900, "tx": 200, "ty": 900},
        {"num": 5, "cx": 1250, "cy": 1060, "tx": 980, "ty": 1060},
    ],
    panel_title="Public Welcome Portal & Landing Gateway",
    crop_box=(0, 600, 1179, 1950),
    margin_x=140
)
save_figure(fig1, "Figure_C-01_Public_Landing_Page.png")

# 2. Figure C-02: Portal Sign-In Form
fig2 = create_single_panel(
    "srh-link-toda-ionic.duckdns.org_login(iPhone 16) (1).png",
    [
        {"num": 1, "cx": -70, "cy": 100, "tx": 100, "ty": 100},
        {"num": 2, "cx": 800, "cy": 160, "tx": 540, "ty": 270},
        {"num": 3, "cx": -70, "cy": 510, "tx": 120, "ty": 510},
        {"num": 4, "cx": 1250, "cy": 740, "tx": 990, "ty": 740},
        {"num": 5, "cx": -70, "cy": 920, "tx": 90, "ty": 920},
        {"num": 6, "cx": 1250, "cy": 1120, "tx": 990, "ty": 1120},
        {"num": 7, "cx": 589, "cy": 1420, "tx": 589, "ty": 1320},
    ],
    panel_title="Secure Portal Sign-In & Authentication Form",
    crop_box=(0, 560, 1179, 2020),
    margin_x=140
)
save_figure(fig2, "Figure_C-02_Portal_Sign_In_Form.png")

# 3. Figure C-03: Passenger Registration Flow
fig3 = create_triple_panel(
    "srh-link-toda-ionic.duckdns.org_register(iPhone 16).png",
    "srh-link-toda-ionic.duckdns.org_register(iPhone 16) (1).png",
    "srh-link-toda-ionic.duckdns.org_register(iPhone 16) (2).png",
    [
        {"num": 1, "cx_abs": 50, "cy": 600, "tx": 200, "ty": 600},
        {"num": 2, "cx_abs": 50, "cy": 1350, "tx": 250, "ty": 1350},
        {"num": 3, "cx": 750, "cy": 1050, "tx": 750, "ty": 1220},
        {"num": 4, "cx_abs": 50, "cy": 1850, "tx": 250, "ty": 1850},
    ],
    [
        {"num": 5, "cx": 120, "cy": 1350, "tx": 300, "ty": 1350},
        {"num": 6, "cx": 1060, "cy": 1580, "tx": 880, "ty": 1580},
        {"num": 7, "cx": 120, "cy": 1800, "tx": 300, "ty": 1800},
    ],
    [
        {"num": 8, "cx": 120, "cy": 1400, "tx": 300, "ty": 1400},
        {"num": 9, "cx": 120, "cy": 1650, "tx": 300, "ty": 1650},
        {"num": 10, "cx": 589, "cy": 2050, "tx": 589, "ty": 1880},
    ],
    title1="Step 1: Role Selection",
    title2="Step 2: Personal Details",
    title3="Step 3: Security & Terms"
)
save_figure(fig3, "Figure_C-03_Passenger_Registration_Flow.png")

# 4. Figure C-04: Driver Registration Credentials & 2FA OTP
fig4 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_register(iPhone 16) (6).png",
    "srh-link-toda-ionic.duckdns.org_register(iPhone 16) (7).png",
    [
        {"num": 1, "cx_abs": 50, "cy": 640, "tx": 200, "ty": 640},
        {"num": 2, "cx_abs": 50, "cy": 920, "tx": 250, "ty": 920},
        {"num": 3, "cx_abs": 50, "cy": 1180, "tx": 250, "ty": 1180},
        {"num": 4, "cx_abs": 50, "cy": 1480, "tx": 250, "ty": 1480},
        {"num": 5, "cx_abs": 50, "cy": 1850, "tx": 250, "ty": 1850},
    ],
    [
        {"num": 6, "cx": 1240, "cy": 640, "tx": 980, "ty": 640},
        {"num": 7, "cx": 1240, "cy": 980, "tx": 980, "ty": 980},
        {"num": 8, "cx": 1240, "cy": 1180, "tx": 980, "ty": 1180},
        {"num": 9, "cx": 1240, "cy": 1780, "tx": 980, "ty": 1780},
    ],
    title1="Step 4: MTOP Credentials & Document Upload",
    title2="Step 5: Two-Factor Gmail OTP Verification"
)
save_figure(fig4, "Figure_C-04_Driver_Registration_Credentials.png")

# 5. Figure C-05: Driver Accreditation Review Statuses
fig5 = create_triple_panel(
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16).png",
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (4).png",
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (6).png",
    [
        {"num": 1, "cx_abs": 50, "cy": 840, "tx": 220, "ty": 840},
        {"num": 2, "cx_abs": 50, "cy": 1180, "tx": 220, "ty": 1180},
        {"num": 3, "cx_abs": 50, "cy": 1500, "tx": 220, "ty": 1500},
    ],
    [
        {"num": 4, "cx": 589, "cy": 680, "tx": 589, "ty": 820},
        {"num": 5, "cx": 200, "cy": 1380, "tx": 380, "ty": 1240},
        {"num": 6, "cx": 589, "cy": 2150, "tx": 589, "ty": 1960},
    ],
    [
        {"num": 7, "cx": 1240, "cy": 840, "tx": 980, "ty": 840},
        {"num": 8, "cx": 1240, "cy": 1300, "tx": 980, "ty": 1300},
    ],
    title1="Status A: Pending Review",
    title2="Status B: Action Required / Declined",
    title3="Status C: Revoked / Removed"
)
save_figure(fig5, "Figure_C-05_Driver_Accreditation_Statuses.png")

# 6. Figure C-06: Passenger Booking Sheet & Fare Calculation Modal
fig6 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (15).png",
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (16).png",
    [
        {"num": 1, "cx_abs": 50, "cy": 800, "tx": 300, "ty": 800},
        {"num": 2, "cx": 1140, "cy": 1560, "tx": 950, "ty": 1690},
        {"num": 3, "cx_abs": 50, "cy": 1890, "tx": 300, "ty": 1890},
        {"num": 4, "cx_abs": 50, "cy": 2060, "tx": 300, "ty": 2060},
    ],
    [
        {"num": 5, "cx": 1240, "cy": 1300, "tx": 960, "ty": 1300},
        {"num": 6, "cx": 1240, "cy": 1470, "tx": 960, "ty": 1470},
        {"num": 7, "cx": 1240, "cy": 1640, "tx": 960, "ty": 1640},
        {"num": 8, "cx": 1240, "cy": 1840, "tx": 960, "ty": 1840},
        {"num": 9, "cx": 1240, "cy": 2050, "tx": 960, "ty": 2050},
    ],
    title1="Panel A: Commuter Action Sheet & Regulated Fares",
    title2="Panel B: Ride Request & Distance Calculation Modal"
)
save_figure(fig6, "Figure_C-06_Passenger_Ride_Booking_Modal.png")

# 7. Figure C-07: Fare Bargaining & Counter-Proposal Negotiation
fig7 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (18).png",
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (20).png",
    [
        {"num": 1, "cx_abs": 50, "cy": 1480, "tx": 240, "ty": 1480},
        {"num": 2, "cx_abs": 50, "cy": 1680, "tx": 240, "ty": 1680},
        {"num": 3, "cx_abs": 50, "cy": 1960, "tx": 240, "ty": 1960},
        {"num": 4, "cx_abs": 50, "cy": 2100, "tx": 240, "ty": 2100},
        {"num": 5, "cx_abs": 50, "cy": 2280, "tx": 240, "ty": 2280},
    ],
    [
        {"num": 6, "cx": 1240, "cy": 1680, "tx": 980, "ty": 1680},
        {"num": 7, "cx": 1240, "cy": 1860, "tx": 980, "ty": 1860},
        {"num": 8, "cx": 1240, "cy": 2140, "tx": 980, "ty": 2140},
    ],
    title1="Panel A: Driver Incoming Offer & Bargaining Counter",
    title2="Panel B: Passenger Proposed Fare Review Modal"
)
save_figure(fig7, "Figure_C-07_Fare_Bargaining_Negotiation.png")

# 8. Figure C-08: En Route Navigation & In-App Trip Chat
fig8 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (21).png",
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (24).png",
    [
        {"num": 1, "cx_abs": 50, "cy": 1350, "tx": 240, "ty": 1350},
        {"num": 2, "cx_abs": 50, "cy": 1500, "tx": 240, "ty": 1500},
        {"num": 3, "cx_abs": 50, "cy": 1750, "tx": 240, "ty": 1750},
        {"num": 4, "cx": 1050, "cy": 1750, "tx": 820, "ty": 1750},
        {"num": 5, "cx_abs": 50, "cy": 2250, "tx": 240, "ty": 2250},
    ],
    [
        {"num": 6, "cx": 1240, "cy": 240, "tx": 980, "ty": 240},
        {"num": 7, "cx": 1240, "cy": 510, "tx": 980, "ty": 510},
        {"num": 8, "cx": 1240, "cy": 1050, "tx": 980, "ty": 1050},
        {"num": 9, "cx": 1240, "cy": 2250, "tx": 980, "ty": 2250},
    ],
    title1="Panel A: Driver Navigation En Route to Pickup",
    title2="Panel B: Real-Time In-App Commuter Trip Chat"
)
save_figure(fig8, "Figure_C-08_En_Route_Navigation_Trip_Chat.png")

# 9. Figure C-09: Driver Arrival & In-Transit Drop-Off Completion
fig9 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (25).png",
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (27).png",
    [
        {"num": 1, "cx_abs": 50, "cy": 1400, "tx": 240, "ty": 1400},
        {"num": 2, "cx_abs": 50, "cy": 1580, "tx": 240, "ty": 1580},
        {"num": 3, "cx_abs": 50, "cy": 2250, "tx": 240, "ty": 2250},
    ],
    [
        {"num": 4, "cx": 1240, "cy": 1450, "tx": 980, "ty": 1450},
        {"num": 5, "cx": 1240, "cy": 1600, "tx": 980, "ty": 1600},
        {"num": 6, "cx": 1240, "cy": 2250, "tx": 980, "ty": 2250},
    ],
    title1="Panel A: Arrived at Pickup & Boarding",
    title2="Panel B: On Trip In Transit & Drop-Off Completion"
)
save_figure(fig9, "Figure_C-09_Driver_Arrival_Dropoff_Completion.png")

# 10. Figure C-10: Terminal Return & Passenger 5-Star Rating Modal
fig10 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (30).png",
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (31).png",
    [
        {"num": 1, "cx_abs": 50, "cy": 150, "tx": 240, "ty": 150},
        {"num": 2, "cx_abs": 50, "cy": 800, "tx": 240, "ty": 800},
        {"num": 3, "cx_abs": 50, "cy": 2250, "tx": 240, "ty": 2250},
    ],
    [
        {"num": 4, "cx": 1240, "cy": 450, "tx": 980, "ty": 450},
        {"num": 5, "cx": 1240, "cy": 650, "tx": 980, "ty": 650},
        {"num": 6, "cx": 1240, "cy": 900, "tx": 980, "ty": 900},
        {"num": 7, "cx": 1240, "cy": 1250, "tx": 980, "ty": 1250},
        {"num": 8, "cx": 1240, "cy": 2250, "tx": 980, "ty": 2250},
    ],
    title1="Panel A: Driver Returning to Terminal Station",
    title2="Panel B: Passenger 5-Star Service Rating Modal"
)
save_figure(fig10, "Figure_C-10_Terminal_Return_Passenger_Rating.png")

# 11. Figure C-11: Driver Queue Hero Card & Geofenced Positioning
fig11 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (1).png",
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (3).png",
    [
        {"num": 1, "cx_abs": 50, "cy": 1450, "tx": 240, "ty": 1450},
        {"num": 2, "cx_abs": 50, "cy": 1750, "tx": 240, "ty": 1750},
        {"num": 3, "cx_abs": 50, "cy": 2050, "tx": 240, "ty": 2050},
    ],
    [
        {"num": 4, "cx": 1240, "cy": 450, "tx": 980, "ty": 450},
        {"num": 5, "cx": 1240, "cy": 700, "tx": 980, "ty": 700},
        {"num": 6, "cx": 1240, "cy": 900, "tx": 980, "ty": 900},
        {"num": 7, "cx": 1240, "cy": 1350, "tx": 980, "ty": 1350},
    ],
    title1="Panel A: Off-Duty Status & Geofence Warning",
    title2="Panel B: On-Duty #1 in Queue Radiant Hero Card"
)
save_figure(fig11, "Figure_C-11_Driver_Queue_Hero_Card.png")

# 12. Figure C-12: Terminal Walk-In & Wayside Dispatch Modals
fig12 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (10).png",
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (13).png",
    [
        {"num": 1, "cx_abs": 50, "cy": 1350, "tx": 240, "ty": 1350},
        {"num": 2, "cx_abs": 50, "cy": 1500, "tx": 240, "ty": 1500},
        {"num": 3, "cx_abs": 50, "cy": 1700, "tx": 240, "ty": 1700},
        {"num": 4, "cx_abs": 50, "cy": 1950, "tx": 240, "ty": 1950},
        {"num": 5, "cx_abs": 50, "cy": 2250, "tx": 240, "ty": 2250},
    ],
    [
        {"num": 6, "cx": 1240, "cy": 1350, "tx": 980, "ty": 1350},
        {"num": 7, "cx": 1240, "cy": 1500, "tx": 980, "ty": 1500},
        {"num": 8, "cx": 1240, "cy": 1700, "tx": 980, "ty": 1700},
        {"num": 9, "cx": 1240, "cy": 2250, "tx": 980, "ty": 2250},
    ],
    title1="Panel A: Terminal Walk-In Commuter Dispatch",
    title2="Panel B: Returning Wayside Passenger Dispatch"
)
save_figure(fig12, "Figure_C-12_WalkIn_Wayside_Dispatch.png")

# 13. Figure C-13: Trip History Ledger & Digital Fare Receipt
fig13 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_tabs_history(iPhone 16).png",
    "srh-link-toda-ionic.duckdns.org_tabs_history(iPhone 16) (1).png",
    [
        {"num": 1, "cx_abs": 50, "cy": 360, "tx": 240, "ty": 360},
        {"num": 2, "cx_abs": 50, "cy": 820, "tx": 240, "ty": 820},
        {"num": 3, "cx_abs": 50, "cy": 1180, "tx": 240, "ty": 1180},
    ],
    [
        {"num": 4, "cx": 1240, "cy": 450, "tx": 980, "ty": 450},
        {"num": 5, "cx": 1240, "cy": 900, "tx": 980, "ty": 900},
        {"num": 6, "cx": 1240, "cy": 1300, "tx": 980, "ty": 1300},
        {"num": 7, "cx": 1240, "cy": 1750, "tx": 980, "ty": 1750},
    ],
    title1="Panel A: Completed Trip Ledger & Search Filters",
    title2="Panel B: Certified Digital Fare Receipt Modal"
)
save_figure(fig13, "Figure_C-13_Trip_History_Digital_Receipt.png")

# 14. Figure C-14: Driver Earnings & Performance Analytics
fig14 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_tabs_earnings(iPhone 16).png",
    "srh-link-toda-ionic.duckdns.org_tabs_earnings(iPhone 16) (1).png",
    [
        {"num": 1, "cx_abs": 50, "cy": 320, "tx": 240, "ty": 320},
        {"num": 2, "cx_abs": 50, "cy": 550, "tx": 240, "ty": 550},
        {"num": 3, "cx_abs": 50, "cy": 850, "tx": 240, "ty": 850},
        {"num": 4, "cx": 1050, "cy": 850, "tx": 800, "ty": 850},
    ],
    [
        {"num": 5, "cx": 1240, "cy": 400, "tx": 980, "ty": 400},
        {"num": 6, "cx": 1240, "cy": 750, "tx": 980, "ty": 750},
        {"num": 7, "cx": 1240, "cy": 1050, "tx": 980, "ty": 1050},
    ],
    title1="Panel A: Driver Rating & Trip Counters",
    title2="Panel B: Weekly Revenue Trends & Channel Share"
)
save_figure(fig14, "Figure_C-14_Driver_Earnings_Performance_Analytics.png")

# 15. Figure C-15: TODA Administrator Driver Accreditation & Review
fig15 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_tabs_admin(iPhone 16) (1).png",
    "srh-link-toda-ionic.duckdns.org_tabs_admin(iPhone 16) (2).png",
    [
        {"num": 1, "cx_abs": 50, "cy": 220, "tx": 240, "ty": 220},
        {"num": 2, "cx_abs": 50, "cy": 440, "tx": 240, "ty": 440},
        {"num": 3, "cx_abs": 50, "cy": 750, "tx": 240, "ty": 750},
    ],
    [
        {"num": 4, "cx": 1240, "cy": 300, "tx": 980, "ty": 300},
        {"num": 5, "cx": 1240, "cy": 800, "tx": 980, "ty": 800},
        {"num": 6, "cx": 1240, "cy": 1700, "tx": 980, "ty": 1700},
        {"num": 7, "cx": 1240, "cy": 2100, "tx": 980, "ty": 2100},
        {"num": 8, "cx": 1240, "cy": 2250, "tx": 980, "ty": 2250},
    ],
    title1="Panel A: Pending Driver Applicants Queue",
    title2="Panel B: Digital Document Verification & Approval Modal"
)
save_figure(fig15, "Figure_C-15_Admin_Driver_Accreditation_Review.png")

# 16. Figure C-16: Terminal Queue Reordering & Incident Resolution
fig16 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_tabs_admin(iPhone 16) (4).png",
    "srh-link-toda-ionic.duckdns.org_tabs_admin(iPhone 16) (5).png",
    [
        {"num": 1, "cx_abs": 50, "cy": 400, "tx": 240, "ty": 400},
        {"num": 2, "cx_abs": 50, "cy": 600, "tx": 150, "ty": 600},
        {"num": 3, "cx_abs": 50, "cy": 1400, "tx": 240, "ty": 1400},
    ],
    [
        {"num": 4, "cx": 1240, "cy": 340, "tx": 980, "ty": 340},
        {"num": 5, "cx": 1240, "cy": 650, "tx": 980, "ty": 650},
        {"num": 6, "cx": 1240, "cy": 1200, "tx": 980, "ty": 1200},
    ],
    title1="Panel A: Drag-and-Drop Queue Management",
    title2="Panel B: Commuter Dispute & Incident Ledger"
)
save_figure(fig16, "Figure_C-16_Admin_Terminal_Queue_Dispute_Ledger.png")

# 17. Figure C-17: TODA Broadcast Announcement Publisher & Notification Drawer
fig17 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_tabs_admin(iPhone 16) (7).png",
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (7).png",
    [
        {"num": 1, "cx_abs": 50, "cy": 340, "tx": 240, "ty": 340},
        {"num": 2, "cx_abs": 50, "cy": 480, "tx": 240, "ty": 480},
        {"num": 3, "cx_abs": 50, "cy": 650, "tx": 240, "ty": 650},
    ],
    [
        {"num": 4, "cx": 1240, "cy": 220, "tx": 980, "ty": 220},
        {"num": 5, "cx": 1240, "cy": 450, "tx": 980, "ty": 450},
        {"num": 6, "cx": 1240, "cy": 650, "tx": 980, "ty": 300},
    ],
    title1="Panel A: Admin Announcement Dispatcher",
    title2="Panel B: Live Member Notification Slide-Over Drawer"
)
save_figure(fig17, "Figure_C-17_Admin_Broadcast_Announcements.png")

# 18. Figure C-18: Official TODA Report Generator & A4 Print Engine
fig18 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_admin-reports(iPhone 16).png",
    "srh-link-toda-ionic.duckdns.org_admin-reports(iPhone 16) (2).png",
    [
        {"num": 1, "cx_abs": 50, "cy": 450, "tx": 240, "ty": 450},
        {"num": 2, "cx_abs": 50, "cy": 950, "tx": 240, "ty": 950},
        {"num": 3, "cx_abs": 50, "cy": 1350, "tx": 240, "ty": 1350},
        {"num": 4, "cx_abs": 50, "cy": 1950, "tx": 240, "ty": 1950},
    ],
    [
        {"num": 5, "cx": 1240, "cy": 220, "tx": 980, "ty": 220},
        {"num": 6, "cx": 1240, "cy": 550, "tx": 980, "ty": 550},
        {"num": 7, "cx": 1240, "cy": 950, "tx": 980, "ty": 950},
        {"num": 8, "cx": 1240, "cy": 1450, "tx": 980, "ty": 1450},
        {"num": 9, "cx": 1240, "cy": 320, "tx": 980, "ty": 220},
    ],
    title1="Panel A: Report Template Configuration",
    title2="Panel B: Live Certified A4 Document Preview"
)
save_figure(fig18, "Figure_C-18_Admin_Official_Report_Generator.png")

# 19. Figure C-19: SuperAdmin Governance Dashboard & MTOP Fleet Registry (Desktop)
fig19 = create_desktop_panel(
    "srh-link-toda-ionic.duckdns.org_superadmin.png",
    [
        {"num": 1, "cx": 180, "cy": 500, "tx": 360, "ty": 750},
        {"num": 2, "cx": 1050, "cy": 320, "tx": 1350, "ty": 480},
        {"num": 3, "cx": 2250, "cy": 580, "tx": 1800, "ty": 760},
        {"num": 4, "cx": 950, "cy": 1450, "tx": 1350, "ty": 1250},
        {"num": 5, "cx": 2800, "cy": 1350, "tx": 2400, "ty": 1600},
    ],
    panel_title="SuperAdmin Governance Console: Executive Pulse & Fleet Operations"
)
save_figure(fig19, "Figure_C-19_SuperAdmin_Pulse_MTOP_Registry.png")

# 20. Figure C-20: SuperAdmin Tariff Calibration, Geofence Radar & Security (Desktop)
fig20 = create_desktop_panel(
    "srh-link-toda-ionic.duckdns.org_superadmin (2).png",
    [
        {"num": 1, "cx": 800, "cy": 680, "tx": 1200, "ty": 820},
        {"num": 2, "cx": 2250, "cy": 680, "tx": 1850, "ty": 820},
        {"num": 3, "cx": 800, "cy": 1650, "tx": 1200, "ty": 1450},
        {"num": 4, "cx": 2850, "cy": 450, "tx": 2550, "ty": 320},
        {"num": 5, "cx": 2600, "cy": 1650, "tx": 2200, "ty": 1450},
    ],
    panel_title="SuperAdmin Tariff Matrix Calibration & Geofence Boundary Controls"
)
save_figure(fig20, "Figure_C-20_SuperAdmin_Tariff_Radar_Security.png")

# 21. Figure C-21: Profile Management, MTOP Credentials & App Permissions
fig21 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_tabs_profile(iPhone 16) (5).png",
    "srh-link-toda-ionic.duckdns.org_tabs_profile(iPhone 16) (4).png",
    [
        {"num": 1, "cx_abs": 50, "cy": 300, "tx": 240, "ty": 300},
        {"num": 2, "cx_abs": 50, "cy": 550, "tx": 240, "ty": 550},
        {"num": 3, "cx_abs": 50, "cy": 850, "tx": 240, "ty": 850},
        {"num": 4, "cx_abs": 50, "cy": 1050, "tx": 240, "ty": 1050},
    ],
    [
        {"num": 5, "cx": 1240, "cy": 500, "tx": 980, "ty": 500},
        {"num": 6, "cx": 1240, "cy": 750, "tx": 980, "ty": 750},
        {"num": 7, "cx": 1240, "cy": 1350, "tx": 980, "ty": 1350},
        {"num": 8, "cx": 1240, "cy": 1850, "tx": 980, "ty": 1850},
    ],
    title1="Panel A: Driver Profile & Accredited MTOP Badge",
    title2="Panel B: Hardware Permissions & System Preferences"
)
save_figure(fig21, "Figure_C-21_Profile_Management_Permissions.png")

print("ALL 21 FIGURES SUCCESSFULLY GENERATED!")
