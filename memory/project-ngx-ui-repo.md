---
name: project-ngx-ui-repo
description: Angular 21 monorepo with twang UI library, shared ngx-common lib, and two demo apps (angular-starter / bset-ai-ng)
metadata:
  type: project
---

Angular 21 monorepo (`@angular/build:application`, Vite/esbuild). Four projects:

- `ngx-twang-ui` — standalone component library at `projects/ngx-twang-ui/src/`; path alias `ngx-twang-ui`
- `ngx-common` — shared library at `projects/ngx-common/src/`; path alias `ngx-common`. Contains: services (ConversationService, AgentService, UsageService, ThemeService, AuthService), auth guards/interceptor, LOGIN_CONFIG token, and UI components (ChatComponent, PageLayoutComponent, UsageComponent, ConversationDetailComponent, NewConversationComponent, LoginComponent, UserMenuComponent)
- `angular-starter` — "Rustic AI" demo app at `projects/angular-starter/src/`; enables email + Google login
- `bset-ai-ng` — "Basset AI" demo app at `projects/bset-ai-ng/src/`; email-only login

**Why:** Develop and showcase the twang UI library across multiple apps that share common infrastructure via ngx-common.

**Tailwind:** v3 with `tailwind.config.js` at workspace root. Custom color tokens use `rgb(var(--color-*) / <alpha-value>)` pattern; CSS variables defined as space-separated RGB values in `styles.css` under `:root, [data-theme='emerald']`, `[data-theme='ocean']`, `[data-theme='sunset']`. Do NOT use `@theme inline` (that is Tailwind v4 syntax and is ignored by v3).

**Theme system:** `ThemeService` sets `data-theme` attribute on `<html>`. Three themes: `emerald` (blue), `ocean` (steel-blue, default), `sunset` (orange). Persisted to localStorage. User switches theme via UserMenuComponent color swatches.

**Lucide icons:** `lucide-angular` v0.563. Icons registered via `LucideAngularModule.pick({...})` in `app.config.ts`. PascalCase TS imports, kebab-case template names.

**Login config:** `LOGIN_CONFIG` injection token (from ngx-common) drives `LoginComponent` — set `enableEmail`/`enableGoogle`/`appName`/`redirectTo` per app in `app.config.ts`.

**Auth:** Firebase auth via `@angular/fire`. `AuthService.ready` signal flips true once Firebase resolves session; app shell shows spinner until then.

**How to apply:** New apps copy `angular-starter` structure, update `LOGIN_CONFIG` in `app.config.ts`, register in `angular.json`, `tsconfig.json`, and `tailwind.config.js`.
