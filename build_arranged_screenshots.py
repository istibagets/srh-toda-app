import os
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
    print(f"Saved clean figure: {filename}")

def create_single_panel(img_path, panel_title="", crop_box=None, margin=20, target_width=1200):
    raw_img = Image.open(os.path.join(RAW_DIR, img_path)).convert("RGBA")
    if crop_box:
        raw_img = raw_img.crop(crop_box)
        
    header_h = 80 if panel_title else 0
    w = raw_img.width + margin * 2
    h = raw_img.height + header_h + margin * 2
    
    canvas = Image.new("RGBA", (w, h), "#F8FAFC")
    draw = ImageDraw.Draw(canvas)
    
    if panel_title:
        font_title = get_font(36, bold=True)
        draw.rectangle([0, 0, w, header_h], fill="#0F172A")
        draw.text((35, 22), panel_title, fill="#FFFFFF", font=font_title)
        
    canvas.paste(raw_img, (margin, header_h + margin))
    draw.rectangle([margin, header_h + margin, margin + raw_img.width, header_h + margin + raw_img.height], outline="#CBD5E1", width=3)
    
    if target_width and canvas.width != target_width:
        ratio = target_width / canvas.width
        canvas = canvas.resize((target_width, int(canvas.height * ratio)), Image.Resampling.LANCZOS)
    return canvas.convert("RGB")

def create_double_panel(img_path1, img_path2, title1="Panel A", title2="Panel B", target_width=1600):
    img1 = Image.open(os.path.join(RAW_DIR, img_path1)).convert("RGBA")
    img2 = Image.open(os.path.join(RAW_DIR, img_path2)).convert("RGBA")
    
    target_h = 2556
    img1 = img1.resize((int(img1.width * target_h / img1.height), target_h), Image.Resampling.LANCZOS)
    img2 = img2.resize((int(img2.width * target_h / img2.height), target_h), Image.Resampling.LANCZOS)
    
    gap = 40
    header_h = 80
    margin = 25
    total_w = img1.width + img2.width + gap + margin * 2
    total_h = target_h + header_h + margin * 2
    
    canvas = Image.new("RGBA", (total_w, total_h), "#F1F5F9")
    draw = ImageDraw.Draw(canvas)
    font_hdr = get_font(34, bold=True)
    
    # Panel 1
    x1 = margin
    draw.rectangle([x1, margin, x1 + img1.width, margin + header_h - 10], fill="#1E293B")
    draw.text((x1 + 30, margin + 14), title1, fill="#FFFFFF", font=font_hdr)
    canvas.paste(img1, (x1, margin + header_h))
    draw.rectangle([x1, margin + header_h, x1 + img1.width, margin + header_h + target_h], outline="#CBD5E1", width=4)
    
    # Panel 2
    x2 = x1 + img1.width + gap
    draw.rectangle([x2, margin, x2 + img2.width, margin + header_h - 10], fill="#1E293B")
    draw.text((x2 + 30, margin + 14), title2, fill="#FFFFFF", font=font_hdr)
    canvas.paste(img2, (x2, margin + header_h))
    draw.rectangle([x2, margin + header_h, x2 + img2.width, margin + header_h + target_h], outline="#CBD5E1", width=4)
    
    if target_width and canvas.width != target_width:
        ratio = target_width / canvas.width
        canvas = canvas.resize((target_width, int(canvas.height * ratio)), Image.Resampling.LANCZOS)
    return canvas.convert("RGB")

def create_triple_panel(img_path1, img_path2, img_path3, title1="Step 1", title2="Step 2", title3="Step 3", target_width=1800):
    img1 = Image.open(os.path.join(RAW_DIR, img_path1)).convert("RGBA")
    img2 = Image.open(os.path.join(RAW_DIR, img_path2)).convert("RGBA")
    img3 = Image.open(os.path.join(RAW_DIR, img_path3)).convert("RGBA")
    
    target_h = 2556
    img1 = img1.resize((int(img1.width * target_h / img1.height), target_h), Image.Resampling.LANCZOS)
    img2 = img2.resize((int(img2.width * target_h / img2.height), target_h), Image.Resampling.LANCZOS)
    img3 = img3.resize((int(img3.width * target_h / img3.height), target_h), Image.Resampling.LANCZOS)
    
    gap = 35
    header_h = 80
    margin = 25
    total_w = img1.width + img2.width + img3.width + gap * 2 + margin * 2
    total_h = target_h + header_h + margin * 2
    
    canvas = Image.new("RGBA", (total_w, total_h), "#F1F5F9")
    draw = ImageDraw.Draw(canvas)
    font_hdr = get_font(34, bold=True)
    
    panels = [
        (img1, title1),
        (img2, title2),
        (img3, title3),
    ]
    
    curr_x = margin
    for img, title in panels:
        draw.rectangle([curr_x, margin, curr_x + img.width, margin + header_h - 10], fill="#1E293B")
        draw.text((curr_x + 30, margin + 14), title, fill="#FFFFFF", font=font_hdr)
        canvas.paste(img, (curr_x, margin + header_h))
        draw.rectangle([curr_x, margin + header_h, curr_x + img.width, margin + header_h + target_h], outline="#CBD5E1", width=4)
        curr_x += img.width + gap
        
    if target_width and canvas.width != target_width:
        ratio = target_width / canvas.width
        canvas = canvas.resize((target_width, int(canvas.height * ratio)), Image.Resampling.LANCZOS)
    return canvas.convert("RGB")

def create_desktop_panel(img_path, panel_title="", target_width=1600):
    img = Image.open(os.path.join(RAW_DIR, img_path)).convert("RGBA")
    w, h = img.size
    
    header_h = 80 if panel_title else 0
    margin = 15
    canvas = Image.new("RGBA", (w + margin * 2, h + header_h + margin * 2), "#F8FAFC")
    draw = ImageDraw.Draw(canvas)
    
    if panel_title:
        font_title = get_font(42, bold=True)
        draw.rectangle([margin, margin, margin + w, margin + header_h - 10], fill="#0F172A")
        draw.text((margin + 35, margin + 14), panel_title, fill="#FFFFFF", font=font_title)
        canvas.paste(img, (margin, margin + header_h))
    else:
        canvas.paste(img, (margin, margin))
        
    draw.rectangle([margin, margin + header_h, margin + w, margin + header_h + h], outline="#CBD5E1", width=3)
    
    if target_width and canvas.width != target_width:
        ratio = target_width / canvas.width
        canvas = canvas.resize((target_width, int(canvas.height * ratio)), Image.Resampling.LANCZOS)
    return canvas.convert("RGB")

print("Rendering all 21 clean arranged figures (collaged & formatted, without arrows/numbers)...")

# 1. Figure C-01: Public Landing Page
fig1 = create_single_panel(
    "srh-link-toda-ionic.duckdns.org_login(iPhone 16).png",
    panel_title="Public Welcome Portal & Landing Gateway",
    crop_box=(0, 600, 1179, 1950)
)
save_figure(fig1, "Figure_C-01_Public_Landing_Page.png")

# 2. Figure C-02: Portal Sign-In Form
fig2 = create_single_panel(
    "srh-link-toda-ionic.duckdns.org_login(iPhone 16) (1).png",
    panel_title="Secure Portal Sign-In & Authentication Form",
    crop_box=(0, 560, 1179, 2020)
)
save_figure(fig2, "Figure_C-02_Portal_Sign_In_Form.png")

# 3. Figure C-03: Passenger Registration Flow
fig3 = create_triple_panel(
    "srh-link-toda-ionic.duckdns.org_register(iPhone 16).png",
    "srh-link-toda-ionic.duckdns.org_register(iPhone 16) (1).png",
    "srh-link-toda-ionic.duckdns.org_register(iPhone 16) (2).png",
    title1="Step 1: Role Selection",
    title2="Step 2: Personal Details",
    title3="Step 3: Security & Terms"
)
save_figure(fig3, "Figure_C-03_Passenger_Registration_Flow.png")

# 4. Figure C-04: Driver Registration Credentials & 2FA OTP
fig4 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_register(iPhone 16) (6).png",
    "srh-link-toda-ionic.duckdns.org_register(iPhone 16) (7).png",
    title1="Step 4: MTOP Credentials & Document Upload",
    title2="Step 5: Two-Factor Gmail OTP Verification"
)
save_figure(fig4, "Figure_C-04_Driver_Registration_Credentials.png")

# 5. Figure C-05: Driver Accreditation Review Statuses
fig5 = create_triple_panel(
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16).png",
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (4).png",
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (6).png",
    title1="Status A: Pending Review",
    title2="Status B: Action Required / Declined",
    title3="Status C: Revoked / Removed"
)
save_figure(fig5, "Figure_C-05_Driver_Accreditation_Statuses.png")

# 6. Figure C-06: Passenger Ride Booking Sheet & Fare Calculation Modal
fig6 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (15).png",
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (16).png",
    title1="Panel A: Commuter Action Sheet & Regulated Fares",
    title2="Panel B: Ride Request & Distance Calculation Modal"
)
save_figure(fig6, "Figure_C-06_Passenger_Ride_Booking_Modal.png")

# 7. Figure C-07: Fare Bargaining & Counter-Proposal Negotiation
fig7 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (18).png",
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (20).png",
    title1="Panel A: Driver Incoming Offer & Bargaining Counter",
    title2="Panel B: Passenger Proposed Fare Review Modal"
)
save_figure(fig7, "Figure_C-07_Fare_Bargaining_Negotiation.png")

# 8. Figure C-08: En Route Navigation & In-App Trip Chat
fig8 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (21).png",
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (24).png",
    title1="Panel A: Driver Navigation En Route to Pickup",
    title2="Panel B: Real-Time In-App Commuter Trip Chat"
)
save_figure(fig8, "Figure_C-08_En_Route_Navigation_Trip_Chat.png")

# 9. Figure C-09: Driver Arrival & In-Transit Drop-Off Completion
fig9 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (25).png",
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (27).png",
    title1="Panel A: Arrived at Pickup & Boarding",
    title2="Panel B: On Trip In Transit & Drop-Off Completion"
)
save_figure(fig9, "Figure_C-09_Driver_Arrival_Dropoff_Completion.png")

# 10. Figure C-10: Terminal Return & Passenger 5-Star Rating Modal
fig10 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (30).png",
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (31).png",
    title1="Panel A: Driver Returning to Terminal Station",
    title2="Panel B: Passenger 5-Star Service Rating Modal"
)
save_figure(fig10, "Figure_C-10_Terminal_Return_Passenger_Rating.png")

# 11. Figure C-11: Driver Queue Hero Card & Geofenced Positioning
fig11 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (1).png",
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (3).png",
    title1="Panel A: Off-Duty Status & Geofence Warning",
    title2="Panel B: On-Duty #1 in Queue Radiant Hero Card"
)
save_figure(fig11, "Figure_C-11_Driver_Queue_Hero_Card.png")

# 12. Figure C-12: Terminal Walk-In & Wayside Dispatch Modals
fig12 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (10).png",
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (13).png",
    title1="Panel A: Terminal Walk-In Commuter Dispatch",
    title2="Panel B: Returning Wayside Passenger Dispatch"
)
save_figure(fig12, "Figure_C-12_WalkIn_Wayside_Dispatch.png")

# 13. Figure C-13: Trip History Ledger & Digital Fare Receipt
fig13 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_tabs_history(iPhone 16).png",
    "srh-link-toda-ionic.duckdns.org_tabs_history(iPhone 16) (1).png",
    title1="Panel A: Completed Trip Ledger & Search Filters",
    title2="Panel B: Certified Digital Fare Receipt Modal"
)
save_figure(fig13, "Figure_C-13_Trip_History_Digital_Receipt.png")

# 14. Figure C-14: Driver Earnings & Performance Analytics
fig14 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_tabs_earnings(iPhone 16).png",
    "srh-link-toda-ionic.duckdns.org_tabs_earnings(iPhone 16) (1).png",
    title1="Panel A: Driver Rating & Trip Counters",
    title2="Panel B: Weekly Revenue Trends & Channel Share"
)
save_figure(fig14, "Figure_C-14_Driver_Earnings_Performance_Analytics.png")

# 15. Figure C-15: TODA Administrator Driver Accreditation & Review
fig15 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_tabs_admin(iPhone 16) (1).png",
    "srh-link-toda-ionic.duckdns.org_tabs_admin(iPhone 16) (2).png",
    title1="Panel A: Pending Driver Applicants Queue",
    title2="Panel B: Digital Document Verification & Approval Modal"
)
save_figure(fig15, "Figure_C-15_Admin_Driver_Accreditation_Review.png")

# 16. Figure C-16: Terminal Queue Reordering & Incident Resolution
fig16 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_tabs_admin(iPhone 16) (4).png",
    "srh-link-toda-ionic.duckdns.org_tabs_admin(iPhone 16) (5).png",
    title1="Panel A: Drag-and-Drop Queue Management",
    title2="Panel B: Commuter Dispute & Incident Ledger"
)
save_figure(fig16, "Figure_C-16_Admin_Terminal_Queue_Dispute_Ledger.png")

# 17. Figure C-17: TODA Broadcast Announcement Publisher & Notification Drawer
fig17 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_tabs_admin(iPhone 16) (7).png",
    "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (7).png",
    title1="Panel A: Admin Announcement Dispatcher",
    title2="Panel B: Live Member Notification Slide-Over Drawer"
)
save_figure(fig17, "Figure_C-17_Admin_Broadcast_Announcements.png")

# 18. Figure C-18: Official TODA Report Generator & A4 Print Engine
fig18 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_admin-reports(iPhone 16).png",
    "srh-link-toda-ionic.duckdns.org_admin-reports(iPhone 16) (2).png",
    title1="Panel A: Report Template Configuration",
    title2="Panel B: Live Certified A4 Document Preview"
)
save_figure(fig18, "Figure_C-18_Admin_Official_Report_Generator.png")

# 19. Figure C-19: SuperAdmin Governance Dashboard & MTOP Fleet Registry (Desktop)
fig19 = create_desktop_panel(
    "srh-link-toda-ionic.duckdns.org_superadmin.png",
    panel_title="SuperAdmin Governance Console: Executive Pulse & Fleet Operations"
)
save_figure(fig19, "Figure_C-19_SuperAdmin_Pulse_MTOP_Registry.png")

# 20. Figure C-20: SuperAdmin Tariff Calibration, Geofence Radar & Security (Desktop)
fig20 = create_desktop_panel(
    "srh-link-toda-ionic.duckdns.org_superadmin (2).png",
    panel_title="SuperAdmin Tariff Matrix Calibration & Geofence Boundary Controls"
)
save_figure(fig20, "Figure_C-20_SuperAdmin_Tariff_Radar_Security.png")

# 21. Figure C-21: Profile Management, MTOP Credentials & App Permissions
fig21 = create_double_panel(
    "srh-link-toda-ionic.duckdns.org_tabs_profile(iPhone 16) (5).png",
    "srh-link-toda-ionic.duckdns.org_tabs_profile(iPhone 16) (4).png",
    title1="Panel A: Driver Profile & Accredited MTOP Badge",
    title2="Panel B: Hardware Permissions & System Preferences"
)
save_figure(fig21, "Figure_C-21_Profile_Management_Permissions.png")

print("SUCCESS: All 21 clean figures generated without arrows or numbers!")
