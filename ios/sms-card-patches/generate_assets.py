from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json

root = Path("/tmp/ios-work/etagi-sms-card-ios/SMSVizitka/Resources/Assets.xcassets")
appicon = root / "AppIcon.appiconset"
appicon.mkdir(parents=True, exist_ok=True)

base = Image.new("RGB", (1024, 1024), "#E30613")
draw = ImageDraw.Draw(base)

# Speech bubble
draw.rounded_rectangle((180, 190, 844, 710), radius=120, fill="white")
draw.polygon([(330, 670), (235, 835), (470, 705)], fill="white")

# Simple branded mark. This is not the official Etazhi logo, just an app glyph.
font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
try:
    font = ImageFont.truetype(font_path, 310)
except Exception:
    font = ImageFont.load_default()

text = "Э"
bbox = draw.textbbox((0, 0), text, font=font)
tw = bbox[2] - bbox[0]
th = bbox[3] - bbox[1]
x = (1024 - tw) / 2
y = 415 - th / 2 - bbox[1]
draw.text((x, y), text, font=font, fill="#111111")

# small message accent line
draw.rounded_rectangle((365, 625, 655, 665), radius=20, fill="#E30613")

sizes = [
    ("Icon-20@2x.png", 40, "20x20", "2x"),
    ("Icon-20@3x.png", 60, "20x20", "3x"),
    ("Icon-29@2x.png", 58, "29x29", "2x"),
    ("Icon-29@3x.png", 87, "29x29", "3x"),
    ("Icon-40@2x.png", 80, "40x40", "2x"),
    ("Icon-40@3x.png", 120, "40x40", "3x"),
    ("Icon-60@2x.png", 120, "60x60", "2x"),
    ("Icon-60@3x.png", 180, "60x60", "3x"),
]

images = []
for filename, pixels, size, scale in sizes:
    base.resize((pixels, pixels), Image.Resampling.LANCZOS).save(appicon / filename, format="PNG")
    images.append({
        "filename": filename,
        "idiom": "iphone",
        "scale": scale,
        "size": size
    })

base.save(appicon / "Icon-1024.png", format="PNG")
images.append({
    "filename": "Icon-1024.png",
    "idiom": "ios-marketing",
    "scale": "1x",
    "size": "1024x1024"
})

contents = {
    "images": images,
    "info": {"author": "xcode", "version": 1}
}
(appicon / "Contents.json").write_text(json.dumps(contents, ensure_ascii=False, indent=2))

(root / "Contents.json").write_text(json.dumps({
    "info": {"author": "xcode", "version": 1}
}, ensure_ascii=False, indent=2))
