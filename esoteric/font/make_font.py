"""Rebuild Crooked Hand with Python, Pillow, fontTools and Brotli.

Pass the path to SourceCodePro-Medium.ttf from Adobe's Source Code Pro 2.042 release.
https://github.com/adobe-fonts/source-code-pro/blob/d3f1a5962cde503f9409c21e58527611d4a19ef1/TTF/SourceCodePro-Medium.ttf

The outlines and this font source are distributed under the SIL Open Font License
1.1, included in OFL.txt. The original copyright notice is retained in the font.
"""
from hashlib import sha256
from pathlib import Path
from math import ceil, hypot
import sys
import unicodedata

from fontTools import agl
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

from letters import LETTERS


# Two cuts per original proof pixel, with the same 0.60 em advance.
UNIT = 25
ADVANCE = 600
BASELINE = 31
PAD = 10
SOURCE_SHA256 = 'f9dbc746f60c83f5cb1503b19f90729d8195cab6bb67f2b861d4eb257ed86536'


def nib_path(draw, stroke, offset=0):
    # Moving a narrow, angled nib thickens a downstroke and feathers a return.
    # Each knot has its own pressure. Endpoints can swell, split or die away.
    erase = stroke.startswith('!')
    points = [tuple(map(float, knot.split(','))) for knot in stroke.lstrip('!').split()]
    for (x, y, p), (x1, y1, p1) in zip(points, points[1:]):
        steps = max(1, ceil(3 * hypot(x1 - x, y1 - y)))
        for i in range(steps + 1):
            t = i / steps
            cx, cy = x + t * (x1 - x), PAD + offset + y + t * (y1 - y)
            width = p + t * (p1 - p)
            nib = [(-0.55, 0.12), (-0.38, 0.42), (0.55, -0.13), (0.40, -0.42)]
            stamp = [(round(cx + a * width), round(cy + b * width)) for a, b in nib]
            draw.polygon(stamp, fill=0 if erase else 255)


ACCENTS = {
    '\u0300': ['9,-7,1 10,-4,4 14,-2,1'],
    '\u0301': ['10,-2,1 14,-7,4 16,-8,1'],
    '\u0302': ['7,-2,1 12,-7,4 17,-3,1'],
    '\u0303': ['6,-4,1 9,-6,3 14,-3,2 18,-6,1'],
    '\u0308': ['7,-5,2 8,-4,3', '15,-5,2 16,-4,3'],
    '\u030a': ['9,-6,2 13,-9,2 16,-6,2 12,-3,2 9,-6,2'],
    '\u0327': ['12,1,2 10,3,2 14,5,3 10,8,1'],
}


def cut_letter(face, char):
    sheet = Image.new('L', (24, PAD + BASELINE + 12))
    draw = ImageDraw.Draw(sheet)
    parts = unicodedata.normalize('NFD', char)
    base = parts[0]
    if base in LETTERS and all(mark in ACCENTS for mark in parts[1:]):
        for stroke in LETTERS[base]:
            # An accent takes the place of the dot on lowercase i and j.
            if len(parts) > 1 and base in 'ij' and stroke == LETTERS[base][0]:
                continue
            nib_path(draw, stroke)
        for mark in parts[1:]:
            top = sheet.getbbox()[1] - PAD
            align = BASELINE if mark == '\u0327' else top
            for stroke in ACCENTS[mark]:
                nib_path(draw, stroke, align)
    else:
        # Secondary signs keep Adobe's outlines, cut on the same fine grid.
        draw.text((0, BASELINE + PAD), char, font=face, fill=255, anchor='ls')
    return {(x, BASELINE + PAD - row - 1)
            for row in range(sheet.height) for x in range(sheet.width)
            if sheet.getpixel((x, row)) >= 100}


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
    face = ImageFont.truetype(source, 40)
    upstream = TTFont(source)
    extras = '‘’“”–—…←↑→↓'
    codes = [*range(32, 127), *range(160, 256), *map(ord, extras)]
    cmap = {c: agl.UV2AGL.get(c, f'uni{c:04X}') for c in codes
            if c in upstream.getBestCmap()}
    missing = {(x, y) for x in range(4, 20) for y in range(24)
               if x in (4, 5, 18, 19) or y in (0, 1, 22, 23)}
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
        'uniqueFontIdentifier': '2.000;LIKE;CrookedHand-Regular',
        'fullName': 'Crooked Hand Regular', 'psName': 'CrookedHand-Regular',
        'version': 'Version 2.000',
        'description': 'Hand-cut monospaced derivative of Adobe Source Code Pro Medium for LIKE LIKE.',
        'licenseDescription': upstream['name'].getDebugName(13),
        'licenseInfoURL': 'https://openfontlicense.org/',
    })
    font.setupOS2(sTypoAscender=850, sTypoDescender=-250, sTypoLineGap=0,
                  usWinAscent=1000, usWinDescent=300, sxHeight=525, sCapHeight=725,
                  fsSelection=0x40)
    font.setupPost(isFixedPitch=1)
    font.font['head'].fontRevision = 2.0
    # The desktop and web versions carry identical artwork and metrics.
    font.font['head'].created = font.font['head'].modified = 3800000000
    font.font.recalcTimestamp = False
    font.save(Path(__file__).with_name('crooked-hand.ttf'))
    font.font.flavor = 'woff2'
    font.save(Path(__file__).with_name('crooked-hand.woff2'))


if __name__ == '__main__':
    build(Path(sys.argv[1]))
