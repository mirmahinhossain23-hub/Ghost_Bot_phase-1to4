# 👻 GHOST — AI Discord Server Manager
### by Ghost Studios

**Phase 1–4 Test Release**

Ghost is an AI Discord administrator you talk to like a person — not a slash-command bot. You describe what you want in plain language, Ghost figures out which real Discord actions that requires, shows you what it's about to do, and only acts after the appropriate safety checks and (where needed) your explicit confirmation.

> "Ghost, what roles and channels do we have?"
> "Ghost, timeout Ahmed for 30 minutes for spamming."
> "Ghost, build a professional server for my Roblox development studio."
> "Ghost, make my categories look premium."

This is a **real, working codebase** — every tool described below runs against the real Discord API. Nothing in this document describes a feature that doesn't actually exist in the code. Where something is partial or not yet built, it's called out explicitly in [Current Limitations](#-current-limitations-read-this).

---

## 📦 What's in this release

This ZIP contains **Phases 1 through 4, combined** — nothing from any earlier phase was removed or replaced along the way, so this is the complete, current state of the project:

| Phase | Theme | Status |
|---|---|---|
| **1** | Foundation — activation, AI provider abstraction, tool pipeline, database | ✅ Complete |
| **2** | Core server management — roles, channels, categories, styling, previews | ✅ Complete |
| **3** | Moderation & safety — kick/ban/timeout, centralized hierarchy checks, risk classification, bulk execution, audit history | ✅ Complete |
| **4** | Server Architect — AI-designed and template-based server planning, validation, preview/edit/build flow, server analysis, ticket-system foundation | ✅ Complete |
| **5** | Web Admin Panel | ⬜ Not started (by design — see below) |

---

## 🏗️ Architecture

A TypeScript monorepo (npm workspaces), strictly typed, zero paid infrastructure required by default:

```
ghost/
├── apps/
│   └── bot/                    # The Discord bot process
│       └── src/
│           ├── index.ts            # entry point
│           ├── client.ts           # discord.js client + intents
│           ├── activation.ts       # wake-word / @mention detection
│           ├── confirmation.ts     # pending-action store + risk-styled preview + buttons
│           ├── conversationContext.ts  # "what were we just discussing" (~10 min TTL)
│           ├── entityTracking.ts   # pulls the primary entity out of a tool result
│           ├── formatting.ts       # turns tool results into readable Discord messages
│           └── events/
│               ├── messageCreate.ts       # main brain loop
│               └── interactionCreate.ts   # confirmation button handling
│
└── packages/
    ├── shared/                 # Cross-package types (ToolDefinition, RiskLevel, ...) + logger
    ├── database/                # Prisma schema + SQLite client (guild settings, audit log)
    ├── ai/                       # AIProvider abstraction
    │   └── src/providers/            # gemini.ts, openai.ts
    └── discord-tools/            # Every real Discord action + the safety pipeline
        └── src/
            ├── tools/                 # one file per tool — 34 total
            ├── architect/             # Server Architect: planning, templates, validation, execution
            ├── styleEngine.ts         # naming presets + pattern detection
            ├── channelUtils.ts        # Discord naming-rule helpers, lenient name matching
            ├── memberUtils.ts         # ambiguity-aware member resolution
            ├── resolve.ts             # generic "found / ambiguous / not found" resolver
            ├── permissions.ts         # centralized permission + hierarchy safety checks
            ├── durationParser.ts      # natural-language duration parsing
            ├── risk.ts                # risk classification (backend-only, never the AI)
            ├── executionQueue.ts      # bounded-concurrency bulk executor, transient-only retries
            ├── planGuard.ts           # rejects duplicate/contradictory AI tool-call batches
            └── targets.ts             # "what did this action target" for the audit log
```

`apps/web`, `apps/api`, and `packages/ui` from the original architecture spec are intentionally not created yet — that's Phase 5.

### How a message actually gets handled

```
Discord message
     ↓
Wake word ("Ghost") or @mention detected — otherwise ignored entirely
     ↓
AI (Gemini or OpenAI) reads the message + available tools + recent conversation context
     ↓
AI proposes tool call(s), e.g. { tool: "timeout_member", parameters: {...} }
     ↓
Plan guard: collapse duplicate calls, reject contradictory ones (e.g. delete + rename same thing)
     ↓
Parameter validation → global safety rules → requester's Discord permission → Ghost's own bot permission
     ↓
For member-targeting actions: centralized moderation safety (owner protection, dual-hierarchy checks)
     ↓
Risk level computed by the backend — low / medium / high / critical (the AI cannot set or override this)
     ↓
Low-risk / read-only actions run immediately
Destructive, bulk, or high-risk actions show a risk-styled preview and wait for Confirm/Cancel
     ↓
Execution runs through a bounded-concurrency queue with transient-only retries
     ↓
Every action is logged to SQLite with its risk level, targets, confirmation status, and a shareable ID
     ↓
Ghost replies with what actually happened (never a false "all done" if something failed)
```

The AI **never** touches Discord directly. It can only request a tool from the registry in `packages/discord-tools/src/tools/` — adding a new ability to Ghost always means adding one new file there.

---

## 🧰 Complete tool reference (34 tools)

Every tool's risk level and confirmation requirement is computed by backend code, never the AI.

### Server info — read-only
| Tool | Description | Risk |
|---|---|---|
| `list_roles` | Lists every role, hierarchy order, color, member count | Low |
| `list_channels` | Lists every channel grouped by category | Low |
| `server_info` | Name, member count, role/channel counts, boost level | Low |

### Channels & categories
| Tool | Description | Confirms? | Risk |
|---|---|---|---|
| `create_channel` | Text or voice channel, optional category, optional private | No | Medium |
| `delete_channel` | Permanently deletes a channel | **Yes** | High |
| `rename_channel` | Single rename, auto-sanitized for Discord's naming rules | No | Medium |
| `move_channel` | Change category and/or position | No | Medium |
| `create_category` | New category | No | Medium |
| `delete_category` | Delete a category; optionally cascade-delete its channels | **Yes** | High → **Critical** if cascading past 5 channels |
| `edit_channel_permissions` | Allow/deny a curated, safe permission set for one role in one channel | **Yes** | High → **Critical** for `@everyone` |

### Roles
| Tool | Description | Confirms? | Risk |
|---|---|---|---|
| `create_role` | New role with color/hoist/mentionable | **Yes** | Medium |
| `delete_role` | Permanently deletes a role | **Yes** | High |
| `rename_role` | Rename | No | Medium |
| `edit_role` | Color / hoist / mentionable (never raw permissions) | No | Medium |
| `move_role` | Reposition above/below another role | No | Medium |
| `add_role_to_member` | Give one member a role | **Yes** | Medium |
| `remove_role_from_member` | Remove a role from one member | **Yes** | Medium |
| `bulk_remove_role` | Remove a role from every member who has it | **Yes** | High |

### Members — read-only
| Tool | Description | Risk |
|---|---|---|
| `list_members` | Filterable by role or "no roles" | Low |
| `search_members` | Fuzzy username/display-name search | Low |
| `get_member_info` | Roles, join date, account age | Low |

### Stylish naming system
| Tool | Description | Confirms? | Risk |
|---|---|---|---|
| `restyle_names` | Bulk-restyle category/channel names to a preset or a copied existing style, full before/after preview | **Always** | High → **Critical** past 20 renames |

### Moderation
| Tool | Description | Confirms? | Risk |
|---|---|---|---|
| `kick_member` | Kick from the server | **Yes** | High |
| `ban_member` | Ban, with optional message deletion | **Yes** | **Critical** (always) |
| `unban_member` | Lift a ban, by ID or username match | No | Medium |
| `timeout_member` | Natural-language duration ("30 minutes", "2 hours"), capped at Discord's 28-day limit | **Yes** | Medium → High for 1+ day |
| `remove_timeout` | Clear a timeout early | No | Low |
| `list_bans` | List current bans with reasons | Low |
| `get_moderation_target_info` | Hierarchy standing, timeout status, account age — "could Ghost/I actually act on this person?" | Low |

### Server Architect
| Tool | Description | Confirms? | Risk |
|---|---|---|---|
| `propose_server_plan` | Design a structure — template or AI-custom — validated and stored as a pending plan; touches nothing yet | No | Low |
| `modify_server_plan` | Edit the pending plan conversationally | No | Low |
| `build_server_plan` | Execute the pending plan for real | **Always** | Dynamic (Low→Critical based on the plan) |
| `analyze_server` | Read-only structural recommendations | No | Low |
| `configure_ticket_system` | Real ticket category/panel/config scaffolding (see limitations) | **Yes** | Medium |

---

## 🛡️ Security & safety system

Every mutating tool passes through the same pipeline — none of this is duplicated per-tool, and none of it can be bypassed by the AI:

1. **Plan guard** — collapses exact duplicate AI tool calls, and rejects pairs that contradict each other (e.g. delete + rename of the same thing in one turn) before validation even runs.
2. **Parameter validation** — every parameter is checked against the tool's declared schema, including nested object shapes (used by the Server Architect's plan structure).
3. **Global safety rules** — e.g. `@everyone` can't be renamed/deleted through generic tools, role names are length-checked.
4. **Requester permission check** — does the human asking actually hold the Discord permission the tool needs?
5. **Bot permission check** — does Ghost's own role hold the permission, with a clear message (not a cryptic API error) if not?
6. **Moderation-specific safety** (`checkModerationTarget` / `checkRequesterAuthorityOver` in `permissions.ts` — one centralized place):
   - The server owner can never be moderated by Ghost.
   - Ghost's own hierarchy is checked via discord.js's own `kickable`/`bannable`/`moderatable` getters.
   - **The requesting human's hierarchy over the target is checked explicitly** — Discord's API doesn't enforce this for bot-mediated actions (only its UI does, for direct human moderation), so Ghost checks it itself: if the target's highest role is at or above the requester's, the action is refused. The guild owner is exempt.
   - Self-targeting is blocked outright.
7. **Ambiguity protection** — name lookups (members, and the Server Architect's plan editing) never silently guess between multiple matches. Exact Discord IDs and `<@mentions>` always resolve unambiguously; a name that matches more than one thing gets a clarification list instead of a guess.
8. **Risk classification** — computed entirely by backend code (`risk.ts`, `architect/planRisk.ts`) from static tool metadata plus, where relevant, runtime specifics (how many items, how long a timeout, how large a plan). The AI has no path to set or influence this.
9. **Confirmation** — destructive/bulk/high-risk actions show a risk-styled preview (🚨 CRITICAL styling with a red "Confirm Critical Action" button for the top tier) and wait for an explicit click.
10. **Bounded-concurrency execution** — bulk operations (`restyle_names`, `bulk_remove_role`, cascading category deletes, Server Architect builds) run through a shared queue (3–5 at a time, never hundreds at once), retrying only genuinely transient failures (429/5xx) a single time — never aggressive retry loops. One item failing never aborts the batch.
11. **Recovery snapshots** — before deleting a channel or role, Ghost captures enough to describe what existed (name, color/permissions/position for roles; category/position/topic/overwrites for channels). This is the **foundation** for a future undo command — see limitations.
12. **Audit logging** — every action gets a short shareable ID (e.g. `GST-8F4K2`), and the log records risk level, whether confirmation was required, best-effort target list, and any recovery snapshot.

## 🚦 Risk levels

| Risk | Meaning | Examples |
|---|---|---|
| 🟢 Low | Read-only or fully reversible | `list_roles`, `server_info`, `remove_timeout`, `list_bans` |
| 🟡 Medium | Everyday single-item changes | `create_channel`, `create_role`, `timeout_member` (under 1 day) |
| 🟠 High | Permission/hierarchy-sensitive or "many items" | `delete_channel`, `delete_role`, `bulk_remove_role`, `kick_member`, `restyle_names` (normal size) |
| 🚨 Critical | Bans, mass moderation, large-scale structural change | `ban_member` (always), `restyle_names` past 20 renames, cascading category delete past 5 channels, `@everyone` permission edits, replacing existing server structure |

---

## 🎨 Stylish naming system

`restyle_names` (standalone) and the Server Architect's `style` option (applied to a whole plan before preview) share the exact same underlying logic in `styleEngine.ts`:

- **Presets**: `minimal`, `modern`, `premium`, `futuristic`, `gaming`, `developer` — each defines a category wrapper (e.g. `✦ NAME ✦`) and a channel icon/separator convention.
- **"Copy an existing category's style"** — detects the wrapper and separator convention already in use and reapplies it elsewhere.
- **Discord's real per-type naming rules are always respected**: categories and voice channels can be fully styled (caps, symbols, spaces); text/forum channels stay lowercase-and-hyphenated because that's a hard Discord platform constraint, not a Ghost limitation. Text channels still get a purpose-based icon prefix (💬 general, 💻 development, 🐛 bugs, etc.).
- Restyling is idempotent — running the same style twice makes no further changes.
- Name lookups everywhere (not just styling) tolerate decoration: once "Information" becomes "✦ INFORMATION ✦", you can still refer to it as "Information".

## 🏗️ Server Architect

Four tools work together as a genuine multi-turn design flow, not a one-shot command:

```
propose_server_plan → design (template or AI-custom), validate, store as PENDING — touches nothing
modify_server_plan  → edit the pending plan conversationally
build_server_plan   → execute through the full risk/confirmation/execution pipeline
analyze_server       → read-only recommendations, never modifies anything
```

- **The plan is a real typed object** (categories, channels, roles, style, existing-resource strategy) — never a bundle of raw create-channel calls. A custom AI-designed plan is validated exactly as strictly as a template.
- **Pending plans persist per-channel for ~30 minutes**, so "build a gaming server" → "add a staff section" → "make it premium" → "build it" works as one continuous conversation.
- **Existing-server protection**: a `create` request against a server that already has real structure is refused with an Add/Reorganize/Replace prompt instead of silently building on top of it.
- **Six templates**: Roblox Development Studio, Gaming Community, Business/Agency, Content Creator Community, Staff Team, Simple Community — each with core sections (always included) and optional sections the AI includes based on what was asked for.
- **Validation**: duplicate names, empty/over-length names, more than 50 channels in one category, and the plan pushing the server past Discord's real 500-channel / 250-role limits.
- **Dependency-aware execution**: roles, then categories, then channels. A channel is never created "loose" if its planned category failed — it's marked skipped, not attempted. The final report (`createdCount` / `failedCount` / `skippedCount`) is honest by construction.

---

## ⚠️ Current limitations (read this)

Stated plainly, per how this project has been built phase by phase — nothing here is silently glossed over:

- **True in-place server reorganization is not implemented.** `reorganize` mode gets the correct (higher) risk classification and an existing-aware preview, but the executor today only *adds* new structure. Moving/renaming *specific existing* channels per a generated diff is future work.
- **The interactive ticket system is not implemented.** `configure_ticket_system` creates a real category, a real panel channel, and validates staff roles — but there are no clickable "open a ticket" buttons. Building buttons with no interaction handler behind them would be decorative fake UI, which this project deliberately avoids. The real click-to-open-a-private-channel flow is future work built on this real configuration.
- **There is no `undo` command.** Phase 3 built recovery snapshots (enough data to describe what a deleted channel/role looked like) as a foundation, but nothing consumes them yet to actually restore anything.
- **Live Discord testing is still required.** Every isolated test in this project (style engine, moderation safety, duration parsing, bulk partial-failure handling, risk classification, plan validation, dependency-safe execution, ambiguity resolution) was run against realistic fake guild/member objects — this sandbox has no live Discord network access or bot token. Actually kicking/banning/timing out a real member, building a real multi-category server, and clicking through the real confirmation UI all still need to happen against your own test server.
- **No web panel yet.** Everything above is Discord-only, by design, per the phased plan.

## ✅ Testing performed

Isolated, no-live-Discord tests were written and run for every phase (fake guild/member/channel objects built from discord.js's own `Collection` type), plus a consolidated cross-phase regression pass before this release: **34 tools registered with zero name collisions**, styling idempotency and lenient-name-matching regressions, moderation hierarchy/ownership protection, natural-language duration parsing (valid and invalid), bulk actions with simulated partial failures, risk classification (static and dynamic), unknown-tool and contradictory-plan rejection, Server Architect plan validation (duplicates, invalid names, resource limits), existing-server protection actually refusing an unsafe build, dependency-safe execution (a failed category's channels correctly skipped, not orphan-created), and ambiguous-reference handling. Full TypeScript typecheck is clean across all 5 packages. See `SETUP_GUIDE.md` for the live-Discord testing checklist.

---

## 🚀 Setup

See **SETUP_GUIDE.md** for the complete, beginner-friendly, step-by-step walkthrough — Discord bot creation, AI key setup, environment configuration, database setup, and a full testing checklist ordered from safest to most sensitive.

Quick reference once setup is done:

```bash
npm install
npm run db:generate
npm run db:push
npm run dev
```
