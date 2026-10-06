#!/usr/bin/env python3
"""Bakes every raster brand asset from brand/tokens.json.

    python3 scripts/build-brand-assets.py

Outputs to public/brand/. Never hand-edit the PNGs: change tokens or this script and rebuild.
"""
import json, math, os, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = json.load(open(os.path.join(ROOT, 'brand', 'tokens.json')))
OUT = os.path.join(ROOT, 'public', 'brand')
os.makedirs(OUT, exist_ok=True)
SS = 2  # supersample, then downscale for clean edges


def rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


C = {k: rgb(v) for k, v in T['color'].items()}
FD = '/usr/share/fonts/opentype/inter/'


def font(weight, size):
    return ImageFont.truetype(f'{FD}Inter-{weight}.otf', int(size * SS))


def shade(c, a):
    t = (0, 0, 0) if a < 0 else (255, 255, 255)
    a = abs(a)
    return tuple(int(c[i] + (t[i] - c[i]) * a) for i in range(3))


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def with_alpha(c, a):
    return (*c, int(a))


def layer(size):
    return Image.new('RGBA', size, (0, 0, 0, 0))


# ---------------------------------------------------------------- people (boxy, like the game)
CLOTH = [(61, 74, 107), (90, 61, 74), (63, 90, 82), (107, 90, 61), (74, 78, 99), (84, 64, 107), (120, 70, 60), (70, 100, 120)]
HAIR = [(42, 29, 18), (22, 18, 16), (88, 60, 34), (150, 150, 158), (120, 84, 40)]
SKIN = [(230, 191, 156), (200, 150, 110), (74, 47, 32), (240, 205, 175)]


def person(d, cx, base, H, kind, cloth, hair, skin, front=False):
    k = {'adult': 1.0, 'child': 0.64, 'senior': 0.9}[kind]
    h = H * k
    hk = 1.28 if kind == 'child' else 1.0
    pants = shade(cloth, -0.55)
    lw = 0.15 * h
    for sx in (-1, 1):
        x = cx + sx * 0.095 * h
        d.rectangle([x - lw / 2, base - 0.40 * h, x + lw / 2, base - 0.05 * h], fill=pants)
        d.rounded_rectangle([x - lw / 2 - 0.01 * h, base - 0.06 * h, x + lw / 2 + 0.02 * h, base], 0.02 * h, fill=(18, 18, 24))
    tw = 0.44 * h
    d.rounded_rectangle([cx - tw / 2, base - 0.76 * h, cx + tw / 2, base - 0.36 * h], 0.06 * h, fill=cloth)
    aw = 0.085 * h
    for sx in (-1, 1):
        x = cx + sx * (tw / 2 + aw / 2 - 0.01 * h)
        d.rounded_rectangle([x - aw / 2, base - 0.74 * h, x + aw / 2, base - 0.44 * h], 0.035 * h, fill=shade(cloth, -0.15))
        d.ellipse([x - aw / 2, base - 0.47 * h, x + aw / 2, base - 0.39 * h], fill=skin)
    hw, hh = 0.24 * h * hk, 0.25 * h * hk
    hb = base - 0.74 * h
    box = [cx - hw / 2, hb - hh, cx + hw / 2, hb]
    d.rounded_rectangle(box, 0.07 * h, fill=skin)
    if not front:
        d.rounded_rectangle(box, 0.07 * h, fill=hair)
    else:
        d.rounded_rectangle([box[0], box[1], box[2], box[1] + hh * 0.42], 0.07 * h, fill=hair)
        ey = hb - hh * 0.46
        for sx in (-1, 1):
            ex = cx + sx * hw * 0.24
            ew, eh = hw * 0.21, hw * 0.24
            d.ellipse([ex - ew / 2, ey - eh / 2, ex + ew / 2, ey + eh / 2], fill=C['paper'])
            pr = hw * 0.07
            px, py = ex + hw * 0.045, ey - hw * 0.04  # glancing up and across: waiting, curious
            d.ellipse([px - pr, py - pr, px + pr, py + pr], fill=(22, 17, 14))
        lw2 = max(2, int(hw * 0.035))
        d.line([cx - hw * 0.36, ey - hw * 0.22, cx - hw * 0.12, ey - hw * 0.27], fill=(42, 29, 18), width=lw2)
        d.line([cx + hw * 0.12, ey - hw * 0.34, cx + hw * 0.36, ey - hw * 0.26], fill=(42, 29, 18), width=lw2)  # one brow raised
        d.line([cx - hw * 0.14, hb - hh * 0.18, cx + hw * 0.16, hb - hh * 0.23], fill=(122, 42, 42), width=lw2)
    if kind == 'senior':
        sx0 = cx + tw / 2 + aw * 0.6
        d.line([sx0, base - 0.42 * h, sx0 + 0.06 * h, base], fill=C['brass'], width=max(2, int(0.025 * h)))
    return hb - hh  # top of head


def dog(d, cx, base, H, coat):
    u = H * 0.42
    for sx in (-1, 1):
        d.rounded_rectangle([cx + sx * 0.2 * u - 0.045 * u, base - 0.3 * u, cx + sx * 0.2 * u + 0.045 * u, base], 0.03 * u, fill=shade(coat, -0.2))
    d.rounded_rectangle([cx - 0.3 * u, base - 0.64 * u, cx + 0.3 * u, base - 0.26 * u], 0.15 * u, fill=coat)
    d.ellipse([cx - 0.15 * u, base - 0.9 * u, cx + 0.15 * u, base - 0.6 * u], fill=coat)
    for sx in (-1, 1):
        d.rounded_rectangle([cx + sx * 0.17 * u - 0.045 * u, base - 0.9 * u, cx + sx * 0.17 * u + 0.045 * u, base - 0.66 * u], 0.04 * u, fill=shade(coat, -0.35))
    d.line([cx + 0.22 * u, base - 0.55 * u, cx + 0.34 * u, base - 0.86 * u], fill=coat, width=max(2, int(0.055 * u)))
    return base - 0.9 * u



def dog_front(d, cx, base, H, coat):
    """Seated-looking dog facing the camera: floppy ears, pink tongue, patient stare."""
    u = H * 0.5
    dark = shade(coat, -0.35)
    for sx in (-1, 1):
        d.rounded_rectangle([cx + sx * 0.17 * u - 0.06 * u, base - 0.36 * u, cx + sx * 0.17 * u + 0.06 * u, base], 0.04 * u, fill=shade(coat, -0.15))
    d.rounded_rectangle([cx - 0.27 * u, base - 0.62 * u, cx + 0.27 * u, base - 0.2 * u], 0.14 * u, fill=coat)
    hy = base - 0.86 * u
    for sx in (-1, 1):
        d.rounded_rectangle([cx + sx * 0.2 * u - 0.06 * u, hy - 0.16 * u, cx + sx * 0.2 * u + 0.06 * u, hy + 0.2 * u], 0.05 * u, fill=dark)
    d.rounded_rectangle([cx - 0.17 * u, hy - 0.2 * u, cx + 0.17 * u, hy + 0.17 * u], 0.09 * u, fill=coat)
    d.rounded_rectangle([cx - 0.09 * u, hy - 0.01 * u, cx + 0.09 * u, hy + 0.16 * u], 0.05 * u, fill=shade(coat, 0.35))
    d.ellipse([cx - 0.035 * u, hy - 0.01 * u, cx + 0.035 * u, hy + 0.03 * u], fill=(16, 16, 16))
    d.rounded_rectangle([cx - 0.025 * u, hy + 0.1 * u, cx + 0.025 * u, hy + 0.2 * u], 0.02 * u, fill=(214, 120, 130))
    for sx in (-1, 1):
        ex = cx + sx * 0.085 * u
        d.ellipse([ex - 0.035 * u, hy - 0.1 * u, ex + 0.035 * u, hy - 0.03 * u], fill=C['paper'])
        d.ellipse([ex - 0.018 * u + 0.006 * u * sx, hy - 0.085 * u, ex + 0.018 * u + 0.006 * u * sx, hy - 0.045 * u], fill=(16, 16, 16))
    return hy - 0.2 * u


def cat_front(d, cx, base, H, coat):
    """Cat facing the camera: pointed ears, green slit eyes, whiskers, tail held high."""
    u = H * 0.46
    d.line([cx + 0.2 * u, base - 0.12 * u, cx + 0.34 * u, base - 0.4 * u, cx + 0.3 * u, base - 0.7 * u], fill=coat, width=max(2, int(0.07 * u)), joint='curve')
    d.rounded_rectangle([cx - 0.24 * u, base - 0.62 * u, cx + 0.24 * u, base], 0.12 * u, fill=coat)
    d.rounded_rectangle([cx - 0.14 * u, base - 0.3 * u, cx + 0.14 * u, base], 0.05 * u, fill=shade(coat, 0.3))
    hy = base - 0.82 * u
    for sx in (-1, 1):
        d.polygon([(cx + sx * 0.19 * u, hy - 0.04 * u), (cx + sx * 0.2 * u, hy - 0.27 * u), (cx + sx * 0.05 * u, hy - 0.15 * u)], fill=coat)
        d.polygon([(cx + sx * 0.16 * u, hy - 0.08 * u), (cx + sx * 0.17 * u, hy - 0.2 * u), (cx + sx * 0.09 * u, hy - 0.14 * u)], fill=(214, 140, 140))
    d.rounded_rectangle([cx - 0.2 * u, hy - 0.18 * u, cx + 0.2 * u, hy + 0.15 * u], 0.1 * u, fill=coat)
    for sx in (-1, 1):
        ex = cx + sx * 0.09 * u
        d.ellipse([ex - 0.045 * u, hy - 0.08 * u, ex + 0.045 * u, hy + 0.0], fill=(156, 204, 74))
        d.rectangle([ex - 0.007 * u, hy - 0.08 * u, ex + 0.007 * u, hy + 0.0], fill=(16, 16, 16))
        for dy in (0.04, 0.075):
            d.line([cx + sx * 0.12 * u, hy + dy * u, cx + sx * 0.3 * u, hy + (dy - 0.02) * u], fill=(238, 238, 238), width=max(1, int(0.008 * u)))
    d.polygon([(cx - 0.025 * u, hy + 0.03 * u), (cx + 0.025 * u, hy + 0.03 * u), (cx, hy + 0.07 * u)], fill=(208, 136, 136))
    return hy - 0.27 * u


# ---------------------------------------------------------------- scene
def scene(W, H, horizon, vx, fg_x, fg_base, fg_h, stage_w, stage_h, left_clear=0):
    """left_clear: x below which no buildings/sky clutter is drawn (keeps text areas calm)."""
    w, h = W * SS, H * SS
    s = lambda v: v * SS
    rnd = random.Random(1)
    img = Image.new('RGB', (w, h), C['night'])
    d = ImageDraw.Draw(img)
    # sky
    for y in range(int(s(horizon))):
        d.line([(0, y), (w, y)], fill=mix(C['night'], C['dusk'], y / s(horizon)))
    # ground
    for y in range(int(s(horizon)), h):
        t = (y - s(horizon)) / max(1, h - s(horizon))
        d.line([(0, y), (w, y)], fill=mix(C['ground'], C['night'], min(1, t * 1.15)))
    # stars
    for _ in range(46):
        x, y = rnd.randint(int(s(left_clear)), w), rnd.randint(0, int(s(horizon * 0.7)))
        r = rnd.choice([1, 1, 2]) * SS * 0.6
        d.ellipse([x - r, y - r, x + r, y + r], fill=mix(C['night'], C['quiet'], rnd.uniform(0.3, 0.8)))
    # buildings either side of the stage
    x = s(left_clear)
    while x < w:
        bw = s(rnd.randint(50, 110))
        bh = s(rnd.randint(70, 210)) * (H / 630 if H < 700 else 1.0)
        if abs((x + bw / 2) - s(vx)) > s(stage_w / 2 + 20):
            d.rectangle([x, s(horizon) - bh, x + bw, s(horizon)], fill=C['facade'])
            for wy in range(int(s(horizon) - bh + s(14)), int(s(horizon) - s(10)), int(s(22))):
                for wx in range(int(x + s(10)), int(x + bw - s(14)), int(s(20))):
                    if rnd.random() < 0.28:
                        d.rectangle([wx, wy, wx + s(8), wy + s(11)], fill=C['windowWarm'])
        x += bw + s(rnd.randint(2, 10))
    # kerbs converging on the stage
    for kx in (fg_x - 0.62 * fg_h, fg_x + 0.62 * fg_h):
        d.line([(s(kx), h), (s(vx - 0 * stage_w + (kx - fg_x) * 0.12), s(horizon))], fill=C['kerb'], width=SS * 3)
    # light spilling from the stage down the street
    sp = layer((w, h))
    sd = ImageDraw.Draw(sp)
    sd.polygon([(s(vx - stage_w * 0.4), s(horizon)), (s(vx + stage_w * 0.4), s(horizon)), (s(fg_x + fg_h * 0.7), h), (s(fg_x - fg_h * 0.7), h)], fill=with_alpha(C['gold'], 24))
    sp = sp.filter(ImageFilter.GaussianBlur(s(18)))
    img = Image.alpha_composite(img.convert('RGBA'), sp)
    # stage glow
    gl = layer((w, h))
    gd = ImageDraw.Draw(gl)
    cy = horizon - stage_h * 0.5
    gd.ellipse([s(vx - stage_w * 1.1), s(cy - stage_h * 1.3), s(vx + stage_w * 1.1), s(cy + stage_h * 1.3)], fill=with_alpha(C['gold'], 85))
    gl = gl.filter(ImageFilter.GaussianBlur(s(34)))
    img = Image.alpha_composite(img, gl)
    d = ImageDraw.Draw(img)
    # the stage: velvet curtains parted on light
    sx0, sx1 = vx - stage_w / 2, vx + stage_w / 2
    sy0, sy1 = horizon - stage_h, horizon
    d.rectangle([s(sx0 - 6), s(sy0 - 10), s(sx1 + 6), s(sy1)], fill=C['night'])
    d.rectangle([s(sx0), s(sy0 + 14), s(sx1), s(sy1)], fill=C['glow'])
    d.rectangle([s(vx - stage_w * 0.12), s(sy0 + 14), s(vx + stage_w * 0.12), s(sy1)], fill=shade(C['glow'], 0.4))
    cw = stage_w * 0.34
    for a, b in ((sx0, sx0 + cw), (sx1 - cw, sx1)):
        d.rectangle([s(a), s(sy0 + 14), s(b), s(sy1)], fill=C['velvet'])
        n = 6
        for i in range(1, n):
            xx = a + (b - a) * i / n
            d.line([(s(xx), s(sy0 + 14)), (s(xx), s(sy1))], fill=shade(C['velvet'], -0.35), width=SS * 2)
    d.rectangle([s(sx0 - 6), s(sy0 - 10), s(sx1 + 6), s(sy0 + 14)], fill=C['velvet'])
    d.rectangle([s(sx0 - 8), s(sy0 + 10), s(sx1 + 8), s(sy0 + 17)], fill=C['brass'])
    # soft shadows under every figure, then the figures far to near
    kinds = ['adult', 'dogf', 'child', 'catf', 'senior', 'dog', 'adult', 'catf', 'child', 'adult', 'senior', 'adult', 'dog', 'adult', 'adult', 'child', 'adult', 'adult', 'senior', 'adult', 'adult', 'adult']
    k = 0.32
    slots = []
    for i, kind in enumerate(kinds):
        sc = 1 / (1 + k * i)
        hh0 = fg_h * sc
        stag = 0 if i == 0 else (1 if i % 2 else -1) * (0.3 + 0.08 * ((i * 7) % 3)) * hh0
        slots.append((i, kind, sc, vx + (fg_x - vx) * sc + stag, horizon + (fg_base - horizon) * sc, hh0))
    sh = layer((w, h))
    shd = ImageDraw.Draw(sh)
    for i, kind, sc, x, y, hh in slots:
        shd.ellipse([s(x - 0.3 * hh), s(y - 0.04 * hh), s(x + 0.3 * hh), s(y + 0.05 * hh)], fill=(0, 0, 0, 150))
    img = Image.alpha_composite(img, sh.filter(ImageFilter.GaussianBlur(s(3))))
    d = ImageDraw.Draw(img)
    top_of_fg = None
    for i, kind, sc, x, y, hh in reversed(slots):
        cloth = CLOTH[(i * 3 + 1) % len(CLOTH)]
        hair = HAIR[(i * 2) % len(HAIR)]
        skin = SKIN[i % len(SKIN)]
        if kind == 'dogf':
            dog_front(d, s(x), s(y), s(hh), (200, 160, 110))
        elif kind == 'catf':
            cat_front(d, s(x), s(y), s(hh), (214, 150, 80) if i == 3 else (236, 228, 214))
        elif kind == 'dog':
            dog(d, s(x), s(y), s(hh), shade(rnd_choice(i), 0))
        elif i == 0:
            top_of_fg = person(d, s(x), s(y), s(hh), 'adult', (92, 84, 120), (42, 29, 18), SKIN[0], front=True)
        else:
            person(d, s(x), s(y), s(hh), kind, cloth, hair, skin)
    # you: gold ring at the feet, marker above the head, a place number we haven't been given yet
    cx0 = s(fg_x)
    rl = layer((w, h))
    rd = ImageDraw.Draw(rl)
    rd.ellipse([cx0 - s(fg_h * 0.3), s(fg_base) - s(fg_h * 0.05), cx0 + s(fg_h * 0.3), s(fg_base) + s(fg_h * 0.05)], outline=with_alpha(C['gold'], 215), width=SS * 4)
    img = Image.alpha_composite(img, rl)
    d = ImageDraw.Draw(img)
    mw = fg_h * 0.07
    my = top_of_fg - s(fg_h * 0.04)
    d.polygon([(cx0 - s(mw), my - s(mw * 1.9)), (cx0 + s(mw), my - s(mw * 1.9)), (cx0, my)], fill=C['gold'])
    pf = font('ExtraBold', fg_h * 0.075)
    pw, ph = s(fg_h * 0.2), s(fg_h * 0.1)
    py = my - s(mw * 1.9) - s(fg_h * 0.035)
    d.rounded_rectangle([cx0 - pw / 2, py - ph, cx0 + pw / 2, py], ph / 2, fill=C['gold'])
    d.text((cx0, py - ph / 2), '#?', font=pf, fill=C['goldInk'], anchor='mm')
    return img


def rnd_choice(i):
    return [(200, 160, 110), (120, 90, 60), (236, 228, 214), (60, 52, 48)][i % 4]


# ---------------------------------------------------------------- type helpers
def text_segments(img, x, y, segs, f, tracking=0.0):
    """Draw coloured segments on one baseline. y is the baseline in 1x units."""
    d = ImageDraw.Draw(img)
    cx = x * SS
    for txt, col in segs:
        d.text((cx, y * SS), txt, font=f, fill=col, anchor='ls')
        cx += f.getlength(txt)
    return cx / SS


def tracked(img, x, y, txt, f, col, tracking):
    d = ImageDraw.Draw(img)
    cx = x * SS
    for ch in txt:
        d.text((cx, y * SS), ch, font=f, fill=col, anchor='ls')
        cx += f.getlength(ch) + tracking * SS
    return cx / SS


def pill(img, cx, cy, txt, size, pad_x=34, pad_y=18, center=True, x=None):
    f = font('ExtraBold', size)
    d = ImageDraw.Draw(img)
    tw = f.getlength(txt) / SS
    ph = size + pad_y * 2
    pw = tw + pad_x * 2
    x0 = cx - pw / 2 if center else x
    d.rounded_rectangle([x0 * SS, (cy - ph / 2) * SS, (x0 + pw) * SS, (cy + ph / 2) * SS], ph * SS / 2, fill=C['gold'])
    d.text(((x0 + pw / 2) * SS, cy * SS), txt, font=f, fill=C['goldInk'], anchor='mm')


def headline(img, x, y, lines, size, lead=1.06):
    f = font('ExtraBold', size)
    for i, segs in enumerate(lines):
        text_segments(img, x, y + size * lead * (i + 1) - size * 0.2, segs, f)
    return y + size * lead * len(lines)


def finish(img, name):
    W, H = T['assets'][name]
    out = img.convert('RGB').resize((W, H), Image.LANCZOS)
    out.save(os.path.join(OUT, name), optimize=True)
    print('wrote', name, out.size)


INK, GOLD, QUIET = C['ink'], C['gold'], C['quiet']
Q = [[("What's your", INK)], [("place", GOLD), (" in", INK)], [("the line?", INK)]]


def landscape(name, H):
    W = 1200
    sy = H / 630
    img = scene(W, H, horizon=int(335 * sy), vx=905, fg_x=1015, fg_base=int(590 * sy), fg_h=int(410 * sy), stage_w=190, stage_h=int(125 * sy), left_clear=640)
    tracked(img, 64, 78 * sy, 'STUCK IN LINE', font('Bold', 22), QUIET, 5)
    headline(img, 60, 112 * sy, Q, int(82 * sy))
    text_segments(img, 64, 456 * sy, [(T['tagline'], INK)], font('SemiBold', 28))
    text_segments(img, 64, 494 * sy, [(T['line'], QUIET)], font('Medium', 25))
    pill(img, 0, 556 * sy, T['domain'], 30, pad_x=30, pad_y=14, center=False, x=64)
    finish(img, name)


def portrait(name, W, H, square=False):
    if square:
        img = scene(W, H, horizon=520, vx=560, fg_x=330, fg_base=960, fg_h=400, stage_w=250, stage_h=150)
        headline(img, 70, 50, [[("What's your ", INK), ("place", GOLD)], [("in the line?", INK)]], 88, lead=1.05)
        pill(img, 810, 975, T['domain'], 40, pad_x=40, pad_y=20)
        tracked(img, 70, 1035, 'STUCK IN LINE', font('Bold', 22), QUIET, 5)
    else:
        img = scene(W, H, horizon=700, vx=585, fg_x=330, fg_base=1190, fg_h=520, stage_w=300, stage_h=190)
        headline(img, 76, 60, Q, 118, lead=1.04)
        pill(img, W / 2 + 120, 1272, T['domain'], 46, pad_x=46, pad_y=22)
        tracked(img, 76, 1290, 'STUCK IN LINE', font('Bold', 22), QUIET, 5)
    finish(img, name)


def icon(name, size):
    S = size * SS
    img = Image.new('RGB', (S, S), C['night'])
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, S, S], S * 0.22, fill=C['night'])
    m = S * 0.5
    d.polygon([(m - S * 0.2, S * 0.14), (m + S * 0.2, S * 0.14), (m, S * 0.4)], fill=C['gold'])
    person(d, m, S * 0.92, S * 0.5, 'adult', (92, 84, 120), (42, 29, 18), SKIN[0], front=True)
    out = img.resize((size, size), Image.LANCZOS)
    out.save(os.path.join(OUT, name), optimize=True)
    print('wrote', name, out.size)


if __name__ == '__main__':
    landscape('og-image.png', 630)
    landscape('twitter-card.png', 600)
    portrait('instagram-facebook-4x5.png', 1080, 1350)
    portrait('social-square.png', 1080, 1080, square=True)
    icon('apple-touch-icon.png', 180)
    icon('favicon-32.png', 32)
