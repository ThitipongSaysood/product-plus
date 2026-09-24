# AGENTS.md

AI assistants: read `.agents/AGENTS.md` then `.agents/active.md` and the newest file in
`.agents/sessions/` before doing anything. Record progress there with the `session-notes` skill.

## Required skills

Invoke the skill **before** the work, not after. Announce `Using <skill> to <purpose>` on one line,
then actually follow it — if it carries a checklist, make a todo per item. Route each task to the
skill that owns it; never fire all of them at once.

| When | Skill |
| --- | --- |
| Session start, or you cannot tell which skill owns the task | `using-superpowers` |
| Before the first line of UI — any `.tsx`/`.css` under `apps/web/`, page, component, form, table, chart, dashboard | `anthropic-skills:omnix-design-system`, then `frontend-design` + `ui-ux-pro-max` |
| UI is written and you are about to call it done — contrast, focus order, keyboard, touch targets, labels | `web-design-guidelines` |
| Before implementing a plan that touches actor runs, API contracts, money guards, or ingest limits | `grill-with-docs` |
| A unit of work lands, or the session is winding down | `session-notes` |

**Order.** Process skills set the approach, implementation skills carry it out:
`grill-with-docs` → design skills → code → `web-design-guidelines`.

**Repo rules outrank skill advice.** `frontend-design` and `ui-ux-pro-max` will propose palettes,
type scales and spacing. This repo ships OMNIX tokens only — no hex in components, every string
through `t()` in th/en/zh, tables in `TableScroll`. Take the *reasoning* from the skill and the
*values* from `docs/design-system.md`. `web-design-guidelines` findings are advisory in the same
way: fix the accessibility defect, do not swap the token set to do it.

**Red flags.** These thoughts mean the rule is being skipped, not that it does not apply:
"it is a one-line CSS change" · "I already know the design system" · "let me open the file first" ·
"the skill is overkill here" · "I will just do this one thing".

Full project rules, conventions and hard limits: `.agents/AGENTS.md`.
