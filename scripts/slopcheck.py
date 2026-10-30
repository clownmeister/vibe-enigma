#!/usr/bin/env python3
"""Flag AI-writing artefacts in markdown. Fenced code and inline code are skipped.

Usage:
    slopcheck.py FILE...          report findings, exit 1 if any ERROR
    slopcheck.py --fix FILE...    rewrite the mechanical ones in place, then report

ERROR  = mechanical, always wrong here (typographic dashes, curly quotes, emoji,
         exclamation hype, "as an AI"). --fix rewrites these.
WARN   = judgement needed. Filler and marketing adjectives. Never auto-fixed:
         deleting the word is usually right, but sometimes the sentence needs a
         rewrite instead.
"""

from __future__ import annotations

import re
import sys

# (pattern, message) — applied to prose only.
ERRORS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"—"), "em dash: use ' - ', a comma, or two sentences"),
    (re.compile(r"(?<=\w)–(?=\w)"), "en dash between words: use a hyphen"),
    (re.compile(r"[“”]"), "curly double quote: use \""),
    (re.compile(r"[‘’](?=\w)|(?<=\w)[‘’]"), "curly apostrophe/quote: use '"),
    (re.compile(r"…"), "ellipsis character: use ..."),
    # Arrows (U+2190-U+21FF) are deliberately allowed: "property -> unit" reads well.
    (
        re.compile(r"[\U0001F300-\U0001FAFF☀-➿️]"),
        "emoji/dingbat: no decoration in docs",
    ),
    (re.compile(r"!(?:\s|$)"), "exclamation mark: docs state facts, they don't cheer"),
    (re.compile(r"\bas an AI\b", re.I), "assistant self-reference leaked into a doc"),
]

WARNINGS: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(
            r"\b(comprehensive|robust|seamless|powerful|cutting[- ]edge|state[- ]of[- ]the[- ]art"
            r"|game[- ]chang\w+|holistic|elevate|unlock|revolutioniz\w+|effortless\w*)\b",
            re.I,
        ),
        "marketing adjective: say the concrete property instead",
    ),
    (
        re.compile(r"\b(leverage|utilize|delve into|plethora|myriad|facilitate)\b", re.I),
        "inflated verb/noun: use, dig into, many",
    ),
    (
        re.compile(r"\b(simply|just|basically|essentially|actually|really|very)\b", re.I),
        "filler: cut it",
    ),
    (
        re.compile(r"\bin order to\b", re.I),
        "'in order to' -> 'to'",
    ),
    (
        re.compile(
            r"\b(it'?s (worth|important) (noting|to note)|it should be noted"
            r"|in today'?s\b|in conclusion|let'?s dive|at its core|feel free to"
            r"|that said,)\b",
            re.I,
        ),
        "essay filler: delete the clause, keep the fact",
    ),
    (
        re.compile(r"\b(is|are|was|were)n'?t just\b.{0,60}?\bit'?s\b", re.I),
        "'not just X, it's Y' construction: state what it is",
    ),
    (
        re.compile(r"\b(no manual steps|ready to build|happy coding|you'?re all set)\b", re.I),
        "cheerleading: cut",
    ),
]

FIXES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\s*—\s*"), " - "),
    (re.compile(r"(?<=\w)–(?=\w)"), "-"),
    (re.compile(r"[“”]"), '"'),
    (re.compile(r"(?<=\w)[‘’](?=\w)"), "'"),
    (re.compile(r"[‘’]"), "'"),
    (re.compile(r"…"), "..."),
]

INLINE_CODE = re.compile(r"`[^`]*`")
LINK_TARGET = re.compile(r"\]\([^)]*\)")
# Quoted material is evidence, not our prose. Flagging filler inside a verbatim
# user quote asks the writer to falsify the quote to satisfy a style rule.
QUOTED = re.compile(r'"[^"]{0,400}"')


def prose_lines(text: str):
    """Yield (lineno, prose) with fenced blocks, inline code and link targets blanked."""
    fenced = False
    for i, raw in enumerate(text.split("\n"), start=1):
        if raw.lstrip().startswith("```"):
            fenced = not fenced
            continue
        if fenced or raw.startswith("    ") or raw.startswith("\t"):
            continue
        if raw.lstrip().startswith(">"):
            continue  # blockquote: someone else's words
        line = INLINE_CODE.sub(lambda m: " " * len(m.group()), raw)
        line = LINK_TARGET.sub(lambda m: " " * len(m.group()), line)
        line = QUOTED.sub(lambda m: " " * len(m.group()), line)
        yield i, line


def scan(path: str) -> tuple[list[str], list[str]]:
    try:
        text = open(path, encoding="utf-8").read()
    except (OSError, UnicodeDecodeError) as exc:
        return ([f"{path}: unreadable ({exc})"], [])

    errors: list[str] = []
    warnings: list[str] = []
    for lineno, line in prose_lines(text):
        for pattern, msg in ERRORS:
            if pattern.search(line):
                errors.append(f"{path}:{lineno}  {msg}")
        for pattern, msg in WARNINGS:
            match = pattern.search(line)
            if match:
                warnings.append(f"{path}:{lineno}  {msg} ({match.group().strip()!r})")
    return errors, warnings


def fix(path: str) -> bool:
    text = open(path, encoding="utf-8").read()
    out, fenced = [], False
    for raw in text.split("\n"):
        if raw.lstrip().startswith("```"):
            fenced = not fenced
            out.append(raw)
            continue
        if fenced or raw.startswith("    ") or raw.startswith("\t"):
            out.append(raw)
            continue
        # protect inline code spans
        spans: list[str] = []

        def stash(m: re.Match[str]) -> str:
            spans.append(m.group())
            return f"\x00{len(spans) - 1}\x00"

        line = INLINE_CODE.sub(stash, raw)
        for pattern, repl in FIXES:
            line = pattern.sub(repl, line)
        line = re.sub(r"\x00(\d+)\x00", lambda m: spans[int(m.group(1))], line)
        out.append(line.rstrip() if line.strip() else line)
    new = "\n".join(out)
    if new != text:
        open(path, "w", encoding="utf-8").write(new)
        return True
    return False


def main(argv: list[str]) -> int:
    args = [a for a in argv[1:] if not a.startswith("--")]
    do_fix = "--fix" in argv
    if not args:
        print("usage: slopcheck.py [--fix] FILE...", file=sys.stderr)
        return 2

    fixed = [p for p in args if do_fix and fix(p)]
    all_errors: list[str] = []
    all_warnings: list[str] = []
    for path in args:
        errors, warnings = scan(path)
        all_errors += errors
        all_warnings += warnings

    if fixed:
        print(f"rewrote {len(fixed)} file(s): " + ", ".join(fixed))
    for line in all_errors:
        print(f"ERROR  {line}")
    for line in all_warnings:
        print(f"warn   {line}")
    if not all_errors and not all_warnings:
        print(f"clean: {len(args)} file(s)")
    return 1 if all_errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
