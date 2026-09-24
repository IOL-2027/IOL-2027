# IOL 2027 Registration Backend

This backend is the PostgreSQL API for the Team Leader registration system. It does not process payments. It only stores transfer instructions/status, accepts proof uploads, and lets Finance review them later.

## Local Setup

1. Copy `.env.example` to `.env`.
   Add `RESEND_API_KEY` and a verified `EMAIL_FROM` address to deliver verification emails. Without them, development responses include the code instead.
2. Start PostgreSQL:

```sh
docker compose up -d postgres
```

3. Apply schema and seed data:

```sh
npm run db:schema
npm run db:seed
```

4. Start the API:

```sh
npm run dev:api
```

The API listens on `http://localhost:4000` by default.

## Main Endpoints

- `GET /api/health`
- `GET /api/registration/options`
- `POST /api/registration/invite/verify`
- `POST /api/registration/team-leader-account`
- `POST /api/registration/accounts/:accountId/request-email-verification`
- `POST /api/registration/accounts/:accountId/verify-email`
- `GET /api/registration/delegations/:delegationId`
- `PATCH /api/registration/delegations/:delegationId`
- `POST /api/registration/delegations/:delegationId/members`
- `PATCH /api/registration/members/:memberId`
- `DELETE /api/registration/members/:memberId`
- `POST /api/registration/delegations/:delegationId/teams`
- `PATCH /api/registration/teams/:teamId`
- `POST /api/registration/delegations/:delegationId/travel`
- `PATCH /api/registration/travel/:travelRecordId`
- `POST /api/registration/delegations/:delegationId/payment-proof`
- `POST /api/registration/members/:memberId/guardian-consent`
- `POST /api/registration/members/:memberId/badge`
- `POST /api/registration/check-in/scan`
- `GET /api/registration/admin/dashboard`

Country is taken from the invitation and cannot be changed through the registration update endpoint. Creating the account also creates the Team Leader member record, so the leader's identity is not entered twice.

Travel records are intentionally separate and can be completed later after the first registration submission. Guardian consent upload support exists, but the requirement remains disabled in the UI until the organiser confirms the policy.

Badge issuance returns a QR image containing a random public ID and secret. It never places personal information in the QR. Scan events store the member, checkpoint, result, operator account when supplied, and timestamp.
