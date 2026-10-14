# Roles and test accounts

Every signed-in user has exactly one role. Permissions follow least privilege: a role sees only the data its job needs, which matters because most participants are minors and the system holds passport, health and emergency-contact data (PDPA).

The source requirements list Guest, Team Leader and Admin, and later Super Admin, Registration admin, Finance admin, Check-in admin and Viewer. The roles below split "Admin" further so that sensitive data stays with the people who need it.

## Roles

| Role (code) | Who | What they can do | What they cannot see |
| --- | --- | --- | --- |
| **Guest** (no account) | Public visitors | Read the public website | Anything behind login |
| **Team Leader** (`team_leader`) | One per country, created with that country's invite code | Manage **their own** delegation: team counts, payment details and proof, teams, people, travel, submission | Any other country's data; staff tools |
| **Participant** (`participant`) | Contestants and observers, invited by their Team Leader (planned) | See their own record, badge and invitation letter status | Other people's records, including their teammates' sensitive fields |
| **Registration admin** (`registration_admin`) | Registration team | View and edit every delegation, issue badges, read the email log, manage invite codes | Payment approval (Finance only) |
| **Finance admin** (`finance_admin`) | Finance team | Payment review queue, approve or reject proofs, see amounts and contacts | Passport numbers, health and food notes, emergency contacts |
| **Check-in staff** (`checkin_staff`) | Event-week desk volunteers | Scan badges and search people by name | Passport numbers, health notes, payment data |
| **Welfare staff** (`welfare_staff`) | Welfare, food and medical team | Read food, medical, accessibility and emergency-contact data for everyone | Payment data; cannot edit registrations |
| **Content editor** (`content_editor`) | PR and web content | News and gallery (once built) | All participant data |
| **Results staff** (`results_staff`) | Scoring team | Enter and publish scores (once built) | All participant personal data |
| **Viewer** (`viewer`) | Committee members who need numbers | Read-only dashboard totals | All personal data |
| **Super admin** (`super_admin`) | Web/Dev leads | Everything, including assigning roles | Nothing hidden; use only for administration |

## Permission matrix

| Action | TL | Participant | Reg. admin | Finance | Check-in | Welfare | Viewer | Super admin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Read own delegation | ✅ | own record | ✅ all | ✅ all, no sensitive fields | | ✅ all, read-only | | ✅ |
| Edit delegation, teams, people, travel | own | | ✅ | | | | | ✅ |
| Upload payment proof | own | | ✅ | | | | | ✅ |
| Submit registration | own | | ✅ | | | | | ✅ |
| Approve or reject payments | | | | ✅ | | | | ✅ |
| Dashboard totals | | | ✅ | ✅ | | | ✅ | ✅ |
| List all delegations | | | ✅ | ✅ | | ✅ | | ✅ |
| Issue badges | | | ✅ | | | | | ✅ |
| Scan badges at check-in | | | ✅ | | ✅ | | | ✅ |
| Email delivery log | | | ✅ | | | | | ✅ |
| Passport numbers | own | own | ✅ | | | | | ✅ |
| Food, medical, emergency contact | own | own | ✅ | | | ✅ | | ✅ |
| Manage roles | | | | | | | | ✅ |

The API enforces this matrix on every request (`server/auth.js`). Hiding a button in the UI is never the protection.

## Sessions

- Signing in sets an `HttpOnly`, `Secure`, `SameSite=Lax` cookie. JavaScript on the page cannot read it.
- A session ends after **2 hours without activity** or **7 days** in total, whichever comes first.
- Changing requests (anything other than reading) must carry the `X-IOL-Request` header, which blocks cross-site form attacks.
- Only a hash of the session token is stored in the database, so a database leak does not expose live sessions.
- Five wrong passwords for the same email within 15 minutes blocks further attempts for 15 minutes.

## Test accounts

These exist **only on the development environment**. Sign in at https://iol2027-dev.web.app/registration/team-leader. They use the reserved `.test` domain, so no real email is ever sent to them.

| Role | Email | Linked to |
| --- | --- | --- |
| Team Leader | `tl.thailand@iol2027.test` | Delegation **Thailand (TEST)** |
| Team Leader | `tl.japan@iol2027.test` | Delegation **Japan (TEST)**, to check one country cannot see another |
| Participant | `participant.thailand@iol2027.test` | A contestant in Thailand (TEST) |
| Registration admin | `admin@iol2027.test` | |
| Finance admin | `finance@iol2027.test` | |
| Check-in staff | `checkin@iol2027.test` | |
| Welfare staff | `welfare@iol2027.test` | |
| Content editor | `content@iol2027.test` | |
| Results staff | `results@iol2027.test` | |
| Viewer | `viewer@iol2027.test` | |
| Super admin | `superadmin@iol2027.test` | |

**Password:** all test accounts share one password, stored in Google Secret Manager as `iol2027-test-account-password` in project `iol2027`. Read it with:

```bash
gcloud secrets versions access latest --secret=iol2027-test-account-password --project=iol2027
```

It is never committed to the repository. Recreate or reset the accounts with `npm run db:seed-test` (see `server/README.md`).

### Test invite codes

Unused codes for trying the full sign-up flow from scratch. Each works once; `npm run db:seed-test` makes them unused again. Until emails are switched on, the dev site shows the 6-digit email code on screen.

| Code | Country |
| --- | --- |
| `IOL2027-TST-0001` | Testland (TEST) |
| `IOL2027-TST-0002` | Sampleland (TEST) |
