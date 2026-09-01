# Deploying ToolFence to Vercel

**Currently deployed at https://toolfence-omega.vercel.app** (project `toolfence`, production
branch `claude/hackathon-2026-top-10-wz1vg2`). Every push to that branch redeploys automatically.

The repository is an npm workspace. `apps/web` is the deployable Next.js app; `packages/core` is
compiled in place by `transpilePackages`, so there is no build step to add and no package to publish.

One generated file matters: `apps/web/public/toolfence.js`, the injectable bundle behind `/foreign` and
the bookmarklet. It is built by `npm run build:inject` (esbuild, no config file) and **is committed**,
so a Vercel build rooted at `apps/web` — which never runs the workspace root's scripts — still serves a
current copy. Rebuild and commit it whenever `packages/core` changes.

## 1. Import the repository

1. Push the branch you want to deploy to GitHub.
2. In Vercel, **Add New → Project → Import Git Repository**, and pick this repo.
3. Vercel detects Next.js. Change exactly one setting:

| Setting | Value |
|---|---|
| Framework preset | Next.js |
| **Root Directory** | `apps/web` |
| Build command | *(leave default: `next build`)* |
| Install command | *(leave default — npm installs the whole workspace from the repo root)* |
| Output directory | *(leave default)* |
| Node.js version | 20.x or 22.x |

The Root Directory setting is the only thing that is easy to get wrong. Leave "Include files outside
the root directory" **enabled** — the app imports `packages/core`.

Hackathon Vercel credit code: `OAIWEBMH-9E2F-MUT4` (apply it under **Settings → Billing**).

## 2. Environment variables

Everything works with **no** environment variables. Only the optional AI naming pass reads any.

| Variable | Required | Effect |
|---|---|---|
| `OPENAI_API_KEY` | No | Enables `/api/enrich`. Without it the route returns **501** and the UI stays in heuristic mode with an explanatory message. |
| `OPENAI_MODEL` | No | Overrides the model used by `/api/enrich`. Defaults to `gpt-4o-mini`. |

Add them under **Settings → Environment Variables** for the Production environment, then redeploy.
Never commit a key: `.env` and `.env.local` are gitignored.

## 3. Deploy

Press **Deploy**. First build is typically 1–2 minutes. Vercel gives you
`https://<project>.vercel.app`; the playground is at `/playground`.

## 4. Post-deploy checklist

Run all nine. Items 4, 5 and 8 are the ones that decide the demo.

1. **Live URL loads.** `https://<project>.vercel.app` returns the landing page with no console errors.
2. **Playground loads.** `/playground` renders the dashboard and the inspector side by side, and the
   tool count is greater than zero within a second of load.
3. **Incognito works.** Open both URLs in a private window with no extensions. Nothing may depend on a
   logged-in Vercel session or on local storage.
4. **The firewall stops a destructive call.** Open `delete_invoice` → **Call tool** with an invoice
   identifier from the table. The consent dialog must appear, the row must survive **Deny**, and the
   audit log must show `denied by user`.
5. **The scripted run reaches consent.** Press **Run agent script**. The transcript must show
   `filter_invoices` and `list_invoices` completing, then stop at the consent dialog for the delete.
6. **Repository is public and readable.** Open the GitHub URL in incognito: the README renders, the
   screenshots in `docs/screenshots/` load, and `LICENSE` is visible and identified by GitHub as MIT.
7. **AI mode degrades correctly.** With no `OPENAI_API_KEY` set, toggle **AI naming → Turn on**. The
   panel must say AI mode is not configured and the tools must keep working. `curl -X POST
   https://<project>.vercel.app/api/enrich -H 'content-type: application/json' -d '{"tools":[]}'`
   returns `501`, not `500`.
8. **The third-party page still works.** Open `/foreign`, press **Inject ToolFence**, and confirm the
   panel reports nine tools. Open `refund_order_for_ticket`, choose a ticket, press **Call tool**: the
   consent dialog must appear and **Deny** must leave the ticket unrefunded. Then check
   `https://<project>.vercel.app/toolfence.js` returns 200 with `content-type: application/javascript`.
9. **Mobile and keyboard.** Load `/playground` at 390px wide: the table scrolls horizontally inside its
   own container and the page body does not. Tab to a destructive tool, activate it with the keyboard,
   and confirm the consent dialog takes focus and that **Escape** denies it.

## Deploying somewhere else

Nothing here is Vercel-specific. Any host that runs Next.js 15 works:

```bash
npm install
npm run build          # builds apps/web
npm start              # next start, port 3000
```

For a container, build from the repo root so the workspace resolves, and run `next start` from
`apps/web`. The only server-side code is `/api/enrich`, which is optional — a fully static export is
not supported only because that route exists; delete it and the app is static.

## Troubleshooting

Two of these were hit for real while deploying this project, and both are fixed in the repository —
they are listed so the cause is obvious if you fork it and reintroduce one.

| Symptom | Cause | Fix |
|---|---|---|
| `Module not found: Can't resolve '@/components/...'` — compiles locally, fails on Vercel | The `@/*` tsconfig path alias is not resolved identically in both environments | Already fixed: the app uses relative imports and declares no `paths` |
| `next build` prints `✓ Compiled successfully`, then exits 1 at "Linting and checking validity of types" with no error | Vercel installs only `apps/web`'s dependencies, so a `typescript` declared solely at the workspace root is missing | Already fixed: `typescript` and `@types/node` are declared in `apps/web/package.json` |
| `Module not found: @toolfence/core` | Root Directory set to the repo root, or files outside the root excluded | Set Root Directory to `apps/web` and enable including files outside it |
| Build fails resolving `./scanner` | An install that skipped workspaces | Delete the Vercel build cache and redeploy |
| `/foreign` injects but no panel appears | `public/toolfence.js` is stale or missing from the deploy | Run `npm run build:inject` and commit the result; the file is served from `apps/web/public` |
| The bookmarklet does nothing on someone else's site | That site sends a strict `script-src` CSP | Expected, and documented. The browser is refusing an injected script — import `packages/core` into that app instead |
| Tool count is 0 on the deployed site | The app root selector did not match | Confirm `InvoiceApp` still renders `id="invoice-app"`; `useToolFence("#invoice-app")` scans that subtree |
| Banner never turns green | The browser has no WebMCP | Expected. Enable `chrome://flags/#enable-webmcp-testing`, or use **Run agent script** — same firewall path |
