#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import shutil
import stat
import subprocess
import sys
from pathlib import Path


DEFAULT_VERTEX_PROJECT = "flux-488702"
DEFAULT_VERTEX_REGION = "us-central1"
DEFAULT_VERTEX_MODEL = "gemini-2.5-pro"


def run(cmd: list[str], cwd: Path) -> None:
    print("$", " ".join(cmd))
    subprocess.run(cmd, cwd=str(cwd), check=True)


def ensure_executable(path: Path) -> None:
    current_mode = path.stat().st_mode
    desired_mode = current_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
    if current_mode == desired_mode:
        return
    try:
        path.chmod(desired_mode)
    except PermissionError:
        # Some environments expose writable filesystems with chmod restrictions.
        # If the file is already executable by the current user, continue.
        if os.access(path, os.X_OK):
            return
        raise


def require_tool(name: str) -> None:
    if shutil.which(name):
        return
    print(f"Missing required tool: {name}", file=sys.stderr)
    sys.exit(1)


def write_vertex_env(path: Path, force: bool) -> None:
    if path.exists() and not force:
        return

    path.parent.mkdir(parents=True, exist_ok=True)

    project_id = os.environ.get("ANTHROPIC_VERTEX_PROJECT_ID", DEFAULT_VERTEX_PROJECT)
    region = os.environ.get("CLOUD_ML_REGION", DEFAULT_VERTEX_REGION)
    model = os.environ.get("ANTHROPIC_MODEL", DEFAULT_VERTEX_MODEL)

    content = f"""# Repo-local Gemma Vertex settings
# Edit these values if you want to target a different Vertex project or model.

CLAUDE_CODE_USE_GEMINI=1
CLAUDE_CODE_USE_VERTEX=1
ANTHROPIC_VERTEX_PROJECT_ID={project_id}
CLOUD_ML_REGION={region}
ANTHROPIC_MODEL={model}
"""
    path.write_text(content, encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build and initialize Gemma for local terminal use.",
    )
    parser.add_argument(
        "--prod",
        action="store_true",
        help="Build the production bundle instead of the debug-friendly --no-minify build.",
    )
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="Skip running the build step.",
    )
    parser.add_argument(
        "--no-link",
        action="store_true",
        help="Do not run npm link.",
    )
    parser.add_argument(
        "--force-vertex-env",
        action="store_true",
        help="Overwrite .gemma/vertex.env even if it already exists.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo_root = Path(__file__).resolve().parent.parent
    bin_path = repo_root / "bin" / "gemma"
    vertex_env_path = repo_root / ".gemma" / "vertex.env"

    require_tool("node")
    require_tool("npm")

    ensure_executable(bin_path)
    write_vertex_env(vertex_env_path, force=args.force_vertex_env)

    if not args.skip_build:
        build_cmd = ["node", "scripts/build-cli.mjs"]
        if not args.prod:
            build_cmd.append("--no-minify")
        run(build_cmd, repo_root)

    if not args.no_link:
        run(["npm", "link"], repo_root)

    print()
    print("Gemma is initialized.")
    print()
    print("Next commands:")
    print("  gemma")
    print("  NO_LAUNCH_SCREEN=1 gemma")
    print("  bash scripts/run-gemma-vertex.sh")
    print()
    print(f"Vertex config: {vertex_env_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
