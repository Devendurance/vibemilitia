# CRITICAL RULES - MUST FOLLOW

- Auto-log meaningful rules to the project’s AGENTS.md.
- Auto-commit and push after every meaningful checkpoint.
- Auto-clean temporary files and build clutter.
- Keep the repository in a recoverable state.

## WRITING

- Never use em dashes. Use commas, periods, hyphens, or rewrite the sentence.
- Do not use the “It’s not X, it’s Y” correction pattern. State the correct point directly.
- Avoid choppy writing. Keep the flow natural.
- Avoid semicolons in casual replies. Use periods or normal conjunctions.
- Remove stock transitions like “however,” “furthermore,” “it’s worth noting,” and “in conclusion.”
- Use contractions in casual contexts. Say “don’t” instead of “do not.”
- Use simple words. Say “use” instead of “utilize,” “start” instead of “commence,” and “find out” instead of “ascertain.”
- Avoid mid-sentence ellipses unless you’re writing deliberate dialogue.
- Avoid parenthetical asides when the idea can fit naturally into the sentence.
- Use colons sparingly. Don’t label every paragraph or list.
- Remove chatbot filler like “Great question,” “I hope this helps,” “Let me know if,” “Here is a,” and “Let’s dive in.”
- Do not use emojis unless the user clearly wants that style. (This is specific to me, you can leave it if you like to use emojis tho)
- Do not use bold text for emphasis in normal prose.
- Challenge weak reasoning. Flag unsupported claims. Do not agree just to be polite.

## RESPONSES

- Keep responses concise and to the point unless the user asks otherwise.

## AGENT STATE

- Long-running project state lives in `agent-state/`:
  - `project-state.md` tracks what's been built, the architecture, and important decisions.
  - `memory.md` tracks durable facts, conventions, and gotchas.
  - `left-off.md` tracks the current task, what's done, what's next, and known issues.
- At the start of every session, read all three files before doing anything else.
- Update them at every meaningful checkpoint: feature finished, decision made, bug found, direction changed.
- Keep them short. Bullets, not essays. `left-off.md` must always answer: what are we doing, what's done, what's next.
- When the session gets compacted or messy, a new session resumes from these files.

## CONTEXT MANAGEMENT

- When the active agent session approaches roughly 250,000 consumed context tokens, proactively compact or summarize the working context before continuing. Do this before context degradation becomes noticeable.
- Preserve the current objective, repository truth, completed checkpoints and commit hashes, architectural and product decisions, unresolved blockers, relevant environment variable names but never secret values, important implementation invariants, tests and verification state, and the exact next action.
- Do not over-compress implementation-critical details.
- After compaction, continue from the preserved state rather than re-auditing the entire repository.

## PLANNING MODE

- Always ask clarifying questions.
- Never assume the design, tech stack, or features.
<!-- - Use deep-dive sub-agents to assist with research. -->
<!-- - For research work or research assist sub-agents, use SWE-2 model with a high reasoning/thinking effort if not available use muse spark-1.3 contributor with x-high reasoning effort.
- Use deep-dive sub-agents to review the different aspects of your plan before presenting it to the user. -->

## CHANGE / EDIT MODE

<!-- - Never implement features yourself when possible; use sub-agents.
- Identify changes from the plan that can be implemented in parallel, and use sub-agents to implement the features efficiently.
- When using sub-agents to implement features, act as a coordinator only. -->
- After completing features, whether large or small, always run commands such as lint, type check, and next build to check code quality.

## DATABASE SCHEMA CHANGES

- Whenever you make changes to the database schema, ALWAYS run `db:generate` then `db:migrate`.
- NEVER run drizzle push.
- Guest progression uses `server/persistence/ProfileStore.ts` with `node:sqlite`. Schema versions live in `schema_migrations`. Add an additive migration for every schema change and run `npm run db:backup` before applying it.
- Do not point multiple game-server processes at one SQLite database.

## DEPLOYMENT

- The Colyseus server must run as a persistent Node.js process behind WSS. Never deploy it as a serverless function.
- Never enable `VIBE_MILITIA_TEST_HOOKS` in production.
- Production requires `ALLOWED_ORIGINS` and a persistent `DATABASE_PATH`. See `DEPLOYMENT.md`.
- Production runs on the shared `endy-vps` host as systemd user units behind a dedicated Cloudflare Tunnel, on loopback port `2767`. Do not touch the `chog-royale-*`, `hermes-gateway`, `telepi`, `openbot`, `antigravity-telegram` or `opencode-telegram-bot` services, and never publish port `2767`.
- Live URLs: `https://vibemilitia.vercel.app` (frontend) and `https://vibemilitia-game.endyos.xyz` (game server). Verify a deploy with `npm run verify:production`.
- Routes: `/` is the game hub, `/practice?difficulty=easy|normal|hard|merciless` is local P1, `/online` is the focused matchmaking lobby and live match. Never auto-start a match from `/`.
- The frontend has one global stylesheet entry: `src/app/globals.css`. Do not add a second global CSS import to the root layout; Turbopack dropped the first sheet during this milestone. Append new global styles to `globals.css`.
- `RECONNECT_GRACE_SECONDS=30` is the product default. Reload/navigation recovery uses the tab-scoped resume handle and `POST /api/resume`. Do not move that handle to shared localStorage: a second tab must not redeem a live seat.
- Public rankings use `GET /api/leaderboard`. Display names are editable and non-unique. X handles are self-declared and must never be rendered as verified.

## NETCODE AND RENDERING

- Movement is a pure function of the input stream. Keep it that way: the server consumes one client tick per server tick and holds a player whose input is late. Never compare a predicted position directly with a snapshot, because a snapshot is RTT old. Reconcile with `LocalPredictor.reconcile` only.
- Wire changes stay version-gated by `netProtocol`. Old tabs must keep receiving the full `snapshot` message, because tabs stay open across a deploy. Deploy the backend before the frontend.
- A real public RTT from Nigeria through the Cloudflare tunnel is 360 to 560 ms. Test netcode at 550/80 as well as 100-250 ms, using `scripts/lib/latency-proxy.mjs`. Devtools throttling does not reliably apply to WebSockets.
- Never add a per-frame Phaser `Arc`, `Ellipse` or stroked shape to a match. Each one re-tessellates every frame. Bake a texture in `makeBakedEffects`. Never use `backdrop-filter` over the live canvas.
- Practice is `GameSimulation` in a worker behind `PracticeRoom`. Add rules to the simulation, never to a practice copy. The older drone drill stays at `/practice?engine=legacy` for the P1 suite only.
- `SIGNAL LOST` meant death, and players read it as a disconnect. Connection state is reported only by measured data: the session bar and the reconnect overlay.

## TESTING

- Use any testing tools and libraries available to the project to test your changes.
- `node scripts/build-test-frontend.mjs`, then `npm run verify:playability`, `node scripts/run-regressions.mjs` and `npm run measure:playability`. These boot their own SQLite stack, so they cannot touch Neon.
- Emulated mobile proves events and layout, never physical device performance. Say so in reports.
- Never assume your changes work; always test.
- If the project does not have any testing tools, scripts, MCP tools, or similar resources available for testing, ask the user whether testing should be skipped.

## UI DESIGN

- Always follow or reference the UI design system when creating or reviewing components or pages.
- Design System: @DESIGN.md

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
