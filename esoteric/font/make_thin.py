"""Cut thinner weights of Crooked Hand from crooked-hand.ttf, for small text.

"the text should also get skinnier as you shrink it, otherwise it could be hard to read"
(November 23). Each weight keeps every pixel of the regular cut, but draws its strokes
narrower: a square at each pixel's centre, joined to its neighbours by bars of the same
width, and to a neighbour it only touches at a corner by a diagonal of about the same
weight. The regular cut is not touched.

    python make_thin.py

needs fontTools and brotli. It writes crooked-hand-300.woff2, -200 and -100 beside this file.
"""
from pathlib import Path

from fontTools.pens.pointInsidePen import PointInsidePen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

HERE = Path(__file__).parent
PIXEL = 75   # font units in one pixel of the regular cut
SUB = 15     # finer steps a pixel is cut into
UNIT = PIXEL // SUB
# weight: how many of the SUB steps a stroke is wide (odd, so it sits on the pixel's centre)
WEIGHTS = {300: 13, 200: 11, 100: 9}


def pixels_of(glyph_set, name):
    """The regular cut's pixels for a glyph, and the glyph's left inset in font units."""
    glyph = glyph_set[name]
    xs = []

    class Collect:
        def moveTo(self, p): xs.append(p[0])
        def lineTo(self, p): xs.append(p[0])
        def qCurveTo(self, *ps): xs.extend(p[0] for p in ps if p)
        def curveTo(self, *ps): xs.extend(p[0] for p in ps)
        def closePath(self): pass
        def endPath(self): pass
        def addComponent(self, *a): pass

    glyph.draw(Collect())
    if not xs:
        return set(), 0
    inset = min(xs) % PIXEL
    ink = set()
    for x in range(-2, 12):
        for y in range(-6, 16):
            pen = PointInsidePen(glyph_set, (inset + (x + .5) * PIXEL, (y + .5) * PIXEL))
            glyph.draw(pen)
            if pen.getResult():
                ink.add((x, y))
    return ink, inset


def thin(ink, width):
    """The fine steps covered by a stroke `width` steps wide through every pixel."""
    lo, hi = (SUB - width) // 2, (SUB + width) // 2  # a stroke across one pixel's steps
    diag = int(round(width / 2 ** .5)) | 1           # the side of a diagonal's squares, odd
    dlo = (SUB - diag) // 2
    cells = set()

    def box(x0, y0, x1, y1):
        for sx in range(x0, x1):
            for sy in range(y0, y1):
                cells.add((sx, sy))

    for x, y in ink:
        bx, by = x * SUB, y * SUB
        box(bx + lo, by + lo, bx + hi, by + hi)
        if (x + 1, y) in ink:
            box(bx + lo, by + lo, bx + SUB + hi, by + hi)
        if (x, y + 1) in ink:
            box(bx + lo, by + lo, bx + hi, by + SUB + hi)
        for dy in (1, -1):
            # a neighbour met only at a corner: a diagonal between the two centres
            if (x + 1, y + dy) in ink and (x + 1, y) not in ink and (x, y + dy) not in ink:
                for t in range(SUB + 1):
                    sx, sy = bx + dlo + t, by + dlo + dy * t
                    box(sx, sy, sx + diag, sy + diag)
    return cells


def outline(cells, inset):
    # As make_font.py traces the regular cut: the edge of the ink, interior edges left out.
    edges = set()
    for x, y in cells:
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
        pen.moveTo((inset + current[0] * UNIT, current[1] * UNIT))
        while True:
            edges.remove((current, end))
            dx, dy = end[0] - current[0], end[1] - current[1]
            if end == start:
                break
            for vx, vy in [(dy, -dx), (dx, dy), (-dy, dx)]:
                after = (end[0] + vx, end[1] + vy)
                if (end, after) in edges:
                    if (dx, dy) != (vx, vy):
                        pen.lineTo((inset + end[0] * UNIT, end[1] * UNIT))
                    current, end = end, after
                    break
        pen.closePath()
    return pen.glyph()


def build():
    source = HERE / 'crooked-hand.ttf'
    regular = TTFont(source)
    glyph_set = regular.getGlyphSet()
    found = {name: pixels_of(glyph_set, name) for name in regular.getGlyphOrder()}
    for weight, width in WEIGHTS.items():
        font = TTFont(source)
        glyf, hmtx = font['glyf'], font['hmtx']
        for name, (ink, inset) in found.items():
            glyph = outline(thin(ink, width), inset)
            glyph.recalcBounds(glyf)
            glyf[name] = glyph
            advance, _ = hmtx[name]
            hmtx[name] = (advance, getattr(glyph, 'xMin', 0))
        font['OS/2'].usWeightClass = weight
        style = {300: 'Light', 200: 'ExtraLight', 100: 'Thin'}[weight]
        names = font['name']
        for rec in names.names:
            if rec.nameID in (2, 17):
                rec.string = style
            elif rec.nameID in (3, 4, 6):
                rec.string = {3: f'3.000;LIKE;CrookedHand-{style}', 4: f'Crooked Hand {style}',
                              6: f'CrookedHand-{style}'}[rec.nameID]
        font.flavor = 'woff2'
        font.save(HERE / f'crooked-hand-{weight}.woff2')


if __name__ == '__main__':
    build()
