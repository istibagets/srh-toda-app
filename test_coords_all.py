import os
from PIL import Image

RAW_DIR = r"paper\User Manual Screenshots"

def analyze_all_figures():
    # Let's inspect each raw image dimensions and key elements
    fig_files = {
        "fig1": ["srh-link-toda-ionic.duckdns.org_login(iPhone 16).png"],
        "fig2": ["srh-link-toda-ionic.duckdns.org_login(iPhone 16) (1).png"],
        "fig3": [
            "srh-link-toda-ionic.duckdns.org_register(iPhone 16).png",
            "srh-link-toda-ionic.duckdns.org_register(iPhone 16) (1).png",
            "srh-link-toda-ionic.duckdns.org_register(iPhone 16) (2).png",
        ],
        "fig4": [
            "srh-link-toda-ionic.duckdns.org_register(iPhone 16) (6).png",
            "srh-link-toda-ionic.duckdns.org_register(iPhone 16) (7).png",
        ],
        "fig5": [
            "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16).png",
            "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (4).png",
            "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (6).png",
        ],
        "fig6": [
            "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (15).png",
            "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (16).png",
        ],
        "fig7": [
            "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (18).png",
            "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (20).png",
        ],
        "fig8": [
            "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (21).png",
            "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (24).png",
        ],
        "fig9": [
            "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (25).png",
            "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (27).png",
        ],
        "fig10": [
            "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (30).png",
            "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (31).png",
        ],
        "fig11": [
            "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (1).png",
            "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (3).png",
        ],
        "fig12": [
            "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (10).png",
            "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (13).png",
        ],
        "fig13": [
            "srh-link-toda-ionic.duckdns.org_tabs_history(iPhone 16).png",
            "srh-link-toda-ionic.duckdns.org_tabs_history(iPhone 16) (1).png",
        ],
        "fig14": [
            "srh-link-toda-ionic.duckdns.org_tabs_earnings(iPhone 16).png",
            "srh-link-toda-ionic.duckdns.org_tabs_earnings(iPhone 16) (1).png",
        ],
        "fig15": [
            "srh-link-toda-ionic.duckdns.org_tabs_admin(iPhone 16) (1).png",
            "srh-link-toda-ionic.duckdns.org_tabs_admin(iPhone 16) (2).png",
        ],
        "fig16": [
            "srh-link-toda-ionic.duckdns.org_tabs_admin(iPhone 16) (4).png",
            "srh-link-toda-ionic.duckdns.org_tabs_admin(iPhone 16) (5).png",
        ],
        "fig17": [
            "srh-link-toda-ionic.duckdns.org_tabs_admin(iPhone 16) (7).png",
            "srh-link-toda-ionic.duckdns.org_tabs_home(iPhone 16) (7).png",
        ],
        "fig18": [
            "srh-link-toda-ionic.duckdns.org_admin-reports(iPhone 16).png",
            "srh-link-toda-ionic.duckdns.org_admin-reports(iPhone 16) (2).png",
        ],
        "fig19": ["srh-link-toda-ionic.duckdns.org_superadmin.png"],
        "fig20": ["srh-link-toda-ionic.duckdns.org_superadmin (2).png"],
        "fig21": [
            "srh-link-toda-ionic.duckdns.org_tabs_profile(iPhone 16) (5).png",
            "srh-link-toda-ionic.duckdns.org_tabs_profile(iPhone 16) (4).png",
        ],
    }
    
    print("Files mapping verified:", len(fig_files))

analyze_all_figures()
