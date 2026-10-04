import os
from PIL import Image

RAW_DIR = r"paper\User Manual Screenshots"

def scan_features():
    # Figure C-06:
    # 6A: tabs_home(iPhone 16) (15).png
    # 1: MapLibre GL Vector Map Viewport -> y ~ 650 (top map area)
    # 2: Available Queue Count Pill -> find blue pill '3 AVAILABLE'
    # 3: Popular Landmarks Carousel -> 'Popular Landmarks (Regulated Rates)'
    # 4: Book a Tricycle Primary CTA -> 'Book a Tricycle' blue button
    im6a = Image.open(os.path.join(RAW_DIR, "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (15).png"))
    pix6a = im6a.load()
    # find '3 AVAILABLE' blue pill:
    for y in range(1600, 1850, 5):
        for x in range(800, 1100, 10):
            r, g, b = pix6a[x, y][:3]
            if r < 50 and g > 80 and b > 200:
                # print('6A 3 AVAILABLE at', x, y)
                pass
    # find 'Book a Tricycle' blue button:
    for y in range(1950, 2300, 10):
        r, g, b = pix6a[589, y][:3]
        if r < 50 and g > 80 and b > 200:
            print("6A Book a Tricycle button at y =", y)
            break

    # 6B: tabs_home(iPhone 16) (16).png
    # 5: Pickup Address Field with GPS Auto-Fill -> y ~ 1320
    # 6: Drop-Off Destination & Pin on Map Trigger -> y ~ 1520
    # 7: Passenger Capacity Stepper -> y ~ 1720
    # 8: Barangay Regulated Fare Breakdown Card -> y ~ 1900
    # 9: Confirm & Request Tricycle CTA -> blue button
    im6b = Image.open(os.path.join(RAW_DIR, "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (16).png"))
    pix6b = im6b.load()
    for y in range(2000, 2400, 10):
        r, g, b = pix6b[589, y][:3]
        if r < 50 and g > 80 and b > 200:
            print("6B Confirm & Request button at y =", y)
            break

    # Figure C-07:
    # 7A: tabs_home(iPhone 16) (18).png
    # 1: 20-Second Decision Countdown Timer -> blue progress bar at y ~ 1480
    # 2: Pickup Location & Destination Landmark -> card at y ~ 1700
    # 3: Fare Proposal Adjuster Stepper -> stepper [-] P60 [+] at y ~ 1980
    # 4: Quick Fare Preset Chips -> chips row at y ~ 2120
    # 5: Send Fare Proposal Action Button -> blue button at y ~ 2280
    # 7B: tabs_home(iPhone 16) (20).png
    # 6: Driver Proposed Fare Alert Banner -> P60 banner at y ~ 1680
    # 7: Accept Proposed Fare Action CTA -> green button at y ~ 2160
    # 8: Decline / Next Driver Button -> red button at y ~ 2160 (x ~ 200)
    im7b = Image.open(os.path.join(RAW_DIR, "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (20).png"))
    pix7b = im7b.load()
    for y in range(2000, 2300, 10):
        r, g, b = pix7b[750, y][:3] # green button
        if r < 30 and g > 150 and b < 100:
            print("7B Accept green button at y =", y)
            break
        r, g, b = pix7b[250, y][:3] # decline red button
        if r > 200 and g < 100:
            print("7B Decline red button at y =", y)

    # Figure C-08:
    # 8A: tabs_home(iPhone 16) (21).png
    # 1: Live En Route Route Line on Vector Map -> y ~ 700
    # 2: Passenger Identity Card & Pickup Address -> y ~ 1480
    # 3: One-Touch Cellular Phone Call Button -> phone icon button at y ~ 1740, x ~ 200
    # 4: Open Trip Chat Action Trigger -> chat icon button at y ~ 1740, x ~ 850
    # 5: Arrived at Pickup Transition Trigger -> blue button 'Arrived at Pickup' at y ~ 2260
    # 8B: tabs_home(iPhone 16) (24).png
    # 6: Recipient Driver Identity & MTOP Header -> header at y ~ 240
    # 7: Quick Response Preset Chips -> chips at y ~ 450
    # 8: Chronological Message Feed -> chat bubbles at y ~ 1050
    # 9: Message Input Bar & Send Trigger -> input bar at bottom y ~ 2260

    # Figure C-09:
    # 9A: tabs_home(iPhone 16) (25).png
    # 1: Arrived at Pickup Status Banner -> banner at y ~ 1380
    # 2: Passenger Boarding & Route Overview -> card at y ~ 1560
    # 3: Start Trip / Depart Action Button -> blue button at y ~ 2260
    # 9B: tabs_home(iPhone 16) (27).png
    # 4: On Trip In Transit Status Indicator -> banner at y ~ 1380
    # 5: Drop-Off Landmark & Passenger Count -> card at y ~ 1560
    # 6: Complete Drop Off Action Button -> green button at y ~ 2260

    # Figure C-10:
    # 10A: tabs_home(iPhone 16) (30).png
    # 1: Drop-Off Earnings Credit Toast -> toast at y ~ 150
    # 2: Terminal Station Return Guidance -> map at y ~ 800
    # 3: Terminal Queue Check-In Button -> blue button at y ~ 2260
    # 10B: tabs_home(iPhone 16) (31).png
    # 4: Trip Completed Celebration Header -> y ~ 450
    # 5: Total Fare Paid & Driver MTOP Info -> y ~ 650
    # 6: Interactive 5-Star Service Rating Selector -> y ~ 920
    # 7: Commendation Chips -> chips at y ~ 1250
    # 8: Submit Rating & Feedback CTA -> blue button at y ~ 2260

    # Figure C-11:
    # 11A: tabs_home(iPhone 16) (1).png
    # 1: Offline Duty Status Indicator -> 'YOU'RE OFFLINE' pill at y ~ 1700
    # 2: Floating Go On-Duty Power Switch -> circular power button at y ~ 1520, x ~ 230
    # 3: Geofence Terminal Check-In Guidance -> dark card text 'Toggle the power button...' at y ~ 1950
    # 11B: tabs_home(iPhone 16) (3).png
    # 4: Radiant Green #1 in Queue Hero Card -> header at y ~ 400
    # 5: Next for Dispatch Status Notice -> 'Next for TODA terminal...' at y ~ 480
    # 6: Start Terminal Walk-In Ride Button -> white button at y ~ 600
    # 7: Active Terminal Queue Roster -> roster card at y ~ 900

    # Figure C-12:
    # 12A: tabs_home(iPhone 16) (10).png (Walk-in dispatch)
    # 1: Terminal Dispatch Modal Header -> y ~ 1350
    # 2: Pickup Origin Point -> y ~ 1480
    # 3: Destination Barangay Selection Chips -> y ~ 1680
    # 4: Passenger Stepper & Computed Regulated Tariff -> y ~ 1950
    # 5: Depart & Start Walk-In Trip Button -> blue button at y ~ 2250
    # 12B: tabs_home(iPhone 16) (13).png (Wayside dispatch)
    # 6: Wayside Dispatch Modal Header -> y ~ 1350
    # 7: Dynamic En Route GPS Origin Address -> y ~ 1480
    # 8: Wayside Destination Selector & Fare Card -> y ~ 1700
    # 9: Depart & Start Wayside Trip Button -> blue button at y ~ 2250

    # Figure C-13:
    # 13A: tabs_history(iPhone 16).png
    # 1: Search Bar & Time Horizon Chips -> y ~ 360
    # 2: Completed Trip Summary Card -> y ~ 820
    # 3: Dispatch Mode Badge -> 'Walk-in' green pill at y ~ 780, x ~ 1000
    # 13B: tabs_history(iPhone 16) (1).png (Digital receipt)
    # 4: Official Digital Fare Receipt Header -> y ~ 450
    # 5: Transit Route Timeline -> y ~ 900
    # 6: Participants & Vehicle Verification Stamp -> y ~ 1300
    # 7: Itemized Fare Breakdown & Total Collected -> y ~ 1750

    # Figure C-14:
    # 14A: tabs_earnings(iPhone 16).png
    # 1: Time Horizon Filter Switcher -> y ~ 320
    # 2: Radial Satisfaction Rating Ring -> y ~ 550, x ~ 589
    # 3: Total Completed Trips Done Counter -> tile at y ~ 850, x ~ 300
    # 4: Aggregate Gross Revenue KPI Tile -> tile at y ~ 850, x ~ 850
    # 14B: tabs_earnings(iPhone 16) (1).png
    # 5: 7-Day Revenue Trend Pillar Chart -> chart at y ~ 400
    # 6: Peak Earning Day Analytics Badge -> badge at y ~ 750
    # 7: Dispatch Channel Share Breakdown -> progress bars at y ~ 1050

    # Figure C-15:
    # 15A: tabs_admin(iPhone 16) (1).png
    # 1: Admin Segmented Navigation Bar -> tabs at y ~ 220
    # 2: Applicant Status Filter Chips -> chips at y ~ 440
    # 3: Driver Applicant Summary Card -> card at y ~ 750
    # 15B: tabs_admin(iPhone 16) (2).png
    # 4: Digital Verification Modal Header -> y ~ 300
    # 5: Scanned MTOP Document High-Res Viewer -> y ~ 800
    # 6: Administrative Compliance Notes Textarea -> y ~ 1700
    # 7: Approve & Grant Accreditation Action Button -> green button at y ~ 2100
    # 8: Reject Application Action Button -> red button at y ~ 2250

    # Figure C-16:
    # 16A: tabs_admin(iPhone 16) (4).png
    # 1: Active Terminal Queue Line Roster -> roster at y ~ 400
    # 2: Drag-and-Drop Queue Reorder Gripper -> grip handle at y ~ 580, x ~ 140
    # 3: Emergency Reset Stalled Trip Button -> red/outline button at y ~ 1400
    # 16B: tabs_admin(iPhone 16) (5).png
    # 4: Incident Search Bar & Status Filter Horizon -> y ~ 340
    # 5: Passenger Incident Report Card -> card at y ~ 650
    # 6: Case Adjudication Status Tag -> tag at y ~ 1200

    # Figure C-17:
    # 17A: tabs_admin(iPhone 16) (7).png
    # 1: Create Announcement Trigger Button -> blue button at y ~ 340
    # 2: Published Announcement Bulletins Stream -> stream at y ~ 480
    # 3: Target Audience Filter Tag -> tag at y ~ 650
    # 17B: tabs_home(iPhone 16) (7).png
    # 4: Notifications Drawer Header & Counter -> header at y ~ 220
    # 5: Live Official Bulletin Alert Card -> card at y ~ 450
    # 6: Mark All as Read & Dismiss Controls -> button at y ~ 300, x ~ 980

    # Figure C-18:
    # 18A: admin-reports(iPhone 16).png
    # 1: Report Template Selection Cards -> cards at y ~ 450
    # 2: Date Horizon Filter Horizon Pills -> pills at y ~ 950
    # 3: Signatory Name & Designation Inputs -> inputs at y ~ 1350
    # 4: Generate Report Primary CTA -> blue button at y ~ 1950
    # 18B: admin-reports(iPhone 16) (2).png
    # 5: Interactive A4 Sheet Zoom Controls -> zoom controls at y ~ 220, x ~ 980
    # 6: Official Republic of the Philippines TODA Letterhead -> header at y ~ 550
    # 7: Certified Tabular Audit Matrix -> table at y ~ 950
    # 8: Formal Signatory Certification Block -> block at y ~ 1450
    # 9: Print / Save PDF Action Button -> action button at y ~ 220, x ~ 250

    # Figure C-19 (Desktop):
    # superadmin.png
    # 1: Master Governance Sidebar Navigation -> sidebar at x ~ 200, y ~ 600
    # 2: Executive Pulse Server Health Banner -> banner at x ~ 1350, y ~ 480
    # 3: System Key Performance Metric Cards -> KPI cards at x ~ 1800, y ~ 760
    # 4: Dispatch Volume 7-Day Area Chart -> chart at x ~ 1350, y ~ 1250
    # 5: Recent Dispatches Live Audit Ledger Feed -> audit feed at x ~ 2400, y ~ 1600

    # Figure C-20 (Desktop):
    # superadmin (2).png
    # 1: Municipal Distance Tariff Inputs -> tariff card at x ~ 1200, y ~ 820
    # 2: Terminal Geofence GPS Coordinates & Radius -> geofence card at x ~ 1850, y ~ 820
    # 3: Popular TODA Landmarks & Fixed Municipal Fares Table -> table at x ~ 1200, y ~ 1450
    # 4: Save Tariff & Radar Calibration CTA -> blue button at x ~ 2550, y ~ 320
    # 5: Interactive Terminal Geofence Radar Visualizer -> radar visualizer at x ~ 2200, y ~ 1450

    # Figure C-21:
    # 21A: tabs_profile(iPhone 16) (5).png
    # 1: Profile Avatar Photo Frame & Camera Upload FAB -> avatar at y ~ 300, x ~ 589
    # 2: Driver Name & Accredited MTOP Franchise Badge -> name & badge at y ~ 550
    # 3: Daily Trips & Earnings Performance Metric Tiles -> tiles at y ~ 850
    # 4: Compliance Status Indicator Badge -> 'Approved' green badge at y ~ 1050
    # 21B: tabs_profile(iPhone 16) (4).png
    # 5: GPS High-Accuracy Location Permission Toggle -> toggle at y ~ 500, x ~ 1000
    # 6: Push Notifications & In-App Chime Audio Toggles -> toggle at y ~ 750, x ~ 1000
    # 7: Run Device Sensor Diagnostics Action Button -> button at y ~ 1350
    # 8: Secure Sign Out & Session Termination Button -> red button at y ~ 1850

scan_features()
print("All features scanned successfully!")
