# Vercel frontend and Render backend

The repository includes `vercel.json`, `render.yaml` and a hosted startup command. Vercel serves the frontend and forwards `/api/*` requests to Render. Render runs the Node application with one persistent SQLite disk. Publishing is complete only after both providers report successful deployments and the production URLs pass the checks below. Configuration files alone do not establish a live deployment.

## Render

Connect the GitHub repository and use its Blueprint (`render.yaml`). The Blueprint requests one Starter Node web service in Singapore and a 1 GB persistent disk mounted at `/var/data`. These are paid Render resources; confirm the account's current quoted cost before creating them. A free service without a persistent disk does not preserve this application's database across restarts.

The service uses Node 24.19.0, builds with `npm ci --include=dev && npm run build`, starts with `npm run start:hosted`, and checks `/healthz`. Render supplies `PORT`. Keep `HOST=0.0.0.0`, `NODE_ENV=production`, and `DATABASE_PATH=/var/data/intelligence.sqlite`. Run one instance: the research queue and native SQLite binding are designed for one application process.

`API_TOKEN` is generated privately by Render. Treat it as the owner's workspace access key; share it privately with intended users. Never commit it, put it in a URL, use a `VITE_` variable, or embed it in frontend code. Enter the exact production Vercel origin into `CLIENT_ORIGINS`, for example `https://your-project.vercel.app`. Additional explicitly trusted origins may be comma-separated; wildcards are not supported.

Hosted startup validates the configuration, imports the reviewed dataset on a new disk, and applies additive reviewed-data updates on subsequent starts. Authored content, analyst notes, workflow progress and immutable evidence versions take precedence. The local working database and its analyst history are excluded from GitHub. A new cloud disk starts with the reviewed source dataset; migrating local runtime history requires a separate private database transfer.

## Vercel

Import the same GitHub repository as a Vite project. The repository configures `npm ci`, `npm run build` and output directory `dist`. The `api/[...path].ts` Node function relays API traffic to Render without storing an access key on Vercel.

Set **server-only** `RENDER_API_URL` to the Render service origin, for example `https://your-service.onrender.com`, then redeploy. Use the origin alone, without `/api`, query parameters or credentials. For each Vercel environment, configure a backend and its exact trusted origin deliberately; arbitrary preview deployments do not inherit mutation access.

## Sign-in and access

Open the production Vercel URL and enter the private workspace access key. Authentication uses an eight-hour signed, HttpOnly, Secure, SameSite=Lax cookie. Reloads, exports and writes use the same session. Sign-out clears the browser cookie; changing `API_TOKEN` revokes all existing sessions. This is one shared owner key, not individual user accounts or role-based access. Login has a bounded per-process limit of eight unsuccessful attempts per 15 minutes. Restarting resets that in-memory limit.

Existing authenticated API clients can continue using `Authorization: Bearer <API_TOKEN>`. `/healthz` is intentionally public and returns only service status. Account, evidence, research, export and mutation endpoints require authentication when a key is configured. Cross-origin mutations require an exact allowed origin. TLS is required for cloud use. Do not disable authentication to obtain a publicly viewable workspace.

## Production verification

1. Confirm a clean install, build, full HTTP-enabled test suite and corpus validation pass.
2. Confirm Render reports healthy and a Vercel request without a session cannot retrieve account or export data.
3. Sign in through Vercel; inspect the account directory, an opportunity, sources and an export.
4. Save a clearly identified temporary analyst change, restart Render, and confirm it survives. Remove only that temporary change through an audited workflow where supported.
5. Confirm sign-out prevents further API access in that browser and no access key appears in the generated frontend or repository.
6. Record the actual repository revision and both actual provider URLs after successful checks.

## Persistence, backup and recovery

SQLite uses foreign keys, WAL and a five-second busy timeout. Use SQLite's online backup API for a running database, or stop the process cleanly before copying it. Copying only a live main file can omit changes still in its WAL. Keep backups outside the application disk. Render's disk snapshots are an additional recovery mechanism, not an application-level verified SQLite backup.

Numbered migrations in `server/migrations/` apply once and record their version transactionally. Add migrations rather than rewriting applied ones. Source updates retain analyst changes; back up before changing reviewed data. Interrupted research runs recover as partial with a restart message; queued runs resume. No recurring external refresh is enabled.

## Local demonstration

`npm ci`, `npm run seed`, `npm run build`, then `npm start` serves the complete application at `http://127.0.0.1:3001`. The loopback default requires no key. Optional `.env` configuration is loaded by the regular server entry point. Hosted providers supply their variables directly. `.env*`, `storage/`, `dist/`, `node_modules/` and `.vercel/` are excluded from Git, except the safe `.env.example` template.

References: [Render persistent disks](https://render.com/docs/disks), [Render Blueprint specification](https://render.com/docs/blueprint-spec), and [Vercel Node functions](https://vercel.com/docs/functions/runtimes/node-js).
