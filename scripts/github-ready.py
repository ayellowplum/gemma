#!/usr/bin/env python3
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent

TRACKED_RISK_PATTERNS = [
    re.compile(r"(^|/)\.gemma/"),
    re.compile(r"(^|/)\.claude/"),
    re.compile(r"vertex\.env$"),
    re.compile(r"credentials", re.IGNORECASE),
    re.compile(r"\.(pem|key|p12|mobileprovision)$", re.IGNORECASE),
]

CONTENT_RISK_PATTERNS = [
    re.compile(r"sk-ant-[A-Za-z0-9_-]+"),
    re.compile(r"AIza[0-9A-Za-z_-]{35}"),
    re.compile(r"BEGIN (RSA|OPENSSH|EC|DSA|PRIVATE KEY)"),
    re.compile(r"CLAUDE_CODE_OAUTH_TOKEN\s*="),
    re.compile(r"ANTHROPIC_API_KEY\s*="),
]

SKIP_DIRS = {".git", "dist", ".cache", "node_modules"}
CONTENT_IGNORE_FILES = {
    Path("source/cli.js.map"),
    Path("source/src/bridge/jwtUtils.ts"),
    Path("source/src/components/ConsoleOAuthFlow.tsx"),
    Path("source/src/main.tsx"),
    Path("source/src/services/teamMemorySync/secretScanner.ts"),
    Path("source/src/skills/bundled/claude-api/curl/examples.md"),
    Path("source/src/utils/sessionIngressAuth.ts"),
}


def run_git(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )


def in_git_repo() -> bool:
    result = run_git(["rev-parse", "--is-inside-work-tree"])
    return result.returncode == 0 and result.stdout.strip() == "true"


def tracked_files() -> list[str]:
    result = run_git(["ls-files"])
    if result.returncode != 0:
        return []
    return [line for line in result.stdout.splitlines() if line.strip()]


def scan_tracked_file_names(files: list[str]) -> list[str]:
    hits: list[str] = []
    for rel_path in files:
        if any(pattern.search(rel_path) for pattern in TRACKED_RISK_PATTERNS):
            hits.append(rel_path)
    return hits


def scan_worktree_contents() -> list[str]:
    hits: list[str] = []
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        rel_path = path.relative_to(ROOT)
        if rel_path in CONTENT_IGNORE_FILES:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for pattern in CONTENT_RISK_PATTERNS:
            if pattern.search(text):
                hits.append(str(rel_path))
                break
    return sorted(set(hits))


def main() -> int:
    print("Gemma GitHub readiness audit")
    print()

    if not in_git_repo():
        print("Warning: this directory is not currently a git repository.")
        print("I can still scan file contents, but not tracked files.")
        print()
    else:
        files = tracked_files()
        tracked_hits = scan_tracked_file_names(files)
        if tracked_hits:
            print("Tracked file warnings:")
            for hit in tracked_hits:
                print(f"  - {hit}")
            print()
        else:
            print("No obviously risky tracked file paths found.")
            print()

    content_hits = scan_worktree_contents()
    if content_hits:
        print("Content warnings:")
        for hit in content_hits:
            print(f"  - {hit}")
        print()
        print("Review those files before publishing.")
        return 1

    print("No obvious secret-like content found in the scanned worktree.")
    print("This does not replace a manual review, but it is a good final check.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
