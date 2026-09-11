#!/usr/bin/env python3
"""Recount README figures from docs/taxonomy.json and report drift.

docs/taxonomy.json is a copy of the Freight & Carrier Fraud Risk Taxonomy
model (same schema, kept in sync by hand on release) - this checks the copy
this repo actually ships against the numbers its own README quotes for it.

Never rewrites the README - a hand-written sentence can say things a plain
number can't, so this only checks and reports; a human decides the edit.
"""
import io, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
README = os.path.join(ROOT, "README.md")
findings = []


def check(label, computed, pattern):
    text = open(README, encoding="utf-8").read()
    m = re.search(pattern, text)
    if not m:
        findings.append((label, "not found in README", str(computed)))
        return
    claimed = int(m.group(1).replace(",", ""))
    if claimed != computed:
        findings.append((label, str(claimed), str(computed)))


def report():
    lines = []
    if not findings:
        lines.append("No drift. Every figure in the README matches the data.")
    else:
        lines.append("**%d figure(s) drifted from the data:**" % len(findings))
        lines.append("")
        lines.append("| Figure | README says | Data says |")
        lines.append("|---|---|---|")
        for label, claimed, computed in findings:
            lines.append("| %s | %s | %s |" % (label, claimed, computed))
        lines += ["", "Nothing has been changed. Each row is a decision for you."]
    text = "\n".join(lines) + "\n"
    io.open("findings.md", "w", encoding="utf-8", newline="\n").write(text)
    print(text)


def main():
    d = json.load(open(os.path.join(ROOT, "docs", "taxonomy.json"), encoding="utf-8"))
    patterns = d["patterns"]
    indicators = sum(len(p.get("indicators") or []) for p in patterns)
    countermeasures = sum(len(v) for p in patterns for v in (p.get("countermeasures") or {}).values())

    check("pattern count", len(patterns), r"\((\d+) patterns,")
    check("indicator count", indicators, r"(\d+) indicators,")
    check("countermeasure count", countermeasures, r"(\d+) countermeasures,")
    report()


if __name__ == "__main__":
    main()
