from collections import deque
from pathlib import Path

from PIL import Image

SRC = Path(__file__).resolve().parents[1] / "assets" / "micecoin-sprite.png"
FRAMES = 14


def is_bg(r, g, b):
    return r <= 32 and g <= 32 and b <= 32


def strip_background(img):
    w, h = img.size
    px = img.load()
    visited = [[False] * w for _ in range(h)]
    q = deque()

    for x in range(w):
        for y in (0, h - 1):
            if not visited[y][x] and is_bg(*px[x, y][:3]):
                q.append((x, y))
                visited[y][x] = True

    for y in range(h):
        for x in (0, w - 1):
            if not visited[y][x] and is_bg(*px[x, y][:3]):
                q.append((x, y))
                visited[y][x] = True

    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx]:
                r, g, b, _a = px[nx, ny]
                if is_bg(r, g, b):
                    visited[ny][nx] = True
                    q.append((nx, ny))


def crop_to_even_frames(img):
    w, h = img.size
    frame_w = w // FRAMES
    trimmed_w = frame_w * FRAMES
    if trimmed_w != w:
        img = img.crop((0, 0, trimmed_w, h))
    return img, frame_w


def main():
    img = Image.open(SRC).convert("RGBA")
    strip_background(img)
    img, frame_w = crop_to_even_frames(img)
    img.save(SRC)
    print(f"Saved {FRAMES}-frame sprite: {img.size[0]}x{img.size[1]} ({frame_w}px per frame)")


if __name__ == "__main__":
    main()
