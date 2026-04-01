#!/usr/bin/env bash
set -euo pipefail

# Repo-local launcher for Gemma via Gemini on Vertex AI.
# Override any of these by exporting them before running the script.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="$ROOT_DIR/.gemma/vertex.env"
CLI_PATH="$ROOT_DIR/dist/cli.js"
LAUNCH_CWD="${PWD:-$(pwd)}"
if [ -f "$CONFIG_FILE" ]; then
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
fi

export CLAUDE_CODE_USE_GEMINI="${CLAUDE_CODE_USE_GEMINI:-1}"
export CLAUDE_CODE_USE_VERTEX="${CLAUDE_CODE_USE_VERTEX:-1}"
export ANTHROPIC_VERTEX_PROJECT_ID="${ANTHROPIC_VERTEX_PROJECT_ID:-flux-488702}"
export CLOUD_ML_REGION="${CLOUD_ML_REGION:-us-central1}"
export ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-gemini-2.5-pro}"
export GEMMA_LAUNCH_CWD="${GEMMA_LAUNCH_CWD:-$LAUNCH_CWD}"

if [ ! -f "$CLI_PATH" ]; then
  echo "dist/cli.js not found. Build first with: node scripts/build-cli.mjs" >&2
  exit 1
fi

echo "Launching Gemma with Gemini on Vertex AI..." >&2
echo "  Project: ${ANTHROPIC_VERTEX_PROJECT_ID}" >&2
echo "  Region:  ${CLOUD_ML_REGION}" >&2
echo "  Model:   ${ANTHROPIC_MODEL}" >&2

exec node "$CLI_PATH" "$@"
