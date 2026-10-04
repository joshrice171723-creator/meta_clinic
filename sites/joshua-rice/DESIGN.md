---
name: Joshua Rice Portfolio
description: Dark, bold portfolio for early-stage healthcare software work.
colors:
  primary: "#c2f970"
  page: "#181a1c"
  text: "#f2f5ee"
  muted: "#aab6ad"
  line: "#354039"
  surface: "#1a211c"
typography:
  display:
    fontFamily: "Manrope, sans-serif"
    fontSize: "clamp(42px, 5vw, 72px)"
    fontWeight: 750
    lineHeight: 1.04
    letterSpacing: "-0.035em"
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "16px"
    lineHeight: 1.65
rounded:
  sm: "5px"
  md: "8px"
  lg: "14px"
  xl: "16px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.page}"
    rounded: "{rounded.md}"
    height: "48px"
---

# Design System: Joshua Rice Portfolio

## Overview

Portfolio-only direction: dark and bold, with healthcare work leading the story. The homepage uses a name wordmark, a personal introduction with the original Joshua portrait, and an engineering-scope panel. Meta Clinic is the first project after the introduction; WeInfuse closes the portfolio work before contact. Publication and browser evidence are recorded separately. See [README.md](README.md) for the deployment allowlist; this private design document is excluded from it. No dependency or build step was added.

## Colors

Acid green marks actions and emphasis against near-black page surfaces; muted green-gray supports secondary copy and rules.

## Typography

Manrope carries display headings; DM Sans carries body and controls. Display type is oversized and tightly tracked; body copy stays readable and restrained.

## Layout

Use a centered container up to 1320px. At 1100px, reduce columns and gaps; at 760px, stack major sections and stack the introduction and portrait, and the engineering-scope panel; at 380px, tighten navigation spacing. Preserve clear WeInfuse and Meta Clinic sections.

## Elevation & Depth

Depth comes from tonal surfaces and thin rules; the design does not rely on drop shadows.

## Shapes

Use compact rounded controls (8px), larger feature surfaces (14â€“16px), and fine dividers. Avoid pill-shaped project containers.

## Components

Primary buttons use the acid-green accent, dark text, and a 48px minimum height. Secondary buttons use transparent surfaces and a thin border. Links and in-page navigation remain semantic anchors; expandable project details use native `details` and `summary`. Keep visible keyboard focus and honor reduced-motion preferences. The shared rÃ©sumÃ© stays light and retains its print stylesheet.

## Do's and Don'ts

- **Do** keep the portfolio dark and bold, with WeInfuse/Meta Clinic work easy to find.
- **Do** preserve the separate light rÃ©sumÃ© and its print behavior.
- **Don't** apply the portfolio palette to the rÃ©sumÃ© surface or add build dependencies for this static site.
