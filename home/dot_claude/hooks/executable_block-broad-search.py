#!/usr/bin/env python3
"""Claude Code PreToolUse hook: block filesystem-wide searches from Bash.

Searching `/`, `~` or the macOS-protected folders (Downloads, Desktop, Music...)
triggers TCC permission prompts under the parent app and can freeze the machine.

Reads the hook JSON on stdin. Exit 2 (message on stderr) blocks the call.
Usage: block-broad-search.py [--help]   (wired in ~/.claude/settings.json)
"""
import json, os, re, shlex, sys

if "--help" in sys.argv[1:] or "-h" in sys.argv[1:]:
    print(__doc__.strip())
    sys.exit(0)

HOME = os.path.expanduser("~")
PROTECTED = ["Downloads", "Desktop", "Documents", "Music", "Movies", "Pictures", "Library"]
BROAD = {"/", "/Users", "/System/Volumes/Data", HOME}
SEARCHERS = {"find", "grep", "egrep", "fgrep", "rg", "fd", "fdfind", "du", "mdfind", "locate", "ag"}


def norm(arg):
    a = arg.replace("${HOME}", "~").replace("$HOME", "~")
    if a == "~" or a.startswith("~/"):
        a = HOME + a[1:]
    return os.path.normpath(a) if a.startswith("/") else None


def bad_path(arg):
    p = norm(arg)
    if p is None:
        return False
    if p in BROAD:
        return True
    return any(p == f"{HOME}/{d}" or p.startswith(f"{HOME}/{d}/") for d in PROTECTED)


def check(tokens):
    while tokens and (re.match(r"^\w+=", tokens[0]) or tokens[0] in ("sudo", "command", "env", "nice", "time")):
        tokens = tokens[1:]
    if not tokens:
        return None
    cmd = os.path.basename(tokens[0])
    if cmd not in SEARCHERS:
        return None
    if cmd in ("grep", "egrep", "fgrep", "ag") and not any(
        t.startswith("--recursive") or t == "-R" or re.match(r"^-[a-zA-Z]*[rR]", t) for t in tokens[1:]
    ) and cmd != "ag":
        return None
    for t in tokens[1:]:
        if bad_path(t):
            return f"`{cmd}` on {t}"
    if cmd in ("mdfind", "locate") and "-onlyin" not in tokens:
        return f"`{cmd}` without -onlyin"
    return None


def main():
    try:
        cmd = json.load(sys.stdin).get("tool_input", {}).get("command", "")
    except Exception:
        return 0
    for seg in re.split(r"&&|\|\||[;|\n]", cmd):
        try:
            tokens = shlex.split(seg)
        except ValueError:
            tokens = seg.split()
        hit = check(tokens)
        if hit:
            print(
                f"Blocked: {hit}. Searching / or ~ (or Downloads/Desktop/Music/...) triggers macOS "
                "permission prompts and can freeze the machine. Search the repo, ~/.cargo, "
                "~/.local/share/mise, or another specific directory instead.",
                file=sys.stderr,
            )
            return 2
    return 0


sys.exit(main())
