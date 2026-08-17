---
name: preserve-typography
description: Preserve existing typography in the landing project. Use for any frontend, site, UI, React, Next.js, Tailwind, CSS, animation, layout, visual polish, or bug-fix task unless the user explicitly asks to change typography, fonts, type scale, line height, letter spacing, text sizing, or baseline alignment.
---

# Preserve Typography

## Hard Rule

Do not change typography unless the user explicitly asks for a typography change in the current turn.

Treat these as protected typography surfaces:

- Font imports and `next/font` configuration.
- `font-family` declarations, font CSS variables, and body/default font settings.
- Tailwind font classes such as `font-display-serif`, `font-display-sans`, `font-serif`, `font-sans`, and `font-mono`.
- Text size, line height, letter spacing, tracking, font weight, text transform, font synthesis, and heading/body type scale.
- Global typography files or declarations, especially `app/layout.tsx` and font-related blocks in `app/globals.css`.

## Workflow

Before editing frontend code, scan planned changes for typography impact.

If typography changes are not explicitly requested:

- Keep existing font classes and text metrics exactly as they are.
- Do not "clean up", reorder, normalize, or refactor typography classes.
- Do not adjust fonts while fixing layout, animation, spacing, canvas, scroll, color, or background issues.
- If a fix seems to require typography changes, ask first and explain the specific protected property.

If typography changes are explicitly requested:

- Change only the named element or effect.
- Prefer local, target-specific adjustments over global typography changes.
- Do not alter global font imports, font variables, or body defaults unless the user specifically names those files/settings.
- Report the exact typography property changed in the final answer.

## Verification

Before finalizing frontend work, inspect the diff for accidental typography edits. Revert any typography changes that were not explicitly requested.
