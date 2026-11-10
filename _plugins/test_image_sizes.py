"""Tests for image_sizes.py: reading an image's size from its header, and adding lazy loading and the
skeleton box to a page's content images without touching anything else on the page.

Run: python3 -m pytest _plugins/test_image_sizes.py
"""

import struct

import pytest

import image_sizes


def png(width, height):
    return b"\x89PNG\r\n\x1a\n" + struct.pack(">I4sII", 13, b"IHDR", width, height) + b"\x08\x06\x00\x00\x00"


def gif(width, height):
    return b"GIF89a" + struct.pack("<HH", width, height) + b"\x00" * 6


def jpeg(width, height):
    # SOI, an APP0 segment to skip, then the SOF0 frame header that holds the size
    app0 = b"\xff\xe0" + struct.pack(">H", 16) + b"JFIF\x00" + b"\x00" * 9
    sof0 = b"\xff\xc0" + struct.pack(">HBHH", 11, 8, height, width) + b"\x01\x01\x11\x00"
    return b"\xff\xd8" + app0 + sof0 + b"\xff\xd9"


def webp_vp8x(width, height):
    body = b"VP8X" + struct.pack("<I", 10) + b"\x00" * 4 + (width - 1).to_bytes(3, "little") + (height - 1).to_bytes(3, "little")
    return b"RIFF" + struct.pack("<I", len(body) + 4) + b"WEBP" + body


def webp_vp8l(width, height):
    bits = (width - 1) | ((height - 1) << 14)
    body = b"VP8L" + struct.pack("<I", 5) + b"\x2f" + bits.to_bytes(4, "little")
    return b"RIFF" + struct.pack("<I", len(body) + 4) + b"WEBP" + body


def webp_vp8(width, height):
    frame = b"\x00\x00\x00" + b"\x9d\x01\x2a" + struct.pack("<HH", width, height)
    body = b"VP8 " + struct.pack("<I", len(frame)) + frame
    return b"RIFF" + struct.pack("<I", len(body) + 4) + b"WEBP" + body


@pytest.fixture
def site(tmp_path):
    (tmp_path / "img").mkdir()
    (tmp_path / "img" / "a.png").write_bytes(png(800, 600))
    return tmp_path


class TestImageSize:
    @pytest.mark.parametrize("name, data", [
        ("a.png", png(800, 600)),
        ("a.gif", gif(800, 600)),
        ("a.jpg", jpeg(800, 600)),
        ("x.webp", webp_vp8x(800, 600)),
        ("l.webp", webp_vp8l(800, 600)),
        ("v.webp", webp_vp8(800, 600)),
    ])
    def test_reads_the_size_from_the_header(self, tmp_path, name, data):
        (tmp_path / name).write_bytes(data)
        assert image_sizes.image_size(tmp_path / name) == (800, 600)

    def test_a_git_lfs_pointer_has_no_size(self, tmp_path):
        (tmp_path / "a.png").write_text("version https://git-lfs.github.com/spec/v1\noid sha256:00\nsize 1\n")
        assert image_sizes.image_size(tmp_path / "a.png") is None

    def test_an_svg_has_no_size(self, tmp_path):
        (tmp_path / "a.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')
        assert image_sizes.image_size(tmp_path / "a.svg") is None


class TestAddSkeletons:
    def test_an_image_with_no_width_gets_its_own_width_and_box(self, site):
        page = '<p>a</p><img src="/img/a.png" alt="A"><p>b</p>'
        assert image_sizes.add_skeletons(page, site) == (
            '<p>a</p><img src="/img/a.png" alt="A" width="800" style="aspect-ratio: 800 / 600"'
            ' loading="lazy" data-skeleton onload="this.removeAttribute(\'data-skeleton\')"'
            ' onerror="this.removeAttribute(\'data-skeleton\')"><p>b</p>'
        )

    def test_a_width_the_post_set_is_kept_and_only_the_ratio_added(self, site):
        out = image_sizes.add_skeletons('<img src="/img/a.png" width="45%">', site)
        assert 'width="45%"' in out and 'width="800"' not in out
        assert 'style="aspect-ratio: 800 / 600"' in out

    def test_a_style_width_is_kept_and_the_post_style_wins(self, site):
        out = image_sizes.add_skeletons('<img src="/img/a.png" style="width: 60%;">', site)
        assert 'style="aspect-ratio: 800 / 600; width: 60%;"' in out
        assert 'width="800"' not in out

    def test_a_max_width_is_not_a_width(self, site):
        out = image_sizes.add_skeletons('<img src="/img/a.png" style="max-width: 50%">', site)
        assert 'width="800"' in out

    def test_the_post_error_fallback_is_kept(self, site):
        out = image_sizes.add_skeletons('<img src="/img/a.png" onerror=handle_image_error(this)>', site)
        assert 'onerror="handle_image_error(this)"' in out
        assert out.count("onerror=") == 1

    def test_a_self_closing_tag_stays_self_closing(self, site):
        assert image_sizes.add_skeletons('<img src="/img/a.png" />', site).endswith(" />")

    @pytest.mark.parametrize("page", [
        '<img src="/emoji/brain.png">',
        '<img src="/img/missing.png">',
        '<img src="/img/a.png" loading="eager">',
        '<script>const t = "<img src=\'/img/a.png\'>";</script>',
        '<!-- <img src="/img/a.png"> -->',
    ])
    def test_leaves_other_tags_and_text_alone(self, site, page):
        assert image_sizes.add_skeletons(page, site) == page

    def test_running_twice_changes_nothing_more(self, site):
        once = image_sizes.add_skeletons('<img src="/img/a.png">', site)
        assert image_sizes.add_skeletons(once, site) == once

    def test_the_rest_of_the_page_is_untouched(self, site):
        page = '<!DOCTYPE html>\n<p class="x">\\(a &lt; b\\)</p>\n  <img src="/img/a.png">\n<pre>&amp;</pre>\n'
        out = image_sizes.add_skeletons(page, site)
        head, tail = page.split('<img src="/img/a.png">')
        assert out.startswith(head) and out.endswith(tail)

    def test_an_escaped_address_finds_its_file(self, site):
        (site / "img" / "a b.png").write_bytes(png(10, 20))
        out = image_sizes.add_skeletons('<img src="/img/a%20b.png">', site)
        assert 'style="aspect-ratio: 10 / 20"' in out
