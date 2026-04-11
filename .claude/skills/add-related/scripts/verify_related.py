"""Verify all eligible posts have valid related frontmatter.

Exit 0 if all valid, exit 1 with details if any missing/invalid.
"""

import re
import sys

from config import MAX_RELATED
from list_posts import list_posts


def check_related(filepath):
    """Check related frontmatter in a post file.

    Returns:
        (status, count) where status is "valid", "missing", or "invalid"
    """
    with open(filepath, encoding="utf-8") as f:
        content = f.read()

    match = re.search(r"^---\s*\n(.*?)\n---", content, re.DOTALL)
    if not match:
        return "missing", 0

    frontmatter = match.group(1)

    # Check if related: exists
    if not re.search(r"^related:", frontmatter, re.MULTILINE):
        return "missing", 0

    # Count related items (lines like "  - slug")
    related_items = re.findall(r"^  - .+", frontmatter, re.MULTILINE)
    count = len(related_items)

    if count > MAX_RELATED:
        return "invalid", count

    return "valid", count


def main():
    total = 0
    missing = 0
    invalid = 0
    issues = []

    for filepath, slug, _title in list_posts():
        total += 1
        status, count = check_related(filepath)

        if status == "missing":
            missing += 1
            issues.append(f"  MISSING: {slug} ({filepath})")
        elif status == "invalid":
            invalid += 1
            issues.append(
                f"  INVALID ({count} items, max {MAX_RELATED}): {slug} ({filepath})"
            )

    print("=== Related Frontmatter Verification ===")
    print(f"Total posts: {total}")
    print(f"Valid: {total - missing - invalid}")
    print(f"Missing related: {missing}")
    print(f"Invalid count: {invalid}")

    if missing > 0 or invalid > 0:
        print(f"\nIssues:")
        for issue in issues:
            print(issue)
        sys.exit(1)

    print("All posts have valid related frontmatter.")
    sys.exit(0)


if __name__ == "__main__":
    main()
