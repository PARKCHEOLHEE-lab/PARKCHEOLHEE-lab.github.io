#!/usr/bin/env python3
"""Scaffold a new post file with frontmatter and a body wrapper.

The skill workflow uses this to produce a consistent starting file. The body
wrapper is intentionally minimal — the agent fills it in afterwards. The
`related:` field is always emitted as an empty list because populating it is
the responsibility of the `/add-related` skill.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import re
import subprocess
import sys
from pathlib import Path


VALID_CATEGORIES = ("note", "testbed")
VALID_STYLES = ("outline", "prose", "keyword", "testbed-longform")
VALID_LANGUAGES = ("en", "kr")


def repo_root() -> Path:
    out = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True)
    return Path(out.strip())


def kebab(text: str) -> str:
    """Convert a free-text topic to a kebab-case slug."""
    text = text.strip().lower()
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"[^a-z0-9\-]+", "", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text


def normalize_emoji(value: str) -> str:
    """Accept either 'brain.png' or '/emoji/brain.png' and return the path form."""
    if not value:
        return ""
    value = value.strip()
    if value.startswith("/emoji/"):
        return value
    if value.startswith("emoji/"):
        return "/" + value
    return f"/emoji/{value}"


def yaml_double_quote(value: str) -> str:
    """Wrap *value* in YAML double quotes, escaping backslashes and quotes.

    YAML double-quoted scalars treat ``\\`` and ``"`` specially, so a raw title
    like ``Bayes "Rule"`` would otherwise produce ``title: "Bayes "Rule""``,
    which is rejected by every strict YAML loader (Jekyll's included).
    """
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def frontmatter_note(title: str, emoji: str | None) -> str:
    lines = ["---", f"title: {yaml_double_quote(title)}", "layout: post"]
    if emoji:
        lines.append(f"emoji: {emoji}")
    lines.append("related: []")
    lines.append("---")
    return "\n".join(lines) + "\n"


def frontmatter_testbed(
    title: str, slug: str, emoji: str | None, at: str | None = None
) -> str:
    lines = [
        "---",
        f"title: {yaml_double_quote(title)}",
        "layout: post",
        'hashtag: ""',
        "comment: true",
        "splitter: 2",
        "featured: false",
        "inprogress: false",
        f"thumbnail: /img/{slug}/{slug}-thumbnail.png",
    ]
    if at:
        lines.append(f"at: {yaml_double_quote(at)}")
    if emoji:
        lines.append(f"emoji: {emoji}")
    lines.append("related: []")
    lines.append("---")
    return "\n".join(lines) + "\n"


def body_outline() -> str:
    return (
        "\n<br>\n\n"
        "<ul>\n"
        "    <li>\n"
        "        Section Title\n"
        "    </li>\n"
        "        <ul>\n"
        "            <li>\n"
        "                Body.\n"
        "            </li>\n"
        "        </ul>\n"
        "    <br>\n"
        "</ul>\n\n"
        "<br><br>\n"
    )


def body_prose() -> str:
    return (
        "\n<br>\n\n"
        '<div style="text-align: justify;">\n\n'
        "    Body.\n\n"
        "</div>\n\n"
        "<br><br>\n"
    )


def body_keyword() -> str:
    return (
        "\n<br>\n\n"
        '<div style="text-align: justify;">\n\n'
        "    keyword 1\n"
        "    <br>\n"
        "    keyword 2\n\n"
        "</div>\n\n"
        "<br><br>\n"
    )


def body_testbed_longform() -> str:
    return (
        "\n"
        '<div id="toc"></div>\n\n'
        "<h3>Introduction</h3>\n"
        '<div class="article">\n'
        "    Body.\n"
        "</div><br><br>\n\n"
        "<br><br>\n"
    )


BODY_BUILDERS = {
    "outline": body_outline,
    "prose": body_prose,
    "keyword": body_keyword,
    "testbed-longform": body_testbed_longform,
}


def build_post(
    *,
    category: str,
    slug: str,
    title: str,
    style: str,
    emoji: str | None,
    language: str,
    date: _dt.date,
    root: Path,
    at: str | None = None,
) -> Path:
    if category not in VALID_CATEGORIES:
        raise ValueError(f"category must be one of {VALID_CATEGORIES}, got {category!r}")
    if style not in VALID_STYLES:
        raise ValueError(f"style must be one of {VALID_STYLES}, got {style!r}")
    if language not in VALID_LANGUAGES:
        raise ValueError(f"language must be one of {VALID_LANGUAGES}, got {language!r}")
    if not slug or slug != kebab(slug):
        raise ValueError(f"slug must be kebab-case, got {slug!r}")
    if category == "note" and (style == "testbed-longform"):
        raise ValueError("style 'testbed-longform' is only valid for category 'testbed'")
    if category == "testbed" and style != "testbed-longform":
        raise ValueError(
            f"category 'testbed' requires style 'testbed-longform', got {style!r}"
        )

    posts_dir = root / category / "_posts"
    posts_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{date.isoformat()}-{slug}.html"
    target = posts_dir / filename
    if target.exists():
        raise FileExistsError(f"refuse to overwrite existing post: {target}")

    if category == "note":
        fm = frontmatter_note(title, emoji)
    else:
        fm = frontmatter_testbed(title, slug, emoji, at=at)

    body = BODY_BUILDERS[style]()

    target.write_text(fm + body, encoding="utf-8")

    img_dir = root / "img" / slug
    img_dir.mkdir(parents=True, exist_ok=True)

    return target


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--category", required=True, choices=VALID_CATEGORIES)
    parser.add_argument("--slug", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--style", required=True, choices=VALID_STYLES)
    parser.add_argument("--language", default="en", choices=VALID_LANGUAGES)
    parser.add_argument("--emoji", default="")
    parser.add_argument(
        "--at",
        default="",
        help="Testbed venue/lab/event (e.g. 'Visual Media Lab'). Omit for none — empty string would render a dangling marker because Liquid treats empty strings as truthy.",
    )
    parser.add_argument("--date", default="", help="ISO date YYYY-MM-DD; defaults to today")
    args = parser.parse_args(argv)

    root = repo_root()
    if args.date:
        try:
            date = _dt.date.fromisoformat(args.date)
        except ValueError as exc:
            print(f"invalid --date: {exc}", file=sys.stderr)
            return 2
    else:
        date = _dt.date.today()

    try:
        target = build_post(
            category=args.category,
            slug=args.slug,
            title=args.title,
            style=args.style,
            emoji=normalize_emoji(args.emoji) if args.emoji else None,
            language=args.language,
            date=date,
            root=root,
            at=args.at or None,
        )
    except (ValueError, FileExistsError) as exc:
        print(str(exc), file=sys.stderr)
        return 2

    print(target.relative_to(root))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
