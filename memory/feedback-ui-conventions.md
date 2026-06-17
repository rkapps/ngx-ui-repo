---
name: feedback-ui-conventions
description: Always use ngx-twang-ui components and lucide icons; Tailwind v3 CSS variable conventions
metadata:
  type: feedback
---

Always use twang components (`ngx-twang-ui`) for buttons, inputs, nav tabs, dropdowns, etc. Never use raw HTML buttons or plain inputs where a twang equivalent exists. Always use `lucide-angular` for icons.

**Why:** User explicitly requested both: "always use the twang components. add lucide icon library and use these icons wherever."

**How to apply:** Any UI element that has a twang equivalent must use it. Any icon must be a lucide icon, registered in `app.config.ts` and used as `<lucide-icon name="..." />`.

---

Tailwind custom color tokens are defined as space-separated RGB values in CSS variables (e.g. `--color-primary-600: 37 99 235`) and consumed in `tailwind.config.js` as `rgb(var(--color-primary-600) / <alpha-value>)`.

**Why:** The project uses Tailwind v3. The `@theme inline` syntax is Tailwind v4-only and is silently ignored by v3, breaking all custom colors.

**How to apply:** Never use `@theme` in `styles.css`. Always define CSS variables as bare space-separated RGB values and reference them via `rgb(var(...) / <alpha-value>)` in the Tailwind config.
