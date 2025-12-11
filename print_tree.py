#!/usr/bin/env python3
# Python 3.9+
# Usage: python3 scripts/print_tree.py [root]
# Prints JSON array to stdout.

import os
import sys
import json
import fnmatch
from pathlib import Path
from datetime import datetime, timezone

ROOT_ARG = sys.argv[1] if len(sys.argv) > 1 else "."
ROOT = Path(ROOT_ARG).resolve()

# Загружаем .gitignore и добавляем node_modules в исключения
def load_gitignore(root: Path):
    gitignore = root / ".gitignore"
    patterns = []
    if gitignore.exists():
        for raw in gitignore.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            neg = line.startswith("!")
            pat = line[1:] if neg else line
            patterns.append((pat, neg))
    # Добавляем node_modules независимо от .gitignore
    patterns.append(("node_modules/", False))
    return patterns

def matches_pattern(rel: str, pattern: str):
    rel = rel.replace(os.sep, "/")
    pat = pattern.replace("\\", "/")
    dir_only = pat.endswith("/")
    if dir_only:
        pat = pat.rstrip("/")
    anchored = pat.startswith("/")
    if anchored:
        pat = pat.lstrip("/")

    if "/" not in pat:
        for part in rel.split("/"):
            if fnmatch.fnmatchcase(part, pat):
                return True
        return False

    if fnmatch.fnmatchcase(rel, pat):
        return True
    parts = rel.split("/")
    for i in range(len(parts)):
        sub = "/".join(parts[i:])
        if fnmatch.fnmatchcase(sub, pat):
            return True
    return False

def is_ignored(rel: str, is_dir: bool, patterns):
    ignored = False
    for pat, neg in patterns:
        if matches_pattern(rel, pat):
            if pat.endswith("/") and not is_dir:
                continue
            ignored = not neg
            if neg:
                continue
    return ignored

def walk(root: Path, patterns):
    out = []
    def rec(cur: Path):
        try:
            entries = sorted(list(cur.iterdir()), key=lambda p: p.name)
        except PermissionError:
            return
        for e in entries:
            rel = Path(e).relative_to(root).as_posix()
            try:
                is_dir = e.is_dir()
            except Exception:
                continue
            if is_ignored(rel, is_dir, patterns):
                continue
            try:
                st = e.stat()
            except Exception:
                continue
            out.append({
                "path": rel,
                "type": "dir" if is_dir else "file",
            })
            if is_dir:
                rec(e)
    rec(root)
    return out

def main():
    patterns = load_gitignore(ROOT)
    items = walk(ROOT, patterns)
    items.sort(key=lambda x: x["path"])
    json.dump(items, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")

if __name__ == "__main__":
    main()
