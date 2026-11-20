"""Rebuild Crooked Hand with Python, Pillow, fontTools and Brotli.

Pass the path to SourceCodePro-Medium.ttf from Adobe's Source Code Pro 2.042 release.
https://github.com/adobe-fonts/source-code-pro/blob/d3f1a5962cde503f9409c21e58527611d4a19ef1/TTF/SourceCodePro-Medium.ttf

The outlines and this font source are distributed under the SIL Open Font License
1.1, included in OFL.txt. The original copyright notice is retained in the font.
"""
from hashlib import sha256
from pathlib import Path
import sys

from fontTools import agl
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont


# One cut is 1/20 em. Twelve cuts of advance preserve the source's monospace width.
UNIT = 50
ADVANCE = 12 * UNIT
BASELINE = 20
SOURCE_SHA256 = 'f9dbc746f60c83f5cb1503b19f90729d8195cab6bb67f2b861d4eb257ed86536'

# The cross rises at the right, the stem doubles back and the foot hooks upward.
# This lowercase letter also serves as the toad on the map.
TOAD_T = (
    "......##....",
    ".....###....",
    "....###.....",
    "....##....#.",
    "..#.##...##.",
    ".#########..",
    "..#####.....",
    "....##......",
    "....##......",
    "...##.......",
    "...##.......",
    "...###...##.",
    "....######..",
    ".....####...",
)

# Two hands for the same cut: rounded letters buckle inward at the waist, while
# straight stems catch to the other side. The baseline returns to its bearing.
BOWL = (0, 0, 0, 1, 1, 0, 0, 0, -1, -1, 0, 0, 0, 0)
STEM = (0, 0, 0, -1, -1, 0, 0, 0, 1, 1, 0, 0, 0, 0)


def cut_letter(face, char):
    if char == 't':
        return {(x, 13 - row) for row, line in enumerate(TOAD_T)
                for x, bit in enumerate(line) if bit == '#'}

    sheet = Image.new('L', (12, 27))
    ImageDraw.Draw(sheet).text((0, BASELINE), char, font=face, fill=255, anchor='ls')
    bends = BOWL if char in 'acegmoqsuwCDGJOSU035689@&' else STEM
    pixels = set()
    for row in range(sheet.height):
        height = BASELINE - row - 1
        shift = bends[height % len(bends)] if char.isalnum() else 0
        for col in range(sheet.width):
            if sheet.getpixel((col, row)) >= 100:
                x = max(0, min(11, col + shift))
                pixels.add((x, height))
    return pixels


def outline(pixels):
    # Trace the edge of the connected ink, omitting interior edges. Adjacent
    # runs share one perimeter so the browser can scale the font to any size.
    edges = set()
    for x, y in pixels:
        corners = [(x, y), (x, y + 1), (x + 1, y + 1), (x + 1, y)]
        for a, b in zip(corners, corners[1:] + corners[:1]):
            if (b, a) in edges:
                edges.remove((b, a))
            else:
                edges.add((a, b))

    pen = TTGlyphPen(None)
    while edges:
        start, end = min(edges)
        current = start
        pen.moveTo((current[0] * UNIT, current[1] * UNIT))
        while True:
            edges.remove((current, end))
            dx, dy = end[0] - current[0], end[1] - current[1]
            if end == start:
                break
            # At a diagonal contact, turn right to keep the ink on the right.
            for vx, vy in [(dy, -dx), (dx, dy), (-dy, dx)]:
                after = (end[0] + vx, end[1] + vy)
                if (end, after) in edges:
                    if (dx, dy) != (vx, vy):
                        pen.lineTo((end[0] * UNIT, end[1] * UNIT))
                    current, end = end, after
                    break
        pen.closePath()
    return pen.glyph()


def build(source):
    if sha256(source.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise ValueError('expected Adobe Source Code Pro Medium 2.042')
    face = ImageFont.truetype(source, 20)
    upstream = TTFont(source)
    extras = '‘’“”–—…←↑→↓'
    codes = [*range(32, 127), *range(160, 256), *map(ord, extras)]
    cmap = {c: agl.UV2AGL.get(c, f'uni{c:04X}') for c in codes
            if c in upstream.getBestCmap()}
    missing = {(x, y) for x in range(2, 10) for y in range(12)
               if x in (2, 9) or y in (0, 11)}
    tiles = {'.notdef': missing}
    tiles.update({name: cut_letter(face, chr(c)) for c, name in cmap.items()})

    font = FontBuilder(1000, isTTF=True)
    font.setupGlyphOrder(list(tiles))
    font.setupCharacterMap(cmap)
    font.setupGlyf({name: outline(ink) for name, ink in tiles.items()})
    font.setupHorizontalMetrics({name: (ADVANCE, min((x for x, _ in ink), default=0) * UNIT)
                                 for name, ink in tiles.items()})
    font.setupHorizontalHeader(ascent=850, descent=-250)
    font.setupNameTable({
        'copyright': upstream['name'].getDebugName(0),
        'familyName': 'Crooked Hand', 'styleName': 'Regular',
        'uniqueFontIdentifier': '1.000;LIKE;CrookedHand-Regular',
        'fullName': 'Crooked Hand Regular', 'psName': 'CrookedHand-Regular',
        'version': 'Version 1.000',
        'description': 'Hand-cut monospaced derivative of Adobe Source Code Pro Medium for LIKE LIKE.',
        'licenseDescription': upstream['name'].getDebugName(13),
        'licenseInfoURL': 'https://openfontlicense.org/',
    })
    font.setupOS2(sTypoAscender=850, sTypoDescender=-250, sTypoLineGap=0,
                  usWinAscent=1000, usWinDescent=300, sxHeight=500, sCapHeight=650,
                  fsSelection=0x40)
    font.setupPost(isFixedPitch=1)
    # The desktop and web versions carry identical artwork and metrics.
    font.font['head'].created = font.font['head'].modified = 3800000000
    font.font.recalcTimestamp = False
    font.save(Path(__file__).with_name('crooked-hand.ttf'))
    font.font.flavor = 'woff2'
    font.save(Path(__file__).with_name('crooked-hand.woff2'))


if __name__ == '__main__':
    build(Path(sys.argv[1]))
