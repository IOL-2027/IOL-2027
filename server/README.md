# IOL 2027 Registration Backend

Express + PostgreSQL API for the Team Leader registration system. It does not process payments: it stores invoice details and transfer status, accepts proof uploads, and lets Finance approve or return them.

Roles, permissions and the test accounts are described in [docs/ROLES.md](../docs/ROLES.md). The plan for everything still to build is in [docs/IMPLEMENTATION_PLAN.md](../docs/IMPLEMENTATION_PLAN.md).

## Where it runs

| | Site | API |
| --- | --- | --- |
| Local | `npm run dev` → http://localhost:5180 | `npm run dev:api` → http://localhost:4000 (Vite proxies `/api`) |
| Development | https://iol2027-dev.web.app | Cloud Run `iol2027-api` (asia-southeast1), reached through the Firebase rewrite `/api/**` on the dev target only |
| Public site | https://iol2027.web.app | None yet. The portal shows "Registration opens on 18 January 2027". |

The site and API always share an origin, so the session cookie needs no CORS. Firebase Hosting only forwards a cookie named `__session`, which is why the session cookie has that name.

Database: database `iol2027` on Cloud SQL instance `research-trend-analysis:asia-southeast1:papertrend-pg`, login `iol2027_app`. The connection string is the secret `iol2027-database-url` in project `iol2027`. Uploads go to the private bucket `gs://iol2027-registration-uploads`. The service runs as `iol2027-api@iol2027.iam.gserviceaccount.com`.

## Local setup

1. Copy `.env.example` to `.env` and set `DATABASE_URL`. Either run Postgres locally (`docker compose up -d postgres`) or reach the Cloud SQL database through the proxy:

   ```sh
   cloud-sql-proxy research-trend-analysis:asia-southeast1:papertrend-pg --port 55432 --gcloud-auth
   ```

2. Create or update the tables, then load the test accounts:

   ```sh
   npm run db:migrate
   TEST_ACCOUNT_PASSWORD=... npm run db:seed-test
   ```

   `db:migrate` applies `schema.sql` and then every new file in `migrations/`. `db:seed-test` only touches test data (`@iol2027.test` accounts, `TEST` invite codes and countries, and accounts made with those codes), so it is safe to rerun to reset it; that includes putting the demo Team Leader (Demoland) back at the start. Add `DEMO_LEADER_EMAIL=<real inbox>` to have the demo's emails delivered (docs/ROLES.md). The shared password is in Secret Manager: `gcloud secrets versions access latest --secret=iol2027-test-account-password --project=iol2027`.

3. Start the API with `npm run dev:api` and the site with `npm run dev`.

Without `GMAIL_USER` and `GMAIL_APP_PASSWORD` (or a Resend key), emails are recorded as "queued" and not sent. Set `EXPOSE_DEV_CODES=true` to have the API return email verification codes so the sign-up flow can be tested. Never set it on the public deployment.

## Tests

With the API running and the test data freshly seeded:

```sh
BASE=http://localhost:4000 PW=... npm run test:api
npm run db:seed-test   # the suite changes the Thailand test data, so reset it afterwards
```

The suite covers sign-in, lockout, every role's access, the payment gate, fees, submission checks and Finance review.

## Deploying the API

From the repository root (the root `Dockerfile` builds the static site; the API uses `server/Dockerfile`):

```sh
gcloud builds submit --config server/cloudbuild.yaml --substitutions=_TAG=$(git rev-parse --short HEAD) --project iol2027 --region asia-southeast1
gcloud run deploy iol2027-api --project iol2027 --region asia-southeast1 \
  --image asia-southeast1-docker.pkg.dev/iol2027/registration/api:<tag> \
  --service-account iol2027-api@iol2027.iam.gserviceaccount.com \
  --add-cloudsql-instances research-trend-analysis:asia-southeast1:papertrend-pg \
  --set-secrets DATABASE_URL=iol2027-database-url:latest,GMAIL_APP_PASSWORD=iol2027-gmail-app-password:latest,BADGE_SIGNING_KEY=iol2027-badge-signing-key:latest \
  --set-env-vars NODE_ENV=production,UPLOAD_BUCKET=iol2027-registration-uploads,EXPOSE_DEV_CODES=true,DB_POOL_MAX=5,PORTAL_URL=https://iol2027-portal.web.app,GMAIL_USER=iol2027.th@gmail.com \
  --allow-unauthenticated --min-instances 0 --max-instances 2 --memory 512Mi
```

The API is reached through the registration portal's Firebase rewrite (`/api/**` on https://iol2027-portal.web.app), so it shares the portal's origin and its `__session` cookie; the public website has no API behind it. `PORTAL_URL` is where links in emails point. Run `npm run db:migrate` (through the proxy) before deploying code that needs a new migration. Email goes out from iol2027.th@gmail.com through Gmail when `GMAIL_USER` and `GMAIL_APP_PASSWORD` (secret `iol2027-gmail-app-password`) are set, as they are on the dev server. Addresses ending in `.test` are never sent. `BADGE_SIGNING_KEY` (secret `iol2027-badge-signing-key`) derives each badge's QR secret, so the same QR can be drawn again for printed badges; changing it makes every issued QR unreadable until it is reissued. Environment and secrets set with `gcloud run services update` stay on later deploys. See [docs/EMAIL_SETUP.md](../docs/EMAIL_SETUP.md).

## Endpoints

Every route except the public ones checks the session and the caller's role, and Team Leaders can only reach their own delegation. Every write needs the header `X-IOL-Request: 1`.

Public
- `GET /api/health`, `GET /api/registration/options`
- `POST /api/registration/invite/verify`, `POST /api/registration/team-leader-account`
- `GET /api/auth/me`, `POST /api/auth/login`, `POST /api/auth/logout`
- `POST /api/auth/verify-email/request`, `POST /api/auth/verify-email` (signed in, unverified)
- `POST /api/auth/password-reset/request` (always answers 202, so it cannot reveal accounts), `POST /api/auth/password-reset/confirm`

Team Leader (own delegation; admins can open any)
- `GET|PATCH /api/registration/delegations/:delegationId`
- `PUT /api/registration/delegations/:delegationId/invoice` (saves the invoice details; the first save numbers the invoice IOL2027/n), `GET …/invoice` (the invoice PDF), `POST …/payment-proof`
- `POST …/teams`, `PATCH /api/registration/teams/:teamId`
- `POST …/members`, `PATCH|DELETE /api/registration/members/:memberId`, `POST …/guardian-consent`
- `POST …/travel`, `PATCH /api/registration/travel/:travelRecordId`
- `POST …/submit` (409 with a `missing` list until people, teams, payment and stay dates are complete)
- `GET /api/registration/attachments/:attachmentId` (`?inline=1` to preview in the page)

Participant
- `GET /api/participant/me`

Staff (routes in `admin.js`)
- `GET /api/admin/dashboard`, `GET /api/admin/delegations`, `GET /api/admin/payments`
- `POST /api/admin/payments/:paymentId/approve|reject` (Finance; approval issues the receipt number)
- `GET /api/admin/people` (status of every person; missing details only for the registration team)
- `GET /api/admin/welfare` (Welfare; no passport data)
- `GET|POST /api/admin/invites`, `PATCH /api/admin/invites/:inviteId`, `POST /api/admin/invites/:inviteId/send` (Registration admin)
- `GET /api/admin/exports`, `GET /api/admin/exports/:kind` (CSV; which kinds depends on the role)
- `GET /api/admin/audit`, `GET /api/admin/email-deliveries` (Registration admin): newest first, 50 a page; `?limit=` and `?offset=` page through, and the reply includes `total`
- `GET /api/admin/settings`, `PUT /api/admin/settings/fees` (Finance), `PUT /api/admin/settings/invoice` (Finance: who the invoice is from and the bank account), `GET /api/admin/settings/invoice-sample` (a sample invoice PDF), `PUT /api/admin/settings/guardian-consent` (Registration admin)
- `GET|POST /api/admin/accounts`, `PATCH /api/admin/accounts/:accountId` (role, disabled), `POST /api/admin/accounts/:accountId/setup-code` (Super admin; changes sign that person out)
- `POST /api/registration/members/:memberId/badge`; `POST /api/registration/check-in/lookup` (whose badge a code is, and its latest check-ins) and `POST /api/registration/check-in/scan` (Check-in staff, Registration admin)
- `GET /api/admin/badges`, `GET /api/admin/badges/print` (PDF: `layout` shop, a4 or preview; the same filters as the list, or one `id`), `POST /api/admin/badges/printed`, `POST /api/admin/badges/:badgeId/new-qr`, `POST /api/admin/event-staff`, `PATCH|DELETE /api/admin/event-staff/:staffId`, `PUT /api/admin/settings/badges` (print cut-off) (Registration admin)

Country comes from the invitation and cannot be changed. Creating the account also creates the Team Leader's member record, so their identity is not entered twice. People can be saved with only a display name and completed in stages; completeness (and guardian consent, when the policy is on) is checked on submission. Fees are calculated on the server from the `settings` table, with defaults in `fees.js`.

Code layout: `index.js` (accounts, registration, check-in), `admin.js` (back office), `badges.js` (badge codes and the QR email), `badge-admin.js` (the Badges section), `badge-pdf.js` (the printed badge), `lib.js` (database helpers), `codes.js` (emailed codes), `auth.js` (sessions and roles), `fees.js` (fees and organiser settings), `email.js` (templates and sending), `storage.js` (uploads).

A badge's QR is a link, `<PORTAL_URL>/b#<public id>.<secret>`: a random public ID and secret, never personal information. Scan events store the person (delegation member or event staff), checkpoint, result, operator account and timestamp. The QR is printed with the domain in `PORTAL_URL`, so set it to the final portal address before the print run. Badge PDFs use Manrope and Noto Sans (Latin, Greek, Cyrillic, Vietnamese) and Noto Sans Thai, in `assets/fonts` with their licences.
