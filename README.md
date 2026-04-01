# Gemma Source Build

![](<img/2026-03-31 14-58-01-combined.gif>)

A Gemini-first terminal coding CLI for Google Cloud Vertex AI, rebuilt and customized from the Claude Code sourcebase.

## Support

If this project helped you and you want to support continued work on Gemma, you can donate here:

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-support-FFDD00?logo=buymeacoffee&logoColor=000000&labelColor=FFDD00&color=000000)](https://buymeacoffee.com/ayellowplum)

Direct link:

- https://buymeacoffee.com/ayellowplum

This repo includes:

- a `gemma` terminal entrypoint
- a Gemini-on-Vertex launcher
- Gemma-themed branding and UI changes
- source-preserving build tooling for generating `dist/cli.js`

## How This Build Was Made

This project is a custom source-build-style rework inspired by the Claude Code source architecture.

At a high level, this repo:

- reconstructs and preserves source-oriented structure for the CLI build process
- builds a runnable `dist/cli.js` from the recovered source tree
- adds Gemma branding, launchers, command changes, and Gemini/Vertex-focused customization

This is why the repository still contains some internal compatibility paths and legacy `claude` naming in storage or runtime plumbing: those pieces help preserve behavior while the public-facing product is reworked as Gemma.

## License

The repository metadata is set to MIT.

If you are publishing through GitHub, keep the GitHub license selection, package metadata, and repository docs aligned so users see a consistent license story.

## Recommended Repo Name

If you are publishing this project, a cleaner folder or GitHub repo name would be:

- `gemma-source-build`
- `gemma-cli-custom`
- `gemma-terminal`

I could not rename the outer filesystem folder from inside this sandbox, so if you want the local directory itself renamed, do that from your shell before pushing:

```bash
cd ~/Downloads
mv claude-code-source-build-master gemma-source-build
cd gemma-source-build
```

## Requirements

- Node.js 20+
- Bun 1.1+
- npm

## Build

```bash
# Production build
node scripts/build-cli.mjs

# Easier-to-debug build
node scripts/build-cli.mjs --no-minify
```

Build output:

- `dist/cli.js`
- `dist/cli.bundle/`

## Initialize Gemma

For a one-command local setup, use the initializer:

```bash
python3 scripts/init-gemma.py
```

Or through npm:

```bash
npm run init:gemma
```

This will:

- make `bin/gemma` executable
- create `.gemma/vertex.env` if missing
- build Gemma
- run `npm link`

Useful options:

```bash
python3 scripts/init-gemma.py --prod
python3 scripts/init-gemma.py --no-link
python3 scripts/init-gemma.py --skip-build
python3 scripts/init-gemma.py --force-vertex-env
```

## Run

Run the built CLI directly:

```bash
node dist/cli.js
```

Or install the local `gemma` command:

```bash
node scripts/build-cli.mjs --no-minify
chmod +x bin/gemma
npm link
gemma
```

Gemma now defaults to the directory you launched it from, so if you start it inside another project, that project becomes the active workspace automatically.

## Vertex Launcher

This repo includes a launcher for Gemini on Vertex AI:

```bash
bash scripts/run-gemma-vertex.sh
```

Fast launch without the splash screen:

```bash
NO_LAUNCH_SCREEN=1 bash scripts/run-gemma-vertex.sh
```

Repo-local Vertex settings can be stored in:

```text
.gemma/vertex.env
```

Example:

```bash
ANTHROPIC_VERTEX_PROJECT_ID=your-project-id
CLOUD_ML_REGION=us-central1
ANTHROPIC_MODEL=gemini-2.5-pro
```

## Project Layout

```text
bin/                    gemma terminal wrapper
scripts/                build and launcher scripts
source/src/             main source tree
source/native-addons/   prebuilt native modules
dist/                   generated build output
img/                    screenshots / gifs
.cache/                 generated workspace cache
```

## Publishing Notes

Before pushing to GitHub, make sure private local files are not committed.

This repo now ignores:

- `.gemma/vertex.env`
- `.claude/settings.local.json`
- `.claude/agent-memory-local/`

Your main account credentials are typically not stored in the repo itself. They are generally stored outside the repo in user config or secure storage.

Useful checks before publishing:

```bash
npm run audit:publish
git status
git status --ignored
```

If you are already inside a real git clone, the audit script checks:

- risky tracked file names
- obvious secret-like content
- common local config leaks before pushing

## Notes

- Some internal paths and compatibility layers still use `claude` naming for storage and legacy behavior.
- This is expected in the current state of the rebrand and helps avoid breaking auth, settings, and session handling.
