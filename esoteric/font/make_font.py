"""Rebuild Crooked Hand with Python, Pillow, fontTools and Brotli.

Pass the path to SourceCodePro-Medium.ttf from Adobe's Source Code Pro 2.042 release.
https://github.com/adobe-fonts/source-code-pro/blob/d3f1a5962cde503f9409c21e58527611d4a19ef1/TTF/SourceCodePro-Medium.ttf

The outlines and this font source are distributed under the SIL Open Font License
1.1, included in OFL.txt. The original copyright notice is retained in the font.
"""
from hashlib import sha256
from pathlib import Path
import sys
import unicodedata

from fontTools import agl
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

from letters import STRIPS


# Eight screen pixels make the source's 600-unit advance.
PIXEL = 75
ADVANCE = 600
BASELINE = 10
SOURCE_SHA256 = 'f9dbc746f60c83f5cb1503b19f90729d8195cab6bb67f2b861d4eb257ed86536'


def read_strips():
    bitmaps = {}
    for chars, strip in STRIPS:
        rows = [line.split() for line in strip.strip().splitlines()]
        for row in rows:
            if len(row) != len(chars) or any(len(cell) != 7 or set(cell) - {'.', '#'} for cell in row):
                raise ValueError(f'malformed character cell in {chars}: {row}')
        for i, char in enumerate(chars):
            if char in bitmaps:
                raise ValueError(f'duplicate character {char}')
            bitmaps[char] = {(x, BASELINE - y - 1) for y, row in enumerate(rows)
                             for x, bit in enumerate(row[i]) if bit == '#'}
    return bitmaps


LETTERS = read_strips()

# The offset is measured from the top of the unaccented letter. Each mark
# uses the same screen pixel as the lowercase body and the capital letters.
ACCENTS = {
    '\u0300': [(2, 2), (3, 1)],
    '\u0301': [(4, 2), (3, 1)],
    '\u0302': [(3, 2), (2, 1), (4, 1)],
    '\u0303': [(1, 1), (2, 2), (3, 2), (4, 1), (5, 2)],
    '\u0308': [(1, 1), (2, 1), (4, 1), (5, 1)],
    '\u030a': [(2, 2), (3, 2), (1, 1), (4, 1), (2, 0), (3, 0)],
}


def cut_letter(face, char):
    parts = unicodedata.normalize('NFD', char)
    base = parts[0]
    if base in LETTERS and all(mark in ACCENTS or mark == '\u0327' for mark in parts[1:]):
        pixels = set(LETTERS[base])
        if len(parts) > 1 and base in 'ij':
            pixels = {(x, y) for x, y in pixels if y < 7}
        top = max((y + 1 for _, y in pixels), default=0)
        for mark in parts[1:]:
            if mark == '\u0327':
                pixels.update([(3, -1), (4, -2), (3, -3), (2, -3)])
            else:
                pixels.update((x, top + y) for x, y in ACCENTS[mark])
        # The side gutter is split 25/50 between the left and right of a cell.
        return pixels, 25

    # The remaining signs keep Adobe's designs. Strike the source at three
    # times the design grid, then threshold the coverage of each screen pixel.
    pad = 5
    sheet = Image.new('L', (24, (BASELINE + pad + 5) * 3))
    ImageDraw.Draw(sheet).text((0, (BASELINE + pad) * 3), char, font=face, fill=255, anchor='ls')
    small = sheet.resize((8, sheet.height // 3), Image.Resampling.BOX)
    pixels = {(x, BASELINE + pad - row - 1) for row in range(small.height)
              for x in range(small.width) if small.getpixel((x, row)) >= 95}
    return pixels, 0


def outline(pixels, inset):
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
        pen.moveTo((inset + current[0] * PIXEL, current[1] * PIXEL))
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
                        pen.lineTo((inset + end[0] * PIXEL, end[1] * PIXEL))
                    current, end = end, after
                    break
        pen.closePath()
    return pen.glyph()


def build(source):
    if sha256(source.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise ValueError('expected Adobe Source Code Pro Medium 2.042')
    face = ImageFont.truetype(source, 40)
    upstream = TTFont(source)
    extras = '‘’“”–—…←↑→↓'
    codes = [*range(32, 127), *range(160, 256), *map(ord, extras)]
    cmap = {c: agl.UV2AGL.get(c, f'uni{c:04X}') for c in codes
            if c in upstream.getBestCmap()}
    missing = {(x, y) for x in range(1, 7) for y in range(8)
               if x in (1, 6) or y in (0, 7)}
    tiles = {'.notdef': (missing, 0)}
    tiles.update({name: cut_letter(face, chr(c)) for c, name in cmap.items()})

    font = FontBuilder(1000, isTTF=True)
    font.setupGlyphOrder(list(tiles))
    font.setupCharacterMap(cmap)
    font.setupGlyf({name: outline(ink, inset) for name, (ink, inset) in tiles.items()})
    font.setupHorizontalMetrics({
        name: (ADVANCE, min((x * PIXEL + inset for x, _ in ink), default=0))
        for name, (ink, inset) in tiles.items()
    })
    font.setupHorizontalHeader(ascent=850, descent=-250)
    font.setupNameTable({
        'copyright': upstream['name'].getDebugName(0),
        'familyName': 'Crooked Hand', 'styleName': 'Regular',
        'uniqueFontIdentifier': '3.000;LIKE;CrookedHand-Regular',
        'fullName': 'Crooked Hand Regular', 'psName': 'CrookedHand-Regular',
        'version': 'Version 3.000',
        'description': 'Eight-column bitmap cut of the monospaced LIKE LIKE derivative of Adobe Source Code Pro Medium.',
        'licenseDescription': upstream['name'].getDebugName(13),
        'licenseInfoURL': 'https://openfontlicense.org/',
    })
    font.setupOS2(sTypoAscender=850, sTypoDescender=-250, sTypoLineGap=0,
                  usWinAscent=1000, usWinDescent=300, sxHeight=525, sCapHeight=750,
                  fsSelection=0x40)
    font.setupPost(isFixedPitch=1)
    font.font['head'].fontRevision = 3.0
    # The desktop and web versions carry identical artwork and metrics.
    font.font['head'].created = font.font['head'].modified = 3800000000
    font.font.recalcTimestamp = False
    font.save(Path(__file__).with_name('crooked-hand.ttf'))
    font.font.flavor = 'woff2'
    font.save(Path(__file__).with_name('crooked-hand.woff2'))


if __name__ == '__main__':
    build(Path(sys.argv[1]))
