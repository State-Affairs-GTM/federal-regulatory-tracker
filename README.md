# Federal Regulatory Intelligence

Non-integrated enterprise prototype for tracking federal financial industry regulators. Pulls live data from the Federal Register API (no key, no backend). Designed to be embedded as an iframe inside a custom tab on SA Pro for a single enterprise client.

**Repo:** `State-Affairs-GTM/federal-regulatory-tracker`
**Live demo:** _add Vercel URL after first deploy_

---

## What this is — and isn't

This is a self-contained web app that lives outside SA Pro's database and renders inside an iframe in a custom left-rail tab (the pattern we already use for Gongwer and Mass).

**In scope**
- 7 financial regulators pre-configured: OCC, Fed, FDIC, CFPB, FinCEN, OFAC, Treasury
- "Browse all Federal Register" toggle for everything else
- Filter by agency, doc type (Final Rule / Proposed Rule / Notice / Presidential), date range, full-text search
- "Comments open only" toggle with countdown badges
- Pin rules locally (browser localStorage — per-user, per-device for the demo)
- Direct download of PDF / HTML / plain text per rule
- Styled to match SA Pro's visual language so it feels native inside the iframe

**Out of scope (by design)**
- Press releases — those flow through the existing WordPress → `articles` table pipeline per Solo
- Auth — Pro's session handles access to the surrounding tab
- Persistent backend — Phase 2 work
- Saved searches / email alerts — Phase 2 work

---

## Local dev

```bash
npm install
npm run dev
```

Opens at http://localhost:5173

---

## Deploy to Vercel

**Recommended path — GitHub + Vercel dashboard:**

1. Push to `State-Affairs-GTM/federal-regulatory-tracker` on GitHub
2. Go to https://vercel.com/new
3. Import the repo (you may need to grant Vercel access to the State-Affairs-GTM org first)
4. Vercel auto-detects Vite — accept defaults
5. Deploy. You'll get a URL like `federal-regulatory-tracker.vercel.app`

Every push to `main` redeploys production automatically. PR branches get preview URLs.

### Environment variables (Vercel)

The "Request an agency" modal calls a Vercel serverless function (`/api/request-agency`) that sends mail via [Resend](https://resend.com). Add these in **Vercel → Settings → Environment Variables**:

- `RESEND_API_KEY` — your Resend API key
- `RESEND_FROM` — optional override of the From header, e.g. `Reg Tracker <noreply@stateaffairs.com>`. Default is `Reg Tracker <noreply@stateaffairs.com>` (requires the sending domain to be verified in Resend).

Requests are sent to `enterprise@stateaffairs.com` (hard-coded in `api/request-agency.js`). The function will return a 500 with `RESEND_API_KEY not configured` if the env var is missing.

For local testing of the API route, use `vercel dev` instead of `npm run dev` (Vite alone won't route `/api/*`).

**CLI alternative:**

```bash
npm install -g vercel
vercel login
vercel              # preview deploy
vercel --prod       # production deploy
```

---

## Custom subdomain

Once deployed: Vercel project → Settings → Domains → add `reg.stateaffairs.com` (or whatever subdomain we want) → add the CNAME to SA DNS. Takes ~5 minutes once DNS is in place.

---

## Embed in SA Pro

```html
<iframe
  src="https://reg.stateaffairs.com"
  width="100%"
  height="100%"
  style="border: 0; display: block;"
  title="Federal Regulatory Intelligence">
</iframe>
```

The `vercel.json` already sets headers permitting iframing from any origin. Once we're confident about the embed origin, lock it down by editing `vercel.json`:

```json
{ "key": "Content-Security-Policy", "value": "frame-ancestors https://pro.stateaffairs.com https://*.stateaffairs.com" }
```

---

## Data source

Federal Register REST API v1 — no auth, no key, CORS-enabled, updated daily by the Office of the Federal Register. Rate limit is generous (~5 req/sec) and we're well under it.

Docs: https://www.federalregister.gov/developers/documentation/api/v1

---

## Stack

- React 18 + Vite 5
- lucide-react for icons
- Inter (Google Fonts)
- Direct browser → Federal Register API calls (no backend)
- Pinned items persist in `localStorage` per browser

---

## Phase 2 wishlist (not built)

- Saved searches + email alerts
- CFR cross-referencing — "show me all rules touching 12 CFR 225"
- Regulations.gov comment-docket integration
- Real backend so pinned items persist across devices
- SSO into SA Pro user session so pinned state ties to the user, not the browser
- Agency hierarchy (Treasury parent → OCC, OFAC, FinCEN children)
- Move data ingestion server-side so we can join against state-level bill data later

---

## Team

Built by the Data Operations team for an enterprise GTM proof-of-concept. Questions → Cody.
