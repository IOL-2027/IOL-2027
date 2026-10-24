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
| Invitation codes: create, send, revoke | | | ✅ | | | | | ✅ |
| People status list (all countries) | | | ✅ with missing details | ✅ names and stage | ✅ names and stage | | | ✅ |
| Open any country's registration and edit it | | | ✅ | | | | | ✅ |
| Exports (CSV) | | | people, countries, payments, travel, check-ins, welfare | countries, payments | check-ins | welfare | | ✅ all |
| Activity log | | | ✅ | | | | | ✅ |
| Fees (settings) | | | read | ✅ edit | | | | ✅ |
| Guardian consent policy | | | ✅ edit | | | | | ✅ |
| Scan badges at check-in | | | ✅ | | ✅ | | | ✅ |
| Email delivery log | | | ✅ | | | | | ✅ |
| Passport numbers | own | own | ✅ | | | | | ✅ |
| Food, medical, emergency contact | own | own | ✅ | | | ✅ | | ✅ |
| Manage roles; create and disable staff accounts | | | | | | | | ✅ |
| Reset own password | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

The API enforces this matrix on every request (`server/auth.js`). Hiding a button in the UI is never the protection.

## Sessions

- Signing in sets an `HttpOnly`, `Secure`, `SameSite=Lax` cookie. JavaScript on the page cannot read it.
- A session ends after **2 hours without activity** or **7 days** in total, whichever comes first.
- Changing requests (anything other than reading) must carry the `X-IOL-Request` header, which blocks cross-site form attacks.
- Only a hash of the session token is stored in the database, so a database leak does not expose live sessions.
- Five wrong passwords for the same email within 15 minutes blocks further attempts for 15 minutes.
- **Forgot your password?** sends a 6-digit code (valid 30 minutes). Five wrong guesses retire the code. Setting a new password signs the account out everywhere else and counts as email verification.
- **New staff accounts** are created by a super admin with a role and no usable password. The person receives a setup code (valid 7 days) and sets their own password through "Forgot your password?". Team Leaders never get accounts this way; they use an invitation code.
- A super admin can **disable** an account; that signs the person out and blocks sign-in until it is enabled again.

## Test accounts

These exist **only on the development environment**. Team Leaders sign in at https://iol2027-portal.web.app and staff at https://iol2027-portal.web.app/staff (either page works for any account; the role decides what opens). The badge scanner is at https://iol2027-portal.web.app/check-in. Until launch the portal is the test environment. They use the reserved `.test` domain, so no real email is ever sent to them.

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

### Demo walkthrough: the whole flow with two accounts

| Account | Email | Use it for |
| --- | --- | --- |
| Demo Team Leader | `demo.leader@iol2027.test`, or the address in `DEMO_LEADER_EMAIL` when the data was seeded | **Demoland (TEST)**, at the very start, as if the invitation code had just been used. Go through every step: Team and observers → Payment (any PDF, JPG or PNG works as the proof) → Teams → People → Rooms and welfare → Travel → Review and submit. |
| Super admin | `superadmin@iol2027.test` | The back office, in a second browser or a private window: approve Demoland's payment under **Payments**, follow its people and stages, and read **Email log**. |

Along the way the system sends the Team Leader: proof received, registration submitted (with the invoice as a PDF), payment confirmed (with a link to the Travel step) and, once the registration is submitted, paid and everyone has an arrival and departure, the QR badges. To a `.test` address they are only recorded (Skipped in the email log); seeded with `DEMO_LEADER_EMAIL` pointing at a real inbox, they arrive there. `npm run db:seed-test` puts Demoland back at the start (pass `DEMO_LEADER_EMAIL` again to keep the real inbox).

### Test invite codes

Unused codes for trying the sign-up itself (invitation code, account, email verification) from scratch. Each works once; `npm run db:seed-test` makes them unused again and removes the accounts made with them. Emails to `.test` addresses are never sent, so the dev site shows the 6-digit email code on screen; sign up with a real address to receive the emails instead.

| Code | Country |
| --- | --- |
| `IOL2027-TST-0001` | Testland (TEST) |
| `IOL2027-TST-0002` | Sampleland (TEST) |
