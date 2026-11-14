# CLAUDE.md

Guidance for Claude Code in this repository. **SPEC.md is the source of truth for behavior**; this file defines how we work.

## Project

Movie Memory is a take-home exercise: the Base implementation plus Variant A (backend caching and correctness), with a few documented additions. It's graded on auth-flow correctness, data modeling, security and authorization, error handling, code clarity, and the author's ability to explain every decision.

**Explainability is a hard requirement.** Prefer plain, conventional code over clever abstractions. If something would be hard to explain in an interview, choose the simpler version or ask.

## How we work

- **One step at a time.** Follow the build plan below. At the start of each step, propose a short plan (the files to touch and the approach) and wait for approval before writing code.
- **Stay inside SPEC.md.** Don't add features, endpoints, fields, or dependencies that aren't in SPEC.md. If something is ambiguous, conflicts with SPEC.md, or seems wrong, stop and ask. Don't guess.
- **Ask before adding any npm dependency.** Pin exact versions.
- **Verify APIs against current docs or installed type definitions, not memory.** This applies especially to Better Auth, Prisma, Next.js, and the OpenAI SDK, which change often. Say so when you're unsure.
- **End each step with all of the following:**
  - Run `npm run typecheck`, `npm run lint`, and `npm test`, and fix any failures.
  - Summarize what changed and why.
  - Update `LEARNING_NOTES.md` (below).
  - Propose a commit message (Conventional Commits). Commit only after approval.
- **Write tests alongside the code they cover,** not at the end.

## Notes file

The only committed docs are `CLAUDE.md`, `SPEC.md`, and the README. Don't create other docs files.

- **`LEARNING_NOTES.md`** (**gitignored, never commit**): detailed explanations for the author's learning. Follow the entry template at the top of that file. Add an entry for every meaningful design decision, every non-obvious technique (e.g., the lease SQL, composite foreign keys), and every bug and fix that teaches something. Write it for a developer who wants to understand the *why*, define terms, and include likely interview questions.
- **AI usage:** when a step's AI assistance is worth mentioning in the README, add a bullet to the `## AI usage` section at the bottom of `LEARNING_NOTES.md`.

## Build plan

0. **Scaffold.**
   - Next.js (App Router, TS strict, Tailwind, ESLint, `src/` directory), plus Prettier and Vitest.
   - Local Postgres 18 (installed natively via Homebrew, no Docker): create the `movie_memory` dev database and the `movie_memory_test` test database, and document both in `.env.example`.
   - Zod-validated env module and `.env.example`.
   - npm scripts (see Commands).
   - **Add `LEARNING_NOTES.md` to `.gitignore`, and confirm with `git status` that it isn't tracked.**
1. **Database:** Better Auth CLI-generated auth models plus the application models from SPEC §3; first migration; check the generated SQL (timestamptz, defaults, the composite foreign key).
2. **Auth:** Better Auth + Google, `requireUser()` data access layer, optimistic middleware/proxy, landing page, redirects (SPEC §5), name fallback.
3. **Movies:** normalization and validation (SPEC §4), the search endpoint, the `FactGenerator` interface with a fake for tests.
4. **OpenAI:** production `FactGenerator` (structured output, deadline, retry, moderation, prompt defenses; SPEC §8).
5. **Onboarding:** `POST /api/me/favorite-movies` (SPEC §9) and the onboarding page with autocomplete (SPEC §10).
6. **Fact service:** cache window, lease, strategies, fallback, deletion edge case (SPEC §7), and `GET /api/movies/:movieId/fact`.
7. **Dashboard:** `GET /api/me` and the dashboard UI with all states (SPEC §11).
8. **Account deletion:** `DELETE /api/me` with token revocation (SPEC §12) and the UI confirmation.
9. **Deployment readiness (no actual deploy):** make sure the app is deployable on any Node host, with config only through env vars and migrations via `prisma migrate deploy`. Write the README's deployment guide (SPEC §16).
10. **README:**
    - Setup, environment variables, migrations.
    - Architecture overview (1–2 pages).
    - Variant choice and why; tradeoffs (summarized from LEARNING_NOTES.md).
    - Next steps (SPEC §17).
    - AI usage notes.

## Commands (create in step 0)

```
npm run dev              # next dev
npm run build            # prisma generate && next build
npm start                # next start (respects $PORT)
npm run lint             # eslint
npm run format           # prettier --write
npm run typecheck        # tsc --noEmit
npm test                 # vitest run (uses TEST_DATABASE_URL)
npm run test:watch       # vitest
npm run db:migrate       # prisma migrate dev
npm run db:test:prepare  # apply migrations to the test database
```

## Project structure

```
src/
  app/                    # routes: pages and route handlers only (thin)
    api/...               # route handlers: auth → validate → call service → map errors
  components/             # React components (client components only where needed)
  lib/
    server/               # server-only; every file starts with `import "server-only"`
      env.ts              # Zod-validated environment
      db.ts               # Prisma client singleton
      auth.ts             # Better Auth instance
      session.ts          # requireUser(): the authoritative auth check
      errors.ts           # AppError + route-handler error mapping
      movies/             # normalization, movie lookup, search, onboarding service
      facts/              # fact service, lease, strategies, fallback
      openai/             # FactGenerator implementation, prompt, moderation
      account/            # deletion + Google revocation
    shared/               # code safe for both sides: API response types, Zod input schemas
    auth-client.ts        # Better Auth browser client
tests/                    # Vitest tests, helpers, fake FactGenerator
```

## Architecture rules

- **Thin route handlers.** Route handlers and pages do only four things: get the user via `requireUser()`, validate input with Zod, call a service, and map errors. Business logic lives in `lib/server/` services.
- **Server-only data access.** Prisma and OpenAI are imported only inside `lib/server/`.
- **Services take inputs explicitly.** Services receive `userId` from the caller, which got it from the session, plus their dependencies (e.g., `FactGenerator`), so tests can inject fakes.
- **One error type.** Services throw `AppError`; one helper converts it to the SPEC §6 error shape.
- **Shared types.** API response types live in `lib/shared/` and are used by both the route handler and the client.

## Security rules

- **Identity only from the session.** Never accept a user id from the request (path, query, or body).
- **Ownership checks on every query.** Every query touching user data is scoped to the session user. A movie that isn't the user's favorite gets `404`, never `403`.
- **Middleware/proxy is optimistic only.** It is never the security boundary.
- **No `NEXT_PUBLIC_` secrets.** Secrets stay in env vars. Never log tokens, cookies, secrets, or full OpenAI request or response bodies.
- **Nothing internal reaches clients.** Error responses contain only safe user-facing messages: no stack traces, no OpenAI error details.
- **Personal data never goes to OpenAI.** Only the movie title and release year are sent.
- **Safe rendering.** Never use `dangerouslySetInnerHTML`. Model output is rendered as plain text.

## Database rules

- **Migrations:** every schema change gets a new, descriptively named migration. Never edit an applied migration.
- **Raw SQL:** use only `$queryRaw` / `$executeRaw` tagged templates (parameterized). **Never** `$queryRawUnsafe`.
- **Time:** all freshness and lease comparisons use the DB clock (`now()` in SQL), not `new Date()`.
- **Timestamps:** all timestamps are `@db.Timestamptz(3)`.
- **Transactions:** multi-row writes run in one transaction. **No transaction stays open across an OpenAI call.**
- **Find-or-create:** races are handled with `ON CONFLICT DO NOTHING` + select, or by catching the specific Prisma error code. Never with a bare `upsert` that can throw on a race.

## Code conventions

- **TypeScript strict.** No `any`; use `unknown` and narrow it. No non-null assertions without a comment explaining why.
- **Zod validates everything external:** request bodies, query params, env vars, and OpenAI output.
- **Small, named functions.** Comments explain *why*, not *what*.
- **Styling:** Tailwind only; no UI component library.
- **Accessibility:** use semantic HTML and labeled inputs. Interactive widgets (the autocomplete combobox) follow WAI-ARIA patterns.

## Testing rules

- **Real database.** Tests run against the real Postgres test database. Don't mock Prisma.
- **Time control.** Control time by inserting backdated rows in SQL. Don't use fake timers for DB time.
- **No real APIs.** OpenAI is always the fake `FactGenerator`. No test calls a real external API.
- **Auth.** Mock the session lookup at the `requireUser()` boundary.
- **Required coverage:** SPEC §14 lists the required tests. The cache-window, authorization, and concurrency tests are graded, so keep them clear and well named.

## Don't

- Add features, endpoints, or schema fields not in SPEC.md.
- Add dependencies without asking.
- Hold a DB transaction or lock during an OpenAI call.
- Use the app-server clock for cache or lease logic.
- Commit `.env` files or `LEARNING_NOTES.md`, or create docs files other than the README.
- Silently change a SPEC decision. Propose the change and update SPEC.md once it's approved.
