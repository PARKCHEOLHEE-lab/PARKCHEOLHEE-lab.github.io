"""List all eligible posts with their slug and title.

Excludes: underscore-prefixed files, __template.html, threebed
Output format: filepath|slug|title (one per line)
"""

import glob
import os
import re
import subprocess
from pathlib import Path


def find_repo_root():
    """Return the git repo root even when this script is reached via symlink."""
    try:
        root = subprocess.check_output(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=os.path.dirname(__file__),
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
        if root:
            return root
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass

    for parent in Path(__file__).resolve().parents:
        if (parent / "_config.yml").exists() and (parent / ".git").exists():
            return str(parent)

    return os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))


REPO_ROOT = find_repo_root()


def extract_title(filepath):
    """Extract title from YAML frontmatter."""
    with open(filepath, encoding="utf-8") as f:
        content = f.read()
    match = re.search(r"^---\s*\n(.*?)\n---", content, re.DOTALL)
    if not match:
        return ""
    for line in match.group(1).split("\n"):
        if line.startswith("title:"):
            title = line.split(":", 1)[1].strip().strip('"').strip("'")
            return title
    return ""


def has_body(filepath):
    """Check if post has non-empty body after frontmatter."""
    with open(filepath, encoding="utf-8") as f:
        content = f.read()
    match = re.match(r"^---\s*\n.*?\n---\s*\n(.*)", content, re.DOTALL)
    if not match:
        return False
    return bool(match.group(1).strip())


def list_posts():
    """Yield (filepath, slug, title) for each eligible post."""
    for subdir in ("note/_posts", "testbed/_posts"):
        post_dir = os.path.join(REPO_ROOT, subdir)
        if not os.path.isdir(post_dir):
            continue
        for filepath in sorted(glob.glob(os.path.join(post_dir, "*.html"))):
            basename = os.path.basename(filepath)

            # Skip underscore-prefixed files
            if basename.startswith("_"):
                continue

            # Skip empty posts
            if not has_body(filepath):
                continue

            # Extract slug: remove date prefix and .html extension
            slug = re.sub(r"^\d{4}-\d{2}-\d{2}-", "", basename)
            slug = slug.removesuffix(".html")

            title = extract_title(filepath)
            yield filepath, slug, title


def main():
    for filepath, slug, title in list_posts():
        print(f"{filepath}|{slug}|{title}")


if __name__ == "__main__":
    main()
