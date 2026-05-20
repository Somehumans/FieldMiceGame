"""Build Micecoin sprite sheets from the 4 hand-authored frame PNGs."""

from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FRAME_SOURCES = [
    ROOT / "Frame 15.png",
    ROOT / "Frame 17.png",
    ROOT / "Frame 19.png",
    ROOT / "Frame 20.png",
]
OUT_DIR = ROOT / "assets" / "micecoin"
FRAMES = 4
BG_THRESHOLD = 32
DISPLAY_SIZES = (22, 18, 16, 14)


def is_background(r, g, b, a=255):
    return a < 8 or (r <= BG_THRESHOLD and g <= BG_THRESHOLD and b <= BG_THRESHOLD)


def strip_background(img):
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    visited = [[False] * w for _ in range(h)]
    q = deque()

    for x in range(w):
        for y in (0, h - 1):
            if not visited[y][x] and is_background(*px[x, y]):
                q.append((x, y))
                visited[y][x] = True

    for y in range(h):
        for x in (0, w - 1):
            if not visited[y][x] and is_background(*px[x, y]):
                q.append((x, y))
                visited[y][x] = True

    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx]:
                if is_background(*px[nx, ny]):
                    visited[ny][nx] = True
                    q.append((nx, ny))

    return img


def content_bbox(img):
    w, h = img.size
    px = img.load()
    min_x, min_y, max_x, max_y = w, h, 0, 0
    found = False

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 8 or is_background(r, g, b, a):
                continue
            found = True
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)

    if not found:
        return (0, 0, w, h)
    return (min_x, min_y, max_x + 1, max_y + 1)


def load_frames():
    squares = []
    for path in FRAME_SOURCES:
        if not path.exists():
            raise FileNotFoundError(f"Missing frame: {path}")
        img = strip_background(Image.open(path))
        bbox = content_bbox(img)
        coin = img.crop(bbox)
        size = max(coin.width, coin.height) + 8
        square = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        x = (size - coin.width) // 2
        y = (size - coin.height) // 2
        square.paste(coin, (x, y), coin)
        squares.append(square)
    return squares


def save_sheet(squares, px):
    sheet = Image.new("RGBA", (px * FRAMES, px), (0, 0, 0, 0))
    for i, square in enumerate(squares):
        cell = square.resize((px, px), Image.NEAREST)
        sheet.paste(cell, (i * px, 0), cell)
    return sheet


def write_keyframes_css():
    css_path = ROOT / "css" / "micecoin-keyframes.css"
    css_path.write_text(
        "/* Micecoin — 4 frames, steps(4) snaps with 400% bg-size */\n"
        "@keyframes mcCoinSpin {\n"
        "  from { background-position: 0 0; }\n"
        "  to { background-position: 100% 0; }\n"
        "}\n",
        encoding="utf-8",
    )
    return css_path


def main():
    squares = load_frames()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for i, square in enumerate(squares):
        square.save(OUT_DIR / f"frame-{i}.png")

    for px in DISPLAY_SIZES:
        sheet = save_sheet(squares, px)
        out = OUT_DIR / f"sheet-{px}.png"
        sheet.save(out)
        print(f"sheet-{px}.png -> {sheet.size[0]}x{sheet.size[1]}")

    legacy = ROOT / "assets" / "micecoin-sprite.png"
    save_sheet(squares, 22).save(legacy)
    write_keyframes_css()
    print(f"Built {FRAMES}-frame Micecoin sprites from Frame 15/17/19/20")


if __name__ == "__main__":
    main()
