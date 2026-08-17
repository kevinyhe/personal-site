---
name: compile-only-verification
description: Use when the user asks Codex to avoid viewport, browser, screenshot, Playwright, canvas-pixel, or visual QA verification and verify code changes only with compiler-oriented checks such as typecheck, lint, and build. Also use when the user says "only lint and build", "no viewport verification", "compile-only verification", or asks to stop starting dev servers for visual checks.
---

# Compile-Only Verification

## Rule

Verify code changes with compiler-oriented commands only. Do not start a browser, launch Playwright, take screenshots, inspect canvas pixels, use viewport checks, or start a dev server solely for visual verification.

## Workflow

- Prefer the repo's existing static validation scripts, usually in this order: typecheck, lint, build.
- Use the exact scripts from the project manifest when present, for example `npm run typecheck`, `npm run lint`, and `npm run build`.
- If a project lacks one of those scripts, use the closest non-viewport equivalent already established by the repo.
- Treat successful typecheck/lint/build as the verification result for the task.
- Report any skipped compiler-oriented check and why it was unavailable.

## Boundaries

- Do not use browser automation, screenshots, dev-server visual inspection, responsive viewport testing, or canvas-pixel checks unless the latest user message explicitly asks for that kind of visual verification.
- Do not compensate for skipped viewport testing with lengthy caveats. State that verification followed compile-only mode.
- If a task normally calls for visual QA, still obey compile-only mode when this skill is active.
