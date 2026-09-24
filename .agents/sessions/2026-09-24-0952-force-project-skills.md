# 2026-09-24 09:52 — Force project skill routing

**Goal:** install five skills machine-wide and make this repo require them on every session.

## 09:48 — Installed 5 skills globally

**Did:** `skills add` for `web-design-guidelines`, `ui-ux-pro-max`, `frontend-design`,
`grill-with-docs`, `using-superpowers` — all now at `~/.agents/skills/<name>`, symlinked from
`~/.claude/skills/<name>`. Nothing was written into this repo.
**Why:** user asked for the five installs; they were already present but re-run to update.
**Learned:**
- `npx skills add` **without `-g` installs project-level** into `./.agents/skills/` of whatever
  directory the shell is in. First run landed in `/tmp/.agents/skills/` — removed. Always pass `-g`.
- The per-install line `Failed to install 1 → PromptScript` is not a real failure: the CLI fans out
  to ~20 agents and PromptScript alone rejects global installs. Claude Code, Codex, Cursor et al. pass.
**Next:** —

## 09:52 — Skill routing is now a repo rule

**Did:** rewrote root `AGENTS.md:6-32` with a **Required skills** routing table (when → which skill),
an ordering rule, a precedence clause, and a red-flag list. Added a short `## Skills` pointer in
`.agents/AGENTS.md:33` that links to it instead of duplicating it.
**Why:** only `CLAUDE.md` → `@AGENTS.md` (root) is auto-loaded into every session. `.agents/AGENTS.md`
and `.agents/index/` are read-on-demand, so a rule placed there does not *force* anything — an agent
that skips the read never sees it. The forcing text has to sit in root `AGENTS.md`; the detail stays
in `.agents/AGENTS.md`.
**Learned:**
- Skill names must be written exactly as they resolve. The five installed ones resolve bare;
  `omnix-design-system` does **not** — it is plugin-scoped and only invocable as
  `anthropic-skills:omnix-design-system` (it lives under `~/.claude/skills/synced/`, not
  `~/.agents/skills/`). A rule naming an unresolvable skill is worse than no rule.
- Root `AGENTS.md` had been pointing agents at an `agents-checkpoint` skill that does not exist on
  this machine. Replaced with `session-notes`, which is the real one.
- The table encodes precedence deliberately: `frontend-design` / `ui-ux-pro-max` propose palettes and
  type scales, but this repo is OMNIX-tokens-only. Rule says take the reasoning from the skill and
  the values from `docs/design-system.md`, so the two do not fight.
**Next:** restart Claude Code so the rewritten `AGENTS.md` is re-read. Optional, not done: a
`UserPromptSubmit` hook in `.claude/settings.json` that re-injects the table every prompt — real
enforcement rather than instruction, at the cost of tokens on every turn.

## State at end

Not blocked. Two files changed (`AGENTS.md`, `.agents/AGENTS.md`), nothing committed.
The UI-review thread from `2026-09-24-0917-run-ui-review.md` is untouched and still the live task.
