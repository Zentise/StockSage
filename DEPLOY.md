# Deploying StockSage v2, and redeploying it later

Your live setup today: the API runs on Render (`stocksage-c8p6.onrender.com`), the site on Vercel (`thestocksage.vercel.app`), and Vercel forwards `/api/*` to Render (see `vercel.json`). Both rebuild by themselves when you push to the branch they watch (normally `main`).

**Pushing v2 replaces v1.** v1 kept its history only in memory, so the restart wipes it. The history is already saved in `backups/` and v2 imports it on first start.

## One-time setup (about 20 minutes)

### 1. A database that survives restarts (free)

1. Sign up at neon.tech, create a project, copy the connection string (starts with `postgresql://`).
2. Keep it for step 4. Tables and later column changes are created automatically on start.

### 2. Keys you need

| Name | What for | How |
|---|---|---|
| `GROQ_API_KEY` | AI notes, debate, chat | console.groq.com, free key |
| `OWNER_TOKEN` | Locks journal, alerts, chat, debate on the public site | `python -c "import secrets; print(secrets.token_urlsafe(32))"` and keep it in a password manager |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Alerts and the 8:45 brief (optional) | see README, "Private features and alerts" |

Do not paste any of these into a chat, a commit or a screenshot. If a key ever leaves your hands, revoke it and make a new one. The old NewsAPI key from v1 should be revoked now: v2 no longer uses it.

### 3. Save the live v1 history (done for you)

`backups/live-signals_2026-08-03_to_2026-11-23.json` is in the repo and imported automatically. Today's four v1 signals are in `backups/live-signals_2026-11-24_to_2026-11-24.json` for the archive. If you wait days before deploying, run `python scripts/export_live.py https://thestocksage.vercel.app/api <first-missing-date>` first and commit the new file.

### 4. Render (API)

Dashboard, your service, **Environment**:

- `DATABASE_URL` = the Neon string
- `GROQ_API_KEY`, `OWNER_TOKEN`
- `ALLOWED_ORIGINS` = `https://thestocksage.vercel.app` (add your own domain later, comma separated)
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` if you want alerts
- Start command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT --workers 1` (one worker, because the scan, alert and brief loops live in it)

**Free plans sleep after about 15 minutes without traffic, and a sleeping server scans and alerts nobody.** Either use a paid instance, or add a free monitor (UptimeRobot, cron-job.org) that requests `https://stocksage-c8p6.onrender.com/health` every 10 minutes.

### 5. Vercel (site)

Environment variable `VITE_WS_URL` = `wss://stocksage-c8p6.onrender.com/ws/prices` (Vercel cannot proxy WebSockets). It was already set for v1; keep it. If the project's root directory is `frontend`, `frontend/vercel.json` is the one used; the two files are the same.

### 6. Ship it

```bash
git checkout v2
python -m pytest -q && ruff check backend tests scripts      # must be green
cd frontend && npm test && npm run build && cd ..             # must be green
git push -u origin v2
```

Open a pull request `v2` into `main` on GitHub. CI runs the same checks plus the Docker build. When green, **merge**. Render and Vercel start building within a minute; Render takes a few minutes and the first scan runs about 5 minutes after it is up (the first scan after a fresh database also grades the imported history, so give it 10 to 15 minutes).

### 7. Check it worked

| Check | Expect |
|---|---|
| `https://stocksage-c8p6.onrender.com/health` | `{"status":"ok","version":"2.0.0"}` |
| `https://thestocksage.vercel.app/desk` | the 3D market and setup cards |
| `/record`, tab "Replay of past years" | the table of four kinds of setup, all "Not proven" or "Worse than random" |
| `/journal` | asks for the owner key; after unlocking, you can log a trade |
| Morning brief, "Send to Telegram" | a message arrives (if you set Telegram) |
| Render logs | `Imported 479 v1 signals`, then `Scan india: ...` |

### If something goes wrong

- **Site loads but data does not:** `ALLOWED_ORIGINS` missing your site, or the Render service is asleep or still building.
- **Live prices do not move:** `VITE_WS_URL` is wrong or missing on Vercel; redeploy the site after fixing it.
- **Journal says "private" and rejects the key:** `OWNER_TOKEN` on Render differs from what you typed; the browser keeps the last key, so re-enter it.
- **Roll back:** in Render, Deploys, pick the last good deploy, Rollback. In Vercel, Deployments, Promote. The database keeps the new tables; v1 ignores them.

## Redeploying later with changes

Every change follows the same loop. Nothing here needs the dashboards except when you add a setting.

1. **Branch** off `main`: `git checkout -b my-change`.
2. **Change and run locally**: `python run.py` (API) and `cd frontend && npm run dev` (UI at http://localhost:5173).
3. **If you changed the API** (anything in `backend/schemas.py` or a route): `python scripts/export_openapi.py && cd frontend && npm run gen:api`. Commit the regenerated `openapi.json` and `schema.d.ts`; CI fails if they drift.
4. **Check**: `python -m pytest -q`, `ruff check backend tests scripts`, `cd frontend && npm test && npm run build`.
5. **Push and open a pull request**; wait for CI to go green; merge. Render and Vercel redeploy by themselves.
6. **If you added a setting**, add it in Render (API) or Vercel (site) *before* merging, then merge.
7. **Look at the checks table above** after each deploy; it takes two minutes.

Notes for specific kinds of change:

- **Database changes:** a new table appears by itself. A new column on an old table needs a line in `_add_missing_columns` in `backend/db.py` (as `setup` has), otherwise the old database will not get it. Never edit the database by hand on Neon without a copy.
- **A new strategy:** add it to `REGISTRY` in `backend/engine/strategies.py`, add a test, then run `python -m backend.replay india us` (about 10 minutes) and commit the refreshed `backend/data/replay.json`. It shows as "unproven" until it clears the replay bar.
- **Refresh the replay about monthly,** the same way, so the Record page stays current.
- **AI changes** (model, prompts): run `python -m backend.evals --live TCS.NS RELIANCE.NS` first; it must pass, and it saves `evals/last_run.json` to compare against.
- **Dependencies:** Dependabot-style bumps go through the same loop; CI runs `pip-audit` and `npm audit`.
- **Widening to Nifty 200 or 500:** set `STOCKSAGE_INDIA_UNIVERSE` on Render. A scan then makes many more price requests and takes longer; try 100 first and watch the logs for failures.

## Before you share the link with other people

- **This is not licensed data.** Yahoo's endpoints are unofficial and exchange data may not be shown publicly without a licence. For a personal tool and a portfolio piece that is a limit to be aware of, not a blocker.
- **Public buy/sell levels in India.** Publishing specific buy or sell calls with targets to the public can fall under SEBI's research analyst rules. The site says it is not advice and labels setups as unproven, but if you plan to promote it widely, take a short consultation first. The safe option is to keep the site as a portfolio demo and use the private pages yourself.
- **Not done and why:** a demo video (it has to be recorded by you; the pages in the README screenshots are the storyboard: Desk, a stock's odds terrain, Record, Journal), a custom domain (buy one, add it in Vercel under Domains, then add it to `ALLOWED_ORIGINS`), and multi-user accounts (the site is built for one owner with one key; real accounts need an auth provider and a rewrite of the private pages).
