# StockSage v2: complete setup, deployment and redeploy guide

Three pieces run in production, all on free plans:

| Piece | Where | Job |
|---|---|---|
| API | Render (`stocksage-c8p6.onrender.com`) | prices, scans, grading, AI, alerts, journal |
| Site | Vercel (`thestocksage.vercel.app`) | the React app; forwards `/api/*` to Render (see `vercel.json`) |
| Database | Neon Postgres (project `aged-voice-56344729`) | keeps history across restarts |

Render and Vercel rebuild by themselves when you push to the branch they watch (normally `main`).

**Pushing v2 replaces v1.** v1 kept its history only in memory, so the restart wipes it. The history is already saved in `backups/` and v2 imports it on first start (log line `Imported 479 v1 signals`).

---

## Part 1. Run it on your computer

You need Python 3.11, Node 20+ and git.

```bash
git checkout v2
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r backend/requirements.txt -r backend/requirements-dev.txt
cp .env.example .env              # then edit it (see the table in Part 3)

python run.py                     # API on http://localhost:8000
cd frontend && npm install && npm run dev    # site on http://localhost:5173
```

With `DATABASE_URL` empty the API uses a local SQLite file (`stocksage.db`). With `OWNER_TOKEN` empty nothing is locked. Both are right for local use and wrong for a public site.

Run the checks (all must be green before any push):

```bash
python -m pytest -q
ruff check backend tests scripts
cd frontend && npm test && npm run build
```

Use the project `.venv` for pytest. The system Python lacks the dependencies and fails at collection.

---

## Part 2. The database (Neon)

1. In the Neon console open project `aged-voice-56344729`, branch `production`.
2. Click **Connect**, tick **Connection pooling**, and copy the string that starts with `postgresql://` and has `-pooler` in the host. Use the **pooled** URL for the server: the API is long-running and opens many short connections.
3. That string is your `DATABASE_URL`. The app rewrites `postgres://` to the psycopg driver form itself. Tables, and new columns listed in `_add_missing_columns` in `backend/db.py`, are created on start.

Already done on this machine (uncommitted): Neon CLI setup (`neon.ts`, root `package.json`), project agent skills in `.claude/skills/` and the Neon MCP server in `.mcp.json`. `neon deploy` wrote `DATABASE_URL` and related values into your git-ignored `.env`. **The local API keeps using SQLite until you restart it.**

Rules for the database:

- Never put the connection string in a commit, a chat or a screenshot. It lives in `.env` locally and in Render's Environment tab in production.
- Do not edit production data by hand without a copy. Neon branches are cheap: `neon checkout <name>` makes a throwaway copy to test on (it expires after 7 days, set in `neon.ts`).
- Free plans scale to zero. The first query after idle takes a second or two. That is normal.

---

## Part 3. Keys and settings

| Name | Where to set | Required | What for / how to get it |
|---|---|---|---|
| `DATABASE_URL` | Render | yes | Pooled Neon string (Part 2). Without it, history is lost on every restart |
| `OWNER_TOKEN` | Render | **yes for a public site** | Locks journal, alerts, chat, debate, brief. `python -c "import secrets; print(secrets.token_urlsafe(32))"`, store it in a password manager. **If empty, those pages are open to everyone** |
| `ALLOWED_ORIGINS` | Render | yes | Your site(s), comma separated: `https://thestocksage.vercel.app` |
| `GROQ_API_KEY` | Render | for AI | Free key at console.groq.com. Without it notes, debate and chat switch off and say so |
| `GROQ_MODEL` | Render | no | Default `openai/gpt-oss-120b` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Render | for alerts | See below |
| `ALERT_UNPROVEN` | Render | no | `1` also alerts on setups that have not beaten random stocks (default `0`) |
| `STOCKSAGE_INDIA_UNIVERSE` | Render | no | `50` (default), `100`, `200`, `500` |
| `STOCKSAGE_NSE_HOLIDAYS` | Render | no | Extra closed days, `YYYY-MM-DD,YYYY-MM-DD` |
| `VITE_WS_URL` | Vercel | yes | `wss://stocksage-c8p6.onrender.com/ws/prices` (Vercel cannot proxy WebSockets) |
| `VITE_API_URL` | Vercel | no | Leave unset; defaults to `/api` |

**Telegram (optional):** message @BotFather, create a bot, and put its token in `TELEGRAM_BOT_TOKEN`. Send your bot any message, open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `chat.id` into `TELEGRAM_CHAT_ID`. After deploying, "Send to Telegram" on the Morning brief page tests it.

**Keep secrets safe.** Do not paste any key into a chat, commit or screenshot. If one leaves your hands, revoke it and make a new one. **Revoke the old NewsAPI key from v1 now**; v2 does not use it.

---

## Part 4. First deployment

### 4.1 Save the live v1 history

`backups/live-signals_2026-08-03_to_2026-11-23.json` is in the repo and is imported automatically; today's four v1 signals are in `backups/live-signals_2026-11-24_to_2026-11-24.json`. If you wait days, first run `python scripts/export_live.py https://thestocksage.vercel.app/api <first-missing-date>` and commit the new file.

### 4.2 Render (API)

Dashboard, your service, **Environment**: add `DATABASE_URL`, `OWNER_TOKEN`, `ALLOWED_ORIGINS`, `GROQ_API_KEY` and the Telegram pair if wanted (`render.yml` lists them).

- Build: `pip install -r backend/requirements.txt`
- Start: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT --workers 1`. **One worker on purpose**: the scan, alert and brief loops live inside it.
- Health check path: `/health`

**Free instances sleep after about 15 minutes without traffic, and a sleeping server scans and alerts nobody.** Either use a paid instance, or add a free monitor (UptimeRobot, cron-job.org) that requests `https://stocksage-c8p6.onrender.com/health` every 10 minutes.

### 4.3 Vercel (site)

Set `VITE_WS_URL` as in the table (it was set for v1; keep it). If the project root is `frontend`, `frontend/vercel.json` is used; it is the same as the root one.

### 4.4 Ship

```bash
git checkout v2
# run the three checks from Part 1
git status                      # read it; never add .env
git add <the files you mean>    # include neon.ts, package*.json, .mcp.json, skills-lock.json, .claude/skills if you want them in the repo
git commit
git push -u origin v2
```

Open a pull request `v2` into `main`. CI runs the same checks plus `pip-audit`, `npm audit` and the Docker build. When green, **merge**. Render and Vercel start building within a minute. The first scan runs about 5 minutes after the API is up; on a fresh database it also grades the imported history, so allow 10 to 15 minutes.

### 4.5 Check it worked

| Check | Expect |
|---|---|
| `https://stocksage-c8p6.onrender.com/health` | `{"status":"ok","version":"2.0.0"}` |
| `https://stocksage-c8p6.onrender.com/ready` | database reachable, dialect `postgresql` |
| `https://thestocksage.vercel.app/desk` | the 3D market and setup cards |
| `/record`, tab "Replay of past years" | table of four setup kinds, all "Not proven" or "Worse than random" |
| `/journal` | asks for the owner key; after unlocking you can log a trade |
| Morning brief, "Send to Telegram" | a message arrives (if set) |
| Render logs | `Imported 479 v1 signals`, then `Scan india: ...` |
| `/journal` in a private window | still asks for the key |

---

## Part 5. Redeploying later with changes

1. **Branch** off `main`: `git checkout -b my-change`.
2. **Change and run locally** (Part 1).
3. **If you changed the API** (anything in `backend/schemas.py` or a route): `python scripts/export_openapi.py && cd frontend && npm run gen:api`. Commit the regenerated `openapi.json` and `schema.d.ts`; CI fails if they drift.
4. **Check**: `python -m pytest -q`, `ruff check backend tests scripts`, `cd frontend && npm test && npm run build`.
5. **If you added a setting**, add it in Render or Vercel *before* merging.
6. **Push, open a pull request, wait for green CI, merge.** Render and Vercel redeploy by themselves.
7. **Re-run the checks table** (4.5). It takes two minutes.

Specific kinds of change:

- **Database:** a new table appears by itself. A new column on an old table needs a line in `_add_missing_columns` in `backend/db.py`, otherwise the old database will not get it. Try risky changes on a Neon branch first.
- **New strategy:** add it to `REGISTRY` in `backend/engine/strategies.py` plus a test, then `python -m backend.replay india us` (about 10 minutes) and commit the refreshed `backend/data/replay.json`. It shows as "unproven" until it clears the replay bar.
- **Refresh the replay about monthly** the same way.
- **AI changes** (model, prompts): `python -m backend.evals --live TCS.NS RELIANCE.NS` must pass first; it saves `evals/last_run.json`.
- **Dependencies:** same loop; CI audits both sides.
- **Wider scan:** set `STOCKSAGE_INDIA_UNIVERSE` on Render. Try 100 first and watch the logs for failures.

### Roll back

Render: Deploys, pick the last good deploy, Rollback. Vercel: Deployments, Promote. The database keeps the new tables; v1 ignores them.

---

## Part 6. If something goes wrong

- **Site loads but data does not:** `ALLOWED_ORIGINS` is missing your site, or Render is asleep or still building.
- **Live prices do not move:** `VITE_WS_URL` is wrong or missing on Vercel; fix it and redeploy the site.
- **Journal rejects the key:** `OWNER_TOKEN` on Render differs from what you typed. The browser keeps the last key, so re-enter it.
- **History vanished after a deploy:** `DATABASE_URL` is unset, so the API fell back to SQLite on Render's temporary disk. Set it and redeploy.
- **`/ready` fails or times out:** wrong string, or the unpooled URL under load. Use the pooled one; check the Neon project is not suspended over quota.
- **AI says it is off:** `GROQ_API_KEY` is missing. A 429 means the free quota is used up; wait and retry.
- **No Telegram messages:** you never messaged your bot, or `TELEGRAM_CHAT_ID` is wrong. Alerts only ring during the session and once each.
- **Scans stop overnight:** the free Render instance went to sleep; add the uptime monitor (4.2).

---

## Part 7. Security checklist (reviewed 2026-11-24)

State at the last review: 215 backend tests and 17 frontend tests pass, `pip-audit`, `npm audit` and `bandit` are clean, and no secrets are in tracked files.

- Set `OWNER_TOKEN` on Render before the first public deploy. Empty means open.
- `.env` is git-ignored; never commit it. Only the `.env.example` files are tracked.
- **Known weakness, fix before sharing widely:** the rate limiter in `backend/main.py` trusts the first `X-Forwarded-For` value, which a caller can fake. The public `/stock/{ticker}/note` (spends Groq quota) and `/scan` routes can then be hammered. The fix is to trust only the address your own proxy appended, and to test it on the live Vercel to Render path.
- The owner key sits in the browser's `localStorage`. That is fine while the site renders no raw HTML (it does not); keep it that way.
- Run `pip-audit -r backend/requirements.txt` and `npm audit` now and then; CI does it on every pull request.

## Part 8. Before you share the link

- **Not licensed data.** Yahoo's endpoints are unofficial and exchange data may not be shown publicly without a licence. For a personal tool and a portfolio piece this is a limit to know about, not a blocker.
- **Public buy/sell levels in India.** Publishing specific calls with targets can fall under SEBI's research analyst rules. The site says it is not advice and labels setups unproven, but if you plan to promote it widely, take a short consultation first. The safe option is a portfolio demo plus the private pages for yourself.
- **Not done, and why:** a demo video (you record it; storyboard: Desk, a stock's odds terrain, Record, Journal), a custom domain (buy one, add it in Vercel under Domains, then add it to `ALLOWED_ORIGINS`), and multi-user accounts (the site is built for one owner with one key; real accounts need an auth provider and a rewrite of the private pages).
