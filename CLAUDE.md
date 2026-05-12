
## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions).
- If something goes sideways, STOP and re-plan immediately.
- Use plan mode for verification steps, not just building.
- Write detailed specs upfront to reduce ambiguity.

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean.
- Offload research, exploration, and parallel analysis to subagents.
- For complex problems, throw more compute at it via subagents.
- One task per subagent for focused execution.

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern.
- Write rules for yourself that prevent the same mistake.
- Ruthlessly iterate on these lessons until mistake rate drops.
- Review lessons at session start for relevant project.

### 4. Verification Before Done
- Never mark a task complete without proving it works.
- Diff behavior between main and your changes when relevant.
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness.

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes -- don't over-engineer.
- Challenge your own work before presenting it.

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding.
- Point at logs, errors, failing tests -- then resolve them.
- Zero context switching required from the user.
- Go fix failing CI tests without being told how.

## Task Management
1. **Plan First**: Write plan to `tasks/todo.md` with checkable items.
2. **Verify Plan**: Check in before starting implementation.
3. **Track Progress**: Mark items complete as you go.
4. **Explain Changes**: High-level summary at each step.
5. **Document Results**: Add review section to `tasks/todo.md`.
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections.

## Supabase & Database Work

**Before touching anything Supabase or Postgres related, read these two skill files:**

- `.agents/skills/supabase/SKILL.md` — Core Supabase guidelines: changelog verification, CLI gotchas, security checklist (RLS, views, SECURITY DEFINER, storage), migration workflow.
- `.agents/skills/supabase-postgres-best-practices/SKILL.md` — Postgres performance rules across 8 categories (indexes, connection management, RLS, schema design, concurrency, etc.).

**⚠️ CLI commands must be run by the user in their own terminal — never in the bash sandbox.** The sandbox is isolated and has no access to the Supabase project or local CLI config. Same rule as git commands.

**Key rules extracted from those skills (do not skip these):**

- **Migrations:** Write the SQL file directly under `supabase/migrations/` with the timestamp filename convention (`YYYYMMDDHHMMSS_<name>.sql`). Apply to prod with `npx supabase db push` (user runs this). Do NOT use `apply_migration` to iterate — it writes history on every call and blocks future diffs. Do NOT use `supabase db pull` to generate files — in this project migrations are written by hand and pushed.
- **RLS:** Enable on every table in exposed schemas. A `TO anon` policy does NOT cover `authenticated` — they are separate Postgres roles. Views bypass RLS by default (use `security_invoker = true` in Postgres 15+). UPDATE requires a SELECT policy — without it, updates silently return 0 rows.
- **SECURITY DEFINER functions:** Never place them in an exposed schema (e.g. `public`). Use a private schema.
- **Supabase Auth:** Never use `user_metadata` / `raw_user_meta_data` in RLS policies — it is user-editable. Use `app_metadata` / `raw_app_meta_data` for authorization claims.
- **CLI version check:** `supabase db query` requires CLI v2.79.0+; `supabase db advisors` requires v2.81.3+. Run `supabase --version` if unsure.

## Core Principles
- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
- **Always provide a commit message suggestion at the end of any change

