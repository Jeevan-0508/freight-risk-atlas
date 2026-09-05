#!/usr/bin/env python3
"""Sync the risk model from the upstream taxonomy repository.

The Atlas holds its own copy of the taxonomy so that the site never depends on a
cross-origin fetch at page load. This script refreshes that copy and refuses to
write anything that does not look like a usable risk model.
"""
import json
import pathlib
import sys
import urllib.request

SOURCE = ("https://raw.githubusercontent.com/Jeevan-0508/"
          "freight-fraud-taxonomy/main/docs/data.json")
ROOT = pathlib.Path(__file__).resolve().parent.parent
TARGETS = [ROOT / "data" / "taxonomy.json", ROOT / "docs" / "taxonomy.json"]

REQUIRED_PATTERN_KEYS = {
    "id", "name", "category", "severity", "prevalence", "modes", "geography",
    "summary", "indicators", "false_positives", "countermeasures",
    "regulatory_hooks", "references",
}
PHASES = {"pre_award", "in_transit", "post_event"}


def check(model):
    errors = []
    meta = model.get("meta") or {}
    if not meta.get("version"):
        errors.append("meta.version is missing")
    patterns = model.get("patterns")
    if not isinstance(patterns, list) or not patterns:
        errors.append("patterns is missing or empty")
        return errors
    for p in patterns:
        pid = p.get("id", "<no id>")
        missing = REQUIRED_PATTERN_KEYS - set(p)
        if missing:
            errors.append(f"{pid}: missing {', '.join(sorted(missing))}")
        for ind in p.get("indicators") or []:
            if ind.get("phase") not in PHASES:
                errors.append(f"{pid}: indicator phase {ind.get('phase')!r} is not one of {sorted(PHASES)}")
            if not isinstance(ind.get("weight"), int) or not 1 <= ind["weight"] <= 5:
                errors.append(f"{pid}: indicator weight {ind.get('weight')!r} is not an integer 1-5")
            if not ind.get("observable_in"):
                errors.append(f"{pid}: indicator has no observable_in")
        for key in ("preventive", "detective", "responsive"):
            if not (p.get("countermeasures") or {}).get(key):
                errors.append(f"{pid}: countermeasures.{key} is empty")
    return errors


def main():
    source = sys.argv[1] if len(sys.argv) > 1 else SOURCE
    print(f"fetching {source}")
    if source.startswith("http"):
        with urllib.request.urlopen(source, timeout=60) as r:
            raw = r.read().decode("utf-8")
    else:
        raw = pathlib.Path(source).read_text(encoding="utf-8")

    model = json.loads(raw)
    errors = check(model)
    if errors:
        print(f"REFUSED: risk model failed {len(errors)} check(s)")
        for e in errors[:20]:
            print("  -", e)
        return 1

    text = json.dumps(model, indent=2, ensure_ascii=False, sort_keys=False) + "\n"
    changed = False
    for t in TARGETS:
        old = t.read_text(encoding="utf-8") if t.exists() else None
        if old != text:
            t.write_text(text, encoding="utf-8", newline="\n")
            changed = True
        print(f"{'updated' if old != text else 'unchanged'} {t.relative_to(ROOT)}")

    m = model["meta"]
    print(f"ok: {m['taxonomy']} v{m['version']} - "
          f"{len(model['patterns'])} patterns, "
          f"{sum(len(p['indicators']) for p in model['patterns'])} indicators")
    print("CHANGED" if changed else "NO CHANGE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
