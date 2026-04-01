# Contributing

Thanks for contributing to Gemma.

## Development Setup

Initialize the project:

```bash
python3 scripts/init-gemma.py
```

Or manually:

```bash
node scripts/build-cli.mjs --no-minify
npm link
```

## Common Commands

Build:

```bash
node scripts/build-cli.mjs --no-minify
```

Run:

```bash
gemma
```

Run with Vertex launcher:

```bash
bash scripts/run-gemma-vertex.sh
```

Audit before publishing:

```bash
npm run audit:publish
```

## Contribution Guidelines

- Keep user-facing branding consistent with `Gemma`
- Avoid committing local credentials or repo-local secrets
- Prefer small, reviewable changes
- Preserve compatibility where internal `claude` naming is still required for storage or runtime behavior
- Document new commands, launchers, or initialization flows in the README

## Private and Local Files

Do not commit:

- `.gemma/vertex.env`
- `.claude/settings.local.json`
- local credentials or tokens
- generated build output unless you explicitly intend to version it

## Licensing

This repository is intended to be distributed under the MIT license. Keep package metadata and repository settings consistent with that when publishing.
