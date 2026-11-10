"""Lazy loading and a skeleton box for the site's content images, added after Jekyll writes the site.

Posts write plain <img src="/img/..."> tags. For each one this reads the image's size from its file and adds
loading="lazy" (to all but the page's first two), the box the image will fill (its aspect ratio, and its width
where the post sets none) and data-skeleton, which basic.sass draws as a gray, shimmering box until the image's load or error drops it.
It runs on the written site because only there is every page's final HTML, and every image is the real file
rather than its Git LFS pointer (pages.yml checks out with lfs: true).

Run by image_sizes.rb as: python3 image_sizes.py <site dir>
"""

import os
import struct
import sys
from html.parser import HTMLParser
from urllib.parse import unquote

CONTENT_PREFIX = "/img/"
# two: of 25 posts measured on a slow connection, one left the largest paint of two posts 0.3 to 0.5s
# later than loading every image at once; two did not, and three gained nothing more
EAGER_IMAGES = 2
DROP_SKELETON = "this.removeAttribute('data-skeleton')"


def image_size(path):
    """(width, height) from a PNG, GIF, JPEG or WebP header; None for any other file, such as an SVG or a
    Git LFS pointer, whose box is left to the browser."""
    with open(path, "rb") as f:
        head = f.read(32)
        if head[:8] == b"\x89PNG\r\n\x1a\n":
            return struct.unpack(">II", head[16:24])
        if head[:6] in (b"GIF87a", b"GIF89a"):
            return struct.unpack("<HH", head[6:10])
        if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
            return _webp_size(head)
        if head[:2] == b"\xff\xd8":
            f.seek(2)
            return _jpeg_size(f)
    return None


def _webp_size(head):
    chunk = head[12:16]
    if chunk == b"VP8X":
        return int.from_bytes(head[24:27], "little") + 1, int.from_bytes(head[27:30], "little") + 1
    if chunk == b"VP8L":
        bits = int.from_bytes(head[21:25], "little")
        return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    if chunk == b"VP8 ":
        width, height = struct.unpack("<HH", head[26:30])
        return width & 0x3FFF, height & 0x3FFF
    return None


def _jpeg_size(f):
    """The size in the first frame header (SOF0 to SOF15, which are not DHT, JPG or DAC), walking the
    segments before it."""
    while True:
        byte = f.read(1)
        while byte and byte != b"\xff":
            byte = f.read(1)
        while byte == b"\xff":
            byte = f.read(1)
        if not byte:
            return None
        marker = byte[0]
        if marker == 0x01 or 0xD0 <= marker <= 0xD8:
            continue  # markers without a length
        length = f.read(2)
        if len(length) < 2:
            return None
        if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
            height, width = struct.unpack(">xHH", f.read(5))
            return width, height
        f.seek(struct.unpack(">H", length)[0] - 2, 1)


class _ImageTags(HTMLParser):
    """Every <img> start tag with where it starts, its exact text and its attributes. The parser skips the
    text of <script> and <style> and of comments, so an <img> written there is not one."""

    def __init__(self):
        super().__init__()
        self.tags = []

    def handle_starttag(self, tag, attrs):
        if tag == "img":
            self.tags.append((self.getpos(), self.get_starttag_text(), attrs))

    handle_startendtag = handle_starttag


def add_skeletons(page, site_dir):
    """The page with each content image whose size is known made lazy and given its skeleton box. Only those
    tags change; every other character of the page is kept."""
    parser = _ImageTags()
    parser.feed(page)
    parser.close()
    line_starts = [0] + [i + 1 for i, char in enumerate(page) if char == "\n"]
    out, end = [], 0
    # a page's first content images stay eager: they are usually what a reader sees first, and a lazy image
    # is requested only once the page is laid out, about a second later on a slow connection
    seen = 0
    for (line, column), text, attrs in parser.tags:
        start = line_starts[line - 1] + column
        if page[start:start + len(text)] != text:
            raise ValueError(f"line {line}: the <img> tag is not where the parser reported it")
        tag = _with_skeleton(text, attrs, site_dir, seen >= EAGER_IMAGES)
        if tag is not None:
            out += [page[end:start], tag]
            end = start + len(text)
        seen += (dict(attrs).get("src") or "").startswith(CONTENT_PREFIX)
    out.append(page[end:])
    return "".join(out)


def _with_skeleton(text, attrs, site_dir, lazy):
    """The tag rewritten with its skeleton (and loading="lazy" when lazy), or None to leave it as
    written: not a content image, already done, its loading chosen by the post, or no size to read."""
    names = {name for name, _ in attrs}
    src = dict(attrs).get("src") or ""
    if not src.startswith(CONTENT_PREFIX) or names & {"loading", "data-skeleton", "onload"}:
        return None
    path = os.path.join(site_dir, unquote(src.split("#")[0].split("?")[0]).lstrip("/"))
    size = image_size(path) if os.path.isfile(path) else None
    if size is None:
        return None
    width, height = size

    style = dict(attrs).get("style")
    # lazy: a style holding a ";" inside a value (a url) splits wrongly; no post's image style has one
    style_names = {part.split(":")[0].strip().lower() for part in (style or "").split(";")}
    ratio = f"aspect-ratio: {width} / {height}"
    # the post's own style comes after the ratio, so an aspect-ratio it sets still wins
    attrs = [(name, f"{ratio}; {value}" if name == "style" else value) for name, value in attrs]
    if "width" not in names and "width" not in style_names:
        attrs.append(("width", str(width)))
    if style is None:
        attrs.append(("style", ratio))
    if lazy:
        attrs.append(("loading", "lazy"))
    attrs += [("data-skeleton", None), ("onload", DROP_SKELETON)]
    if "onerror" not in names:
        attrs.append(("onerror", DROP_SKELETON))

    written = " ".join(name if value is None else f'{name}="{_quote(value)}"' for name, value in attrs)
    return f"<img {written}{' />' if text.endswith('/>') else '>'}"


def _quote(value):
    return value.replace("&", "&amp;").replace('"', "&quot;")


def main(site_dir):
    pages = 0
    for root, _, files in os.walk(site_dir):
        for name in files:
            if not name.endswith(".html"):
                continue
            path = os.path.join(root, name)
            with open(path, encoding="utf-8") as f:
                page = f.read()
            if CONTENT_PREFIX not in page:
                continue
            new = add_skeletons(page, site_dir)
            if new != page:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(new)
                pages += 1
    print(f"image_sizes: skeletons added on {pages} pages")


if __name__ == "__main__":
    main(sys.argv[1])
