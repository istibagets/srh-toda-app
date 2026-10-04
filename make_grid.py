import os
from PIL import Image, ImageDraw, ImageFont

def make_grid_overlay(img_path, out_path, step=100):
    im = Image.open(img_path).convert("RGB")
    draw = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype(r"C:\Windows\Fonts\arial.ttf", 22)
    except:
        font = ImageFont.load_default()
        
    w, h = im.size
    for x in range(0, w, step):
        draw.line([(x, 0), (x, h)], fill="#FF000055", width=2)
        draw.text((x + 4, 10), str(x), fill="#FF0000", font=font)
        draw.text((x + 4, h - 35), str(x), fill="#FF0000", font=font)
        
    for y in range(0, h, step):
        draw.line([(0, y), (w, y)], fill="#0000FF55", width=2)
        draw.text((10, y + 4), str(y), fill="#0000FF", font=font)
        draw.text((w - 70, y + 4), str(y), fill="#0000FF", font=font)
        
    im.save(out_path)
    print("Saved grid overlay to", out_path)

if __name__ == "__main__":
    RAW_DIR = r"paper\User Manual Screenshots"
    os.makedirs("debug_grids", exist_ok=True)
    # test on fig 1 raw
    make_grid_overlay(os.path.join(RAW_DIR, "srh-link-toda-ionic.duckdns.org_login(iPhone 16).png"), "debug_grids/fig1_grid.png")
