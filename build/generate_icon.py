#!/usr/bin/env python3
"""Generate the DocFlow Local desktop icon without external assets."""

import numpy.typing as npt
if not hasattr(npt, "NDArray"):
    class NDArray:
        def __class_getitem__(cls, item):
            return object
    npt.NDArray = NDArray

from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

SIZE = 1024
image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)

for inset in range(0, 46):
    alpha = int(42 * (1 - inset / 46))
    draw.rounded_rectangle((92 - inset // 3, 96 - inset // 3, 932 + inset // 3, 936 + inset // 3), radius=210, fill=(5, 17, 31, alpha))

draw.rounded_rectangle((92, 78, 932, 918), radius=202, fill="#11263D")
draw.rounded_rectangle((126, 112, 898, 884), radius=174, outline="#1D3A56", width=4)

doc = (286, 205, 738, 798)
draw.rounded_rectangle(doc, radius=62, fill="#F4F8FA")
draw.polygon([(610, 205), (738, 333), (610, 333)], fill="#D8E7EA")
draw.line([(610, 205), (610, 333), (738, 333)], fill="#8DB5B4", width=9, joint="curve")

draw.rounded_rectangle((335, 378, 689, 442), radius=26, fill="#0B918B")
draw.rounded_rectangle((335, 486, 630, 510), radius=12, fill="#B6C9D2")
draw.rounded_rectangle((335, 544, 661, 568), radius=12, fill="#B6C9D2")
draw.rounded_rectangle((335, 602, 575, 626), radius=12, fill="#B6C9D2")

badge = (548, 618, 786, 856)
draw.ellipse(badge, fill="#0B918B", outline="#86E0D9", width=9)

font_candidates = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
]
font_path = next((candidate for candidate in font_candidates if Path(candidate).exists()), None)
font = ImageFont.truetype(font_path, 96) if font_path else ImageFont.load_default()
box = draw.textbbox((0, 0), "DF", font=font)
text_width, text_height = box[2] - box[0], box[3] - box[1]
draw.text(((badge[0] + badge[2] - text_width) / 2, (badge[1] + badge[3] - text_height) / 2 - 8), "DF", fill="white", font=font)

output = Path(__file__).with_name("icon.png")
image.save(output, "PNG", optimize=True)
print(output)
