# Auditor Inteligente — frontend design workflow

This repository is a working LegalTech contract-review application, not a marketing landing page.

## Design skills

Use both installed skills before changing the frontend:

- Taste Skill: `design-taste-frontend` from https://github.com/Leonxlnx/taste-skill
- UI/UX Pro Max: `ui-ux-pro-max` from https://github.com/nextlevelbuilder/ui-ux-pro-max-skill

For Cursor on Windows, install from the repository root:

```powershell
npx skills add https://github.com/Leonxlnx/taste-skill --skill design-taste-frontend
npm install -g ui-ux-pro-max-cli
uipro init --ai cursor
```

Restart Cursor after installation so it discovers the generated skill instructions. Read the installed SKILL.md files and run their applicable design-system and browser checks; installation alone does not apply their recommendations.

## Product direction

- Visual language: LegalTech editorial, restrained graphite/ivory/bronze palette, precise typography and square-cornered surfaces.
- The contract editor and legal findings are the primary work surface. A finding must continue to locate and select its quoted source text.
- Client-facing reports prioritize risk, evidence and actions. Do not reintroduce engine comparison, model diagnostics or traceability panels into the report.
- Keep source excerpts, severity labels and uncertainty notices legible. Do not hide important legal limitations to improve appearance.
- Avoid decorative landing-page heroes, fake analytics, stock imagery, gratuitous animation, gradients and dashboard cards.
- Preserve all existing DOM hooks and behavior for upload, authentication, local/Gemini fallback, history, exports and recommendations.
- Ensure keyboard navigation, visible focus, readable contrast, narrow-screen layout and reduced-motion behavior.

## Review sequence

1. Capture current desktop and mobile states before editing.
2. Review typography, spacing, hierarchy, states, interaction and accessibility using both skills.
3. Make small changes in `css/editorial.css`, `css/app.css`, `index.html` or `js/app.js` only when justified.
4. Run `npm test` and the browser consistency checks supplied by the installed skills.
5. Compare before/after screenshots at desktop and mobile widths. Report failures rather than claiming a pass without running checks.
