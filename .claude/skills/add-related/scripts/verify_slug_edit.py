"""PostToolUse hook: verify that an Edit to a blog post's related field uses valid slugs.

Reads the edited file path from CLAUDE_TOOL_INPUT and checks all slugs
against /tmp/post_list.txt. Prints ALLOW or BLOCK.
"""

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from config import MAX_RELATED


def main():
    tool_input = os.environ.get("CLAUDE_TOOL_INPUT", "{}")
    try:
        data = json.loads(tool_input)
    except json.JSONDecodeError:
        print("ALLOW")
        return

    filepath = data.get("file_path", "")
    if "/_posts/" not in filepath:
        print("ALLOW")
        return

    # Load canonical slugs
    post_list_path = "/tmp/post_list.txt"
    if not os.path.exists(post_list_path):
        print("ALLOW")
        return

    valid_slugs = set()
    with open(post_list_path) as f:
        for line in f:
            parts = line.strip().split("|")
            if len(parts) >= 2:
                valid_slugs.add(parts[1])

    # Read edited file frontmatter
    if not os.path.exists(filepath):
        print("ALLOW")
        return

    with open(filepath, encoding="utf-8") as f:
        content = f.read()

    match = re.search(r"^---\s*\n(.*?)\n---", content, re.DOTALL)
    if not match:
        print("ALLOW")
        return

    frontmatter = match.group(1)
    related_items = re.findall(r"^  - (.+)", frontmatter, re.MULTILINE)

    if len(related_items) > MAX_RELATED:
        print(f"BLOCK: related field has {len(related_items)} items (max {MAX_RELATED})")
        sys.exit(0)

    # Derive self-slug from filename
    basename = os.path.basename(filepath)
    self_slug_match = re.match(r"\d{4}-\d{2}-\d{2}-(.+)\.html", basename)
    self_slug = self_slug_match.group(1) if self_slug_match else ""

    invalid = []
    for slug in related_items:
        slug = slug.strip()
        if slug not in valid_slugs:
            invalid.append(slug)
        if slug == self_slug:
            invalid.append(f"{slug} (self-reference)")

    if invalid:
        print(f"BLOCK: invalid slugs: {', '.join(invalid)}")
        sys.exit(0)

    print("ALLOW")


if __name__ == "__main__":
    main()
