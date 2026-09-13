# 👻 GHOST — Setup Guide
### Phase 1–4 Test Release

This walks you through everything from "empty folder" to "Ghost is online and I've tested every major feature" on your own test server. Follow it in order — the steps build on each other, especially the Discord permission ones.

Total time: 25–35 minutes, including testing.

---

## Step 1 — Requirements

Exactly what you need before starting:

| Requirement | Notes |
|---|---|
| **Node.js 18.17 or newer** | The LTS version (currently 20.x or 22.x) from https://nodejs.org is recommended. |
| **npm** | Comes bundled with Node.js — no separate install needed. |
| **A terminal** | Command Prompt or PowerShell (Windows), Terminal (Mac/Linux). |
| **A Discord account** | With permission to create applications and manage a server. |
| **A TEST Discord server** | Strongly recommended: use a small server you own, not your main community — especially for the moderation tests in Step 8. Create a free throwaway server if you don't have one: Discord app → "+" → "Create My Own" → "For me and my friends". |
| **A Google account** (for Gemini, recommended) or **an OpenAI account with billing enabled** (if you'd rather use OpenAI) | Only one is required. |
| **A text editor** | Anything that edits plain text — VS Code, Notepad++, even Notepad. You'll only be editing one file (`.env`). |

Check Node is installed correctly:
```bash
node -v
```
You should see `v18.x.x`, `v20.x.x`, or `v22.x.x`. If you get an error, install Node.js and restart your terminal.

---

## Step 2 — Discord Bot Setup

### 2.1 — Create the application

1. Go to https://discord.com/developers/applications
2. Click **New Application**, name it `Ghost` (or anything), accept the terms, **Create**.

### 2.2 — Create the bot and get your token

1. In the left sidebar, click **Bot**.
2. Click **Reset Token** → **Yes, do it!** → **Copy**. ((MTU0NjM0MDIyNDk5OTc1OTg4Mg.GHwnKT.BXYQyEgwrN1zFp-lYWwxerWV_sXm2_yFhcbROI)) Save it somewhere temporary — this goes in `.env` in Step 4. **Never share this token or commit it anywhere.**

### 2.3 — Enable required Gateway Intents

Still on the **Bot** page, scroll to **Privileged Gateway Intents** and turn ON:
- ✅ **Server Members Intent** — required for member lookup, moderation, and role assignment.
- ✅ **Message Content Intent** — required for Ghost to read what you type (wake word / mentions).

Skipping either of these is the single most common setup mistake — Ghost will appear to not respond at all.

### 2.4 — Get your Client ID

Left sidebar → **OAuth2** → **General**. Copy the **Client ID** ((1546340224999759882)) near the top.

### 2.5 — Required OAuth scopes and permissions, and inviting Ghost

1. Left sidebar → **OAuth2** → **URL Generator**.
2. Under **Scopes**, check:
   - ✅ `bot`
3. Under **Bot Permissions**, check all of these (Phases 1–4 use all of them):
   - ✅ View Channels
   - ✅ Send Messages
   - ✅ Read Message History
   - ✅ Manage Roles
   - ✅ Manage Channels
   - ✅ Kick Members
   - ✅ Ban Members
   - ✅ Moderate Members *(this is Discord's name for the timeout permission)*
4. Scroll down, copy the generated URL, open it in your browser, choose your **test server**, and **Authorize**.
5. **Important — role hierarchy:** In your test server, go to **Server Settings → Roles** and drag Ghost's role **above** any role or member you want Ghost to be able to manage, kick, ban, or time out. This is a real Discord rule (a bot can never act on someone whose highest role outranks its own), not a Ghost limitation. Keep Ghost's role near the top, below only Owner/Admin-tier roles.
6. **Your own permission:** separately, *you* (the human testing this) need **Manage Server** permission on your own account to use the Server Architect tools — Ghost checks the requesting human's permission, not just its own.

---

## Step 3 — AI Setup

Ghost's "brain" can run on either provider — pick one.

### Gemini (recommended — free tier)

1. Go to https://aistudio.google.com/apikey
2. Sign in with a Google account, click **Create API key**, copy it.
3. This is what goes in `GEMINI_API_KEY` in Step 4.

### OpenAI (alternative — requires billing)

1. Go to https://platform.openai.com/api-keys
2. Create a key, copy it.
3. This is what goes in `OPENAI_API_KEY` in Step 4. Note OpenAI requires a billing method on the account — it doesn't have an indefinite free tier the way Gemini currently does.

### Switching providers

One line in `.env` controls this:
```env
AI_PROVIDER=gemini
```
or
```env
AI_PROVIDER=openai
```
You only need the API key for whichever provider you're actually using, but it's fine to fill in both and switch by changing this one line later.

---

## Step 4 — Environment Setup

In the project folder, copy `.env.example` to a new file named exactly `.env`, then fill it in. Here's what every variable means:

| Variable | Required? | What it is |
|---|---|---|
| `DISCORD_TOKEN` | **Yes** | Your bot's token from Step 2.2. |
| `DISCORD_CLIENT_ID` | Recommended | Your app's Client ID from Step 2.4. Not read by the code directly, but useful to have on hand if you ever need to regenerate an invite link. |
| `AI_PROVIDER` | **Yes** | `gemini` or `openai` — which brain Ghost uses. |
| `GEMINI_API_KEY` | Required if using Gemini | From Step 3. |
| `GEMINI_MODEL` | No | Defaults to `gemini-2.0-flash` if left as-is. |
| `OPENAI_API_KEY` | Required if using OpenAI | From Step 3. |
| `OPENAI_MODEL` | No | Defaults to `gpt-4o-mini` if left as-is. |
| `DATABASE_URL` | **Yes** | Leave as `"file:./dev.db"` — a local SQLite file, zero setup, zero cost. |
| `GHOST_WAKE_WORD` | No | Defaults to `ghost`. Change if you want a different wake word. |
| `GHOST_CEO_USER_ID` | No | Discord user ID allowed to use every registered tool, provided that account also has the server's `Administrator` permission. |
| `OWNER_USER_ID` | **Yes for dashboard** | Discord user ID allowed to access the Control Center. `GHOST_CEO_USER_ID` is accepted as a compatibility fallback. |
| `DISCORD_CLIENT_SECRET` | **Yes for dashboard** | Discord OAuth2 client secret. Keep it server-side. |
| `DASHBOARD_URL` | **Yes for dashboard** | Public dashboard origin, for example `https://control.example.com`. |
| `DASHBOARD_PORT` | No | HTTP port. Defaults to `3000`. |
| `SESSION_SECRET` | Recommended | Secret reserved for session/security configuration. Never expose it to the browser. |
| `GHOST_DEBUG` | No | Leave blank. Set to `true` only if you want extra debug-level log lines while troubleshooting. |

Save the file once filled in.

---

## Step 5 — Database Setup

From the project's root folder:

```bash
npm run db:generate
npm run db:push
```

`db:generate` builds the TypeScript types Prisma needs from the schema. `db:push` creates the actual `dev.db` SQLite file with the right tables — no external database server needed. Both commands need internet access (to download Prisma's query engine the first time) — if `db:generate` fails, you're likely on a restrictive network/VPN; try again on a normal connection.

---

## Step 6 — Install Dependencies

```bash
npm install
```

This downloads everything Ghost needs (Discord.js, the AI SDKs, Prisma, etc.) into `node_modules`. Takes a minute or two. You can run this before or after Step 5 — order between them doesn't matter, but both need to happen before Step 7.

---

## Step 7 — Start Ghost

```bash
npm run dev
```

You should see:
```
[INFO] [bot] AI provider: gemini
[INFO] [bot] Ghost is online as Ghost#1234
[INFO] [bot] Wake word: "ghost" (also responds to @mentions)
```

Leave this terminal window open — closing it stops Ghost. (Running Ghost 24/7 without keeping your computer on means hosting it somewhere like a small VPS — ask if you want help with that later.)

If you see an error instead, check the **Troubleshooting** table at the end of this guide before continuing.

---

## Step 8 — Testing

## Step 9 — GhostBot Control Center

Phase 5 adds a real dashboard served by the bot process at `DASHBOARD_PORT`.
It reads connected guilds, members, roles, channels, registered tools, runtime status,
invite URLs, and dashboard audit events from the live backend. It does not show fake guilds
or bypass Discord permissions. Every action is evaluated through the existing Ghost tool
validation and Discord.js permission/hierarchy checks.

In the Discord Developer Portal, add this OAuth redirect URI:

```text
https://your-dashboard-host.example/auth/discord/callback
```

Then set `OWNER_USER_ID`, `DISCORD_CLIENT_SECRET`, and `DASHBOARD_URL` in the runtime environment.
Open `DASHBOARD_URL` and choose **Login with Discord**. Only the configured owner account is accepted.

After pulling the new schema, update the existing database without deleting data:

```bash
npm run db:generate
npm run db:push
```

The dashboard route is served from the same Node process as Ghost, so it controls the same live
Discord client. If the dashboard is unavailable, the Discord bot process remains the source of truth.

For a long-running Linux deployment, use a process supervisor:

```bash
npm install
npm run db:generate
npm run db:push
npm install -g pm2
pm2 start "npm run start --workspace=@ghost/bot" --name ghostbot
pm2 save
pm2 startup
```

The health endpoint is `GET /health`. Put TLS/reverse proxy authentication in front of the dashboard
in production, and configure the OAuth redirect URI to the HTTPS public URL.

Test in this order — safest first, moderation last. Use a channel Ghost can see in your **test server**.

### 8.1 — Activation
- [ ] `Ghost, are you there?` → should get a reply
- [ ] `@Ghost hello` (using the actual @mention) → should get a reply
- [ ] Send a message that just contains the word "ghost" mid-sentence, e.g. `I saw a ghost movie last night` → Ghost should **not** respond

### 8.2 — AI conversation & read-only inspection
- [ ] `Ghost, what roles and channels do we have?`
- [ ] `Ghost, give me a server overview`
- [ ] `Ghost, show me members without any roles`

### 8.3 — Roles
- [ ] `Ghost, create a role called Test Role` → confirm when prompted → check Server Settings → Roles
- [ ] `Ghost, rename Test Role to Test Role Two`
- [ ] `Ghost, make Test Role Two's color blue` *(or a hex code like #4F8CFF)*
- [ ] `Ghost, give me the Test Role Two role` → confirm
- [ ] `Ghost, remove Test Role Two from me` → confirm
- [ ] `Ghost, delete Test Role Two` → confirm → verify it's gone

### 8.4 — Channels & categories
- [ ] `Ghost, create a category called Testing`
- [ ] `Ghost, create a text channel called test-channel in Testing`
- [ ] `Ghost, create a voice channel called Test Voice in Testing`
- [ ] `Ghost, rename test-channel to renamed-channel`
- [ ] `Ghost, move renamed-channel out of its category` *(then check it's back with)* `Ghost, move renamed-channel into Testing`
- [ ] `Ghost, delete renamed-channel` → confirm
- [ ] `Ghost, delete the Testing category` → confirm

### 8.5 — Styling
- [ ] Create a couple of test categories/channels, then: `Ghost, make my categories look premium` → review the before/after preview → confirm
- [ ] `Ghost, copy the style of [a category you just styled] onto [another category]`
- [ ] Notice text channels stay lowercase with an icon, while categories and voice channels can use full styling — that's intentional (Discord's real rules).

### 8.6 — Member tools
- [ ] `Ghost, search for members named [part of your own username]`
- [ ] `Ghost, get info on [your own @mention]`

### 8.7 — Server Architect
- [ ] `Ghost, build a simple community server` → review the plan preview (nothing is created yet)
- [ ] `Ghost, add a voice channel section` → watch the plan update in place
- [ ] `Ghost, make it premium style`
- [ ] `Ghost, build it` → confirm → check the real result report (created/failed/skipped counts)
- [ ] `Ghost, analyze this server and tell me how to improve it` → read-only, nothing should change

### 8.8 — Templates
- [ ] `Ghost, use the Roblox Development Studio template, include the Clients section` *(or any of the other 5 templates — see README for the full list)*

### 8.9 — Ticket configuration
- [ ] Create a staff role first if you don't have one: `Ghost, create a role called Support Staff`
- [ ] `Ghost, set up a ticket system with a Support ticket type handled by Support Staff` → confirm
- [ ] Verify a `Tickets` category and a `create-a-ticket` channel were actually created — but note there are **no clickable buttons yet** in that channel; this only builds the real structure and config, not the interactive flow (see README limitations).

### 8.10 — Moderation (use a SEPARATE TEST ACCOUNT — read this first)

**Do not test kick/ban/timeout on your main account or on real members of a real community.** Create or borrow a throwaway Discord account (or ask a friend willing to be kicked from a test server) and add it to your test server first. Give it a role clearly *below* Ghost's role and below your own.

- [ ] `Ghost, timeout [@testaccount] for 10 minutes for testing` → confirm → check the confirmation card showed target/action/duration/reason clearly
- [ ] `Ghost, remove [@testaccount]'s timeout`
- [ ] `Ghost, get moderation info on [@testaccount]`
- [ ] `Ghost, kick [@testaccount]` → confirm → re-invite them after
- [ ] `Ghost, show me everyone banned from this server` *(should be empty unless you test ban too)*
- [ ] Optional, only if you're comfortable: `Ghost, ban [@testaccount] for testing` → confirm → then `Ghost, unban [@testaccount]`

### 8.11 — Safety edge cases (optional but recommended)
- [ ] Try to have Ghost moderate the server owner (yourself, if you own it) → should be refused
- [ ] `Ghost, timeout [@testaccount] for 50 days` → should be rejected (Discord's real 28-day limit)
- [ ] `Ghost, delete the Test Role role and also rename it to QA` (in one message) → both should be refused as contradictory
- [ ] On a server with existing structure: `Ghost, build a server for X` without saying add/reorganize/replace → Ghost should pause and ask which approach, not just build

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Missing required environment variable: DISCORD_TOKEN` | `.env` is missing, misnamed, or the token line is empty. Re-check Step 4. |
| Ghost doesn't respond at all | Confirm **Message Content Intent** is ON (Step 2.3) and Ghost has View Channel + Send Messages in that channel. |
| `@prisma/client did not initialize yet` | Run `npm run db:generate` again (Step 5). |
| "I don't have the Manage Roles/Channels permission..." | Grant it to Ghost's role, or re-invite using the Step 2.5 link. |
| "That role sits at or above my highest role..." | Drag Ghost's role higher in Server Settings → Roles (Step 2.5.5). |
| "I won't take moderation action against the server owner." | By design — no exceptions. |
| "That member's highest role is at or above your own..." | This is the same rule Discord applies to human moderators, enforced explicitly since bot actions bypass Discord's own UI-level check. Only someone with a genuinely higher role (or the owner) can have Ghost act on a given target. |
| Duration rejected | Use `<number> <unit>` like `10m`, `30 minutes`, `2 hours`, `1 day`, `1 week` — max 28 days. |
| "I couldn't reach my AI brain..." | Double-check `GEMINI_API_KEY` / `OPENAI_API_KEY` in `.env` — no quotes, no extra spaces. |
| "You don't have a pending server plan..." | Plans expire after ~30 minutes of inactivity, or were already built. Ask Ghost to design a new one. |
| "I found an existing server structure..." when you expected a build to just happen | Intentional protection — tell Ghost explicitly to Add, Reorganize, or Replace. |
| Server Architect / moderation commands seem to silently fail permission checks | You need **Manage Server** permission yourself for Architect tools, and the relevant moderation permission (Kick/Ban/Moderate Members) for moderation — separate from Ghost's own bot permissions. |
| Two contradictory actions both got refused | The plan guard working as intended — ask for one change at a time. |

---

## What to do next

This is the complete **Phase 1–4 test build**. Once you've run through Step 8 and you're happy with how it behaves, the next step is **Phase 5**: the web Admin Panel (dashboard, AI chat UI, Discord OAuth, activity/audit-log viewer, and ideally a real `undo` command built on the recovery snapshots already being recorded). Come back whenever you're ready.
