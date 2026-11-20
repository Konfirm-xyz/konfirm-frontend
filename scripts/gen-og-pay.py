#!/usr/bin/env python3
"""Generate the Konfirm 1200x630 Open Graph / Twitter card.

Brand-faithful: dark surface (#17140f), accent gold (#c3a06a), text-hi
(#f5f3ee), the rounded-square checkmark mark from globals.css. No redraws of
any logo — the mark is the app's own inline `.mark` element rendered large.
"""
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
SURFACE = (23, 20, 15)      # --surface #17140f
SURFACE2 = (30, 26, 20)     # --surface-2 #1e1a14
ACCENT = (195, 160, 106)    # --accent #c3a06a
ACCENT_INK = (26, 20, 8)    # --accent-ink #1a1408
TEXT_HI = (245, 243, 238)   # --text-hi #f5f3ee
TEXT_LO = (182, 173, 160)   # --text-lo #b6ada0
BORDER = (43, 37, 28)       # --border #2b251c

img = Image.new("RGB", (W, H), SURFACE)
d = ImageDraw.Draw(img)

# Subtle top accent bar
d.rectangle([0, 0, W, 8], fill=ACCENT)

# Try to load a font; fall back to default if unavailable.
def font(size):
    for path in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()

f_brand = font(64)
f_tag = font(34)
f_sub = font(30)

# Brand mark: rounded square with checkmark (mirrors .mark in globals.css)
mark_size = 96
mx, my = 96, 96
d.rounded_rectangle([mx, my, mx + mark_size, my + mark_size], radius=24, fill=ACCENT)
# checkmark
d.line([(mx + 24, my + 50), (mx + 44, my + 70), (mx + 74, my + 30)], fill=ACCENT_INK, width=14, joint="curve")

# Wordmark
d.text((mx + mark_size + 28, my + 8), "Konfirm", font=f_brand, fill=TEXT_HI)

# Tagline
d.text((96, 250), "A non-custodial payment processor on Stellar.", font=f_tag, fill=TEXT_LO)

# Payment card motif (bottom-left)
card_x, card_y, card_w, card_h = 96, 360, 420, 150
d.rounded_rectangle([card_x, card_y, card_x + card_w, card_y + card_h], radius=18, fill=SURFACE2, outline=BORDER, width=2)
d.text((card_x + 28, card_y + 24), "MERCHANT", font=font(20), fill=TEXT_LO)
d.text((card_x + 28, card_y + 58), "Pay securely with your Stellar wallet", font=font(26), fill=TEXT_HI)
d.text((card_x + 28, card_y + 104), "$  •  USDC", font=font(30), fill=ACCENT)

# Right-side accent: large checkmark watermark
d.line([(880, 300), (930, 350), (1030, 240)], fill=ACCENT, width=22, joint="curve")

img.save("public/og-pay.png")
print("wrote public/og-pay.png", img.size)
