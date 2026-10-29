# IOL 2027 implementation plan

**Status as of:** 24 October 2026
**Event:** 21–28 July 2027, Bangkok · **Registration opens:** 18 January 2027

## How to read this plan

This plan is built from the requirements document *ฝ่ายจัดทำเวปไซด์เเละลงทะเบียน (IOL 2027).docx* (the "source document"). That document is an AI-generated draft written to start the project, not a final specification. Where the team has already decided differently, or where the source contradicts itself or later decisions, the task is marked **⚠️ Deviation** and explained in [Deviations from the source document](#deviations-from-the-source-document).

Update this file as decisions change. It is the single list of what is left to build.

| Mark | Meaning |
| --- | --- |
| ✅ | Done |
| 🟡 | In progress or partly done |
| ⬜ | Not started |
| ⚠️ | Differs from the source document, or needs a decision |

Owners follow the source document's §11: **Web/Dev** (อาม, ภีม์), **Email/Social** (Brook, อาม), **Finance** (อาม), **LOC** (Brook, ภีม์).

---

## 1. Timeline

| Milestone | Source target | Status | Notes |
| --- | --- | --- | --- |
| Coming Soon page | July 2026 | ✅ | Superseded by the full public site |
| Limited site | September 2026 | ✅ | Live at https://iol2027.web.app |
| Registration data fields designed | Before October 2026 | 🟡 | Schema exists (`server/schema.sql`); needs Finance and LOC sign-off on fields |
| Registration concept done | October 2026 | ✅ | Working prototype on https://iol2027-dev.web.app: login, roles, portal saving to the database |
| Full site (all pages) | December 2026 | ⬜ | See §2 |
| Registration live | January 2027 | ⬜ | Fee release and early bird open **18 January 2027** |
| Event | 21–28 July 2027 | ⬜ | |
| Post-event archive | After July 2027 | ⬜ | ⚠️ Static archive, not a five-year live system (see D3) |

### Sprint plan to registration go-live

| Sprint | Dates | Goal | Status |
| --- | --- | --- | --- |
| 1 | now → 7 Nov 2026 | Login with roles, portal saves to the database, API on Cloud Run (dev), emails switched on | ✅ (emails sent through Gmail since 21 Oct 2026) |
| 2 | 8 Nov → 5 Dec 2026 | Admin back office (payment queue, people status, exports), password reset, audit log, guardian consent | ✅ built early, 15 Oct 2026, on the dev site; Google sign-in and admin 2FA moved to Sprint 3 |
| 3 | 6 Dec → 31 Dec 2026 | Full site content, PDPA page final, news admin, custom domain, UAT round 1 | |
| 4 | 1 Jan → 17 Jan 2027 | Cross-browser and mobile QA, load test, backup and restore test, production deploy, invite codes sent | |
| Go-live | 18 Jan 2027 | Registration opens | |

---

## 2. Public website

Source §3. Hosted on Firebase Hosting (`main` → https://iol2027.web.app, `development` → https://iol2027-dev.web.app). Until registration opens, the public site is built with `VITE_REGISTRATION_OPEN=false`, which hides the registration portal; changes reach `main` through the `prelaunch` branch (README → Hosting).

| Page | Source phase | Status | Next action |
| --- | --- | --- | --- |
| Home (hero, dates, countdown, Register CTA) | Limited | ✅ | |
| News and Updates (chronological log) | Limited | 🟡 | Hard-coded today; source requires it to be posted from the admin (§6) |
| About the IOL | Limited | ✅ | |
| Host: Thailand and Bangkok | Limited | ✅ | |
| Thai language and script / Useful Thai (IPA, audio) | Full | ✅ | |
| Registration: how to register | Limited | ✅ | Add screenshots of the real portal before go-live (source recommendation) |
| Registration: fees and deadlines | Limited | 🟡 | Final amounts and bank details waiting on Finance |
| Registration: working languages | Full | ⬜ | ⚠️ Removed from navigation earlier; decide whether to restore |
| Registration: visas and invitation letters | Full | 🟡 | Visa table not confirmed; letters generated after payment (§5) |
| Logistics: schedule, venues, accommodation, transport | Limited → Full | ✅ | Venue maps and walking route done; final venues from LOC |
| Logistics: important dates | Limited | ✅ | |
| Logistics: guidebook (PDF) | Full | ⬜ | Waiting on LOC content |
| Explore | Full | 🟡 | Folded into Host: Thailand |
| People: committee, jury, problem committee, volunteers | Limited → ongoing | 🟡 | Committee roster done; jury and volunteers waiting on names. Hidden on the public site until launch (24 Oct 2026) |
| Results (individual, team) | Full / event | ⚠️ | Links to the IOL central archive today; source wants admin-entered results (§6) |
| Gallery | Before event: empty | 🟡 | Photos of the venues and the hotel, on the public site since 29 Oct 2026; admin upload not built (§6) |
| For Teachers portal | Optional | ⬜ | Lowest priority |
| Sponsors | Not in source | 🟡 | Equal-area grid per board feedback; placeholder logos, so the page and the home-page block are hidden on the public site until sponsors are confirmed |
| Privacy / PDPA | Limited (mandatory) | 🟡 | Draft page live; needs data controller, retention periods and contact (§9) |
| Footer (contact, partners, UNESCO, PDPA, source code, social) | Limited | 🟡 | UNESCO, source code and social links still missing |
| Thai mirror for internal use | Source §9.3 | ⬜ | ⚠️ Not started; confirm it is still wanted |

---

## 3. Accounts, login and roles

Source §4. Role definitions and test accounts: [ROLES.md](ROLES.md).

| Task | Status | Notes |
| --- | --- | --- |
| Invite code gate (one code per country) | ✅ | API: `POST /api/registration/invite/verify` |
| Create Team Leader account with email and password | ✅ | |
| Email verification with a 6-digit code | ✅ | Code stored hashed, 30-minute expiry |
| Session-based login (HttpOnly cookie, idle timeout) | ✅ | `__session` cookie, 2-hour idle and 7-day absolute limit, tokens stored hashed |
| Role-based permissions; Team Leaders see only their own delegation | ✅ | Checked on every API route; see [ROLES.md](ROLES.md) |
| Test accounts for every role | ✅ | `npm run db:seed-test`; list in [ROLES.md](ROLES.md) |
| Self-service password reset | ✅ | 6-digit emailed code, five wrong guesses retire it, resets sign out everywhere. Source §13: a direct fix for regsy and Taiwan's weakness |
| Sign in with Google | ⬜ | Sprint 3. Needs an OAuth consent screen set up in the Google Cloud console by the project owner account. Source §4 asks for both Google and email/password |
| Password policy (length, breached-password check) | 🟡 | 12-character minimum on the server; breached-password check not built |
| Admin 2FA | ⚠️ | Open question Q7 |
| Login rate limiting and lockout | 🟡 | 5 failed sign-ins in 15 minutes locks the account; review in Sprint 4 |

---

## 4. Team Leader portal

Source §5. Front end: `src/registration/`. API: `server/index.js`.

### 4.1 Registration flow (source §5.1 steps 1–11)

| # | Source step | Status | Notes |
| --- | --- | --- | --- |
| 1 | Organisers email each country's invite code | ✅ | Invitation codes are created and emailed from the back office; real codes go out in Sprint 4 |
| 2 | Team Leader enters the code and creates an account | ✅ | |
| 3 | Email verification before first use | ✅ | Code is emailed; the dev site also shows it on screen (never on production) |
| 4 | Login lands on the team dashboard | ✅ | Opens at the first unfinished step; staff land on their back office |
| 5 | Enter team and member details | 🟡 | ⚠️ Order changed: payment comes before member details (D2) |
| 6 | Submit; fee calculated from the submission date (early bird / normal) | 🟡 | Server calculates fees and the tier (early bird to 12 Mar 2027; the normal rate is not set, so both are USD 1,000 for now); submission blocked until people, teams, payment and stay dates are complete |
| 7 | Team Leader transfers outside the system, then uploads proof | ✅ | Invoice details saved first, then proof upload unlocks People |
| 8 | Admin sees the proof in a review queue | ✅ | Payment queue with inline preview, filters and search |
| 9 | Staff check the proof against สอวน's statement, then approve or reject | ✅ | Approval bug fixed; returning a proof needs a reason, which the Team Leader sees |
| 10 | On approval, email (a) e-receipt PDF, (b) ID badge with QR, (c) invitation letter | 🟡 | (a) done: the confirmation email links to the e-receipt and to the Travel step. (b) done 24 Oct 2026: once submitted, paid and everyone has an arrival and departure, the Team Leader is emailed every person’s badge; since 28 Oct 2026 as a PDF exactly as printed, with an update the next morning after any change, failed sends retried, and a daily summary for registration admins; printed badges in §8. (c) letters in Sprint 3; the letter needs its template (Q12) |
| 11 | Add members later; pay only for the added people | ⬜ | ⚠️ Per-person price formula is open question Q1 |

### 4.2 After registration, before the event (source §5.2)

| Task | Status | Notes |
| --- | --- | --- |
| Add, remove and edit members at any time | 🟡 | Removal after payment depends on refund policy (Q2) |
| See payment and review status | ✅ | |
| Download invitation letter and QR badge | 🟡 | QR codes are emailed (see step 10); badge QRs can be redrawn from `BADGE_SIGNING_KEY` for printing. Letters in Sprint 3 |
| Update arrival and departure details | 🟡 | Stay dates required at submission; flights later |
| Change-request channel for locked fields | ⬜ | PRD requirement |

### 4.3 Portal details already designed (keep when wiring)

Team and observer counts (up to two observers per team); a single room, yes or no, for each Team Leader and observer, everyone else sharing (contestants same-gender twin rooms); fee table by fee rate (previous host, accredited, not accredited), first and second team; invoices split between payers with an amount each that must add up to the total; OUR bank-charge rule; currency conversion is the sender's responsibility; payment reference; proof upload unlocks People; per-person role, team, names, passport, date of birth, gender, exam language, T-shirt and polo sizes, food, medical and emergency contact; team code and contest language; welfare summary; stay dates and flights; review checklist; badges and check-in.

---

## 5. Payment and finance

Source §7.

| Task | Owner | Status | Notes |
| --- | --- | --- | --- |
| Currency USD; team fees from POSN's signed fee table (19 Aug 2026) | Finance | ✅ | 30 Oct 2026. Early bird / regular × first / second team × previous host / accredited; not accredited registers one team at the second-team rate. Previous hosts from ioling.org/past_contests, set on each invitation code (editable) |
| Single room supplement USD 400 per person | Finance | ✅ | 30 Oct 2026. Team Leaders and observers choose yes or no in Team and observers; replaces the USD 220 room fee |
| Early bird and normal rates as configuration, not code | Web/Dev | ✅ | Finance edits them in the back office (Fees); unpaid invoices follow changes |
| Late-fee tier | Finance | ⚠️ | Q3 |
| Observer fee | Finance | ✅ | USD 600 (fee table). ⚠️ The fee table says one observer per team; the professor asked for up to two (30 Oct 2026), which the portal allows. Finance can change the limit under Fees |
| Per-person fee for members added later | Finance | ⚠️ | Q1 |
| Wire transfer only, OUR charges | Web/Dev | ✅ | Shown on the payment step and invoice |
| SCB account name, number and SWIFT for สอวน | Finance | ✅ | From Finance's invoice template (27 Oct 2026). Finance enters it in the back office (Fees and invoice), not in this public repository; until then the payment step and invoice say it is to come |
| Invoice download | Web/Dev | ✅ | A PDF in Finance's template (27 Oct 2026): number IOL2027/n, issue and due dates, payer TIN, POSN as recipient, items, bank details. The same file is attached to the "registration submitted" email |
| Proof upload (PDF, JPG, PNG, 10 MB) | Web/Dev | ✅ | Private Cloud Storage bucket |
| Manual reconciliation with approve / reject | Web/Dev | ✅ | Finance back office; e-receipt PDF still to build |
| Audit trail of who approved what and when | Web/Dev | ✅ | Activity log in the back office |
| E-receipt PDF emailed after approval | Web/Dev | 🟡 | Numbered receipt (IOL2027-R-0001…) issued on approval, downloadable as PDF from the portal and the payment queue; the email links to it. Final wording and layout need Finance approval |
| Refunds | Finance | ⚠️ | Q2 |

---

## 6. Admin and staff back office

Source §6. Only the API pieces exist today.

| Function | Status | Sprint |
| --- | --- | --- |
| Overview dashboard (countries, payment states, proof queue) | ✅ | Includes people by stage and invitation codes |
| Per-person status (registered → awaiting payment → paid → badge issued → checked in) | ✅ | People list with filters by country, role, stage and missing details |
| Payment review queue with proof preview | ✅ | Inline preview, invoice details, search, return with a reason |
| Invite-code management (create, send, revoke) | ✅ | One at a time or a pasted list; every send is recorded in the email log |
| Exports: participants, payments, check-in, by country / team / role (CSV, Excel) | ✅ | CSV that opens in Excel (Thai text kept); limited by role and logged. Native .xlsx not built |
| News and Updates posting | ⬜ | 3 |
| Gallery upload with captions | ⬜ | Before event |
| Results entry with draft / publish and CSV import | ⬜ | Before event; ⚠️ see D7 |
| Check-in reports by country | ⬜ | Before event |
| User and role management | ✅ | Create staff accounts (setup code by email), change roles, disable |
| Several admins at once | ✅ | Each admin gets their own account (a shared login would hide who did what in the activity log). Load test on the dev site, 24 Oct 2026: 10 admins refreshing every back-office screen together, 1,300 requests, 0 errors, median 0.25 s; 25 admins, 0 errors, median 0.38 s |

---

## 7. Email

Source §2.3, §5.1 step 10, and the email questions in the source's question list. Setup guide: [EMAIL_SETUP.md](EMAIL_SETUP.md).

| Task | Status | Notes |
| --- | --- | --- |
| Transactional sending, logged in `email_deliveries` | ✅ | Sends from iol2027.th@gmail.com through Gmail since 21 Oct 2026; a test invitation reached a real inbox (EMAIL_SETUP.md). `.test` addresses are never sent |
| From address | ✅ | IOL 2027 Registration &lt;iol2027.th@gmail.com&gt;. No domain will be used (decided 16 Oct 2026, D5) |
| Account verification code | ✅ | |
| Proof received (Team Leader) and Finance alert | ✅ | |
| Payment confirmed | ✅ | Links to the e-receipt and to the Travel step, to add flights |
| Registration submitted | ✅ | The invoice is attached as a PDF (24 Oct 2026); says what is still needed before the QR badges |
| Invite code email | ✅ | |
| Password reset email | ✅ | Also used for new staff setup |
| E-receipt, QR badge and invitation letter emails | 🟡 | E-receipt link in the payment-confirmed email; QR badges email done (24 Oct 2026); letters in Sprint 3 |
| Deadline reminders to unpaid countries | ⬜ | Source §12.1 |
| Announcements to all participants (~500) | ⬜ | Gmail allows about 500 recipients a day, so spread over two days or send by BCC from Gmail |

---

## 8. Check-in

Source §8.

| Task | Status | Notes |
| --- | --- | --- |
| QR holds only a random reference, never personal data | ✅ | Signed badge credential. Since 30 Oct 2026 the QR is a bare code (`IOL2027:<code>`), not a link: only the portal's scanner can tell whose badge it is. QR codes emailed earlier (links) still scan |
| Scan from phone camera or webcam, no app install | ✅ | `/portal/check-in`, for signed-in check-in staff: allow the camera, choose the checkpoint, start scanning (30 Oct 2026). The checkpoint is fixed while scanning; the same badge is recorded once until it leaves the frame. Phones' own camera apps are no longer used |
| Fallback search by name or passport | 🟡 | Check-in staff can search People by name; marking someone checked in by hand is not built |
| Offline or cached mode for weak venue Wi-Fi | ⬜ | Q8 with LOC |
| Printed badges with QR from a vendor | 🟡 | Source §12.1. The print file is ready (back office, Badges, 27 Oct 2026): one badge per page with 3 mm bleed, or four to an A4 sheet for the registration desk. Badges are marked printed, and a later change to a name, role, country or QR lists the badge under Needs reprint. Vendor and material (likely a PVC card in a plastic sleeve) with LOC. Print cut-off 1 July 2027 for now, editable there |
| Badge design (lanyard badge, 10 cm × 14 cm, front and back) with each person’s QR | ✅ | 27 Oct 2026, from the brand colours and logo. 28 Oct 2026: the name band is coloured by group, after IOL 2025 in Taiwan: plum for contestants, teal for Team Leaders, terracotta for observers, gold for staff, guides, volunteers and guests; and a back with contacts (organisers, campus, hotel, hospital, in English and Thai) that registration admins edit in the back office, above Thailand’s emergency numbers. Badge name large, then the official name, the country (or assignment), and the role and team beside the QR. Long names get smaller or take two lines; Latin, Vietnamese, Cyrillic, Greek and Thai print. A name in a script without a font (Chinese, Japanese, Korean) falls back to the person's other name, and the back office warns |
| QR codes with the IOL logo in the middle | ✅ | 27 Oct 2026: the flame from the logo on a white tile, at error-correction level H. Read in every simulated phone capture, down to under 2 pixels per QR square. Check with real phones on a printed sample before the print run |
| Badges for staff, guides, volunteers and guests | ✅ | 27 Oct 2026: added in the back office (Badges, Staff and volunteers), one at a time or pasted from a spreadsheet, with a role and an assignment; their badges scan like everyone else's |
| Rehearsal at the venue | ⬜ | Before event |

---

## 9. Security and PDPA

Source §9.1.

| Task | Status | Notes |
| --- | --- | --- |
| HTTPS everywhere | ✅ | Firebase and Cloud Run |
| Passwords hashed (scrypt), codes hashed | ✅ | |
| Session cookie HttpOnly, Secure, SameSite | ✅ | Plus a required request header on every write against cross-site requests |
| Role-limited access to sensitive fields (health, food, passport, emergency contact) | ✅ | Delegation scoping and field-level redaction by role (e.g. Welfare never sees passports) |
| Private storage for proofs and consent forms | ✅ | |
| Guardian consent for minors | 🟡 | Built and switched off: the registration team turns it on (age limit and date) once the policy is decided; then uploads are required before submission. Consent form template still needed |
| Privacy / PDPA page with controller, lawful basis, retention, contact | 🟡 | Content owner needed |
| Audit log of data changes | ✅ | Every change to registrations, payments, codes, settings, accounts and exports |
| Retention and deletion schedule | ⚠️ | Q9; post-event deletion planned (§12) |
| Daily backups and a tested restore | 🟡 | Cloud SQL backups and point-in-time recovery on; restore never tested |

---

## 10. Infrastructure and operations

| Task | Status | Notes |
| --- | --- | --- |
| Static site on Firebase Hosting (prod + dev targets) | ✅ | |
| API container on Cloud Run (dev) | ✅ | Service `iol2027-api`, asia-southeast1, max 2 instances; reached via `/api/**` on the dev site only |
| Database: `iol2027` on Cloud SQL `papertrend-pg` | ✅ | Shared instance (Architecture.md §12) |
| Secrets in Secret Manager | ✅ | |
| Budget alert (THB 350 / month) | ✅ | |
| Registration portal at `/portal` on the website | ✅ | 30 Oct 2026, at the professor's request (it had its own site, iol2027-portal.web.app, from 24 Oct; that address now redirects). Team Leaders at `/portal`, organisers at `/portal/staff`, scanner at `/portal/check-in`; every page needs an account. The public website's `/registration` is an information page with a button to the portal |
| Custom domain `iol2027.ioling.org` | ⬜ | ⚠️ D4: Firebase gives one A and one TXT record; the IOL Board adds them. The portal is under `/portal`, so no second name is needed. The web.app addresses work until then |
| Monitoring and uptime alerts | ⬜ | Sprint 4 |
| Load test for deadline peaks (~60 countries, 300+ people) | ⬜ | Sprint 4 |

---

## 11. QA and user acceptance testing

Source §9.2 and the question list's testing section.

| Task | Status |
| --- | --- |
| Automated accessibility checks on the portal | ✅ (axe-core, 0 violations) |
| Chrome, Firefox, Safari, Edge, iOS and Android testing | ⬜ |
| Test registration, payment, email and check-in end to end | ⬜ |
| UAT with test countries and staff | ⬜ |
| Form QA so internal IDs never appear in dropdowns (source §13) | ⬜ |

---

## 12. Event operations and post-event

| Task | When | Status |
| --- | --- | --- |
| On-call support rota | Event week | ⬜ |
| Check-in desk support and manual fallback list | Event week | ⬜ |
| Live scores and results publishing | Event week | ⬜ |
| Gallery uploads during the event | Event week | ⬜ |
| Publish final results and gallery | After | ⬜ |
| Export archive content to static pages | After | ⬜ |
| Delete participant personal data per PDPA notice | After | ⬜ |
| Drop the database, bucket, API service and secrets | After | ⬜ |
| Handover notes and lessons learned for IOL 2028 | After | ⬜ |
| Open-source decision | After | ⚠️ Q6 |

---

## Deviations from the source document

| # | Source document says | What we are doing | Why / who decides |
| --- | --- | --- | --- |
| D1 | Use the shared IOL registration system (regsy), not a custom build | Custom registration system | Team decision; the PRD still lists regsy as the default. **Committee should confirm.** |
| D2 | Enter members, submit, then pay | Pay before entering members; proof upload unlocks People | Thanawat's flow after the board meeting. Confirm it with the board. |
| D3 | Host for at least five years, then hand over to the faculty | After the event the site becomes a static archive; the database and API are deleted | Decided 9 Oct 2026 |
| D4 | Give the IOL central team our server IP for DNS | Firebase Hosting provides DNS records (A and TXT), not a single server IP | Technical correction |
| D5 | Central email such as contact@iol2027.ioling.org as the From address | Emails come from iol2027.th@gmail.com, sent through Gmail | Confirmed 16 Oct 2026: there is no IOL 2027 domain; Gmail only |
| D6 | Team = 5 people for USD 1,000 | POSN's fee table: USD 2,200 to 2,750 for the first team (previous host and early bird discounts), double for a second team; USD 600 per observer; USD 400 per single room | Fee table signed 19 Aug 2026, applied 30 Oct 2026 |
| D7 | Results entered in the admin with draft and publish | Results currently link to the IOL central archive | Decide before the event whether we host live results |
| D8 | Roles: Guest, Team Leader, Admin (later list adds Super Admin, Registration, Finance, Check-in, Viewer) | Nine roles, see ROLES.md | Least-privilege for PDPA |
| D9 | English only with a Thai mirror | English only so far | Confirm the Thai mirror is still needed |
| D10 | Docker / Docker Compose on a VM | Docker container on Cloud Run; still portable | Lower cost, no server to maintain |
| D11 | Umbrella giveaway (board notes) | Skipped | User decision, 15 Oct 2026 |

## Open questions

From the source document's §14, plus later ones. Each needs an owner before the sprint that depends on it.

| # | Question | Owner | Blocks |
| --- | --- | --- | --- |
| Q1 | Per-person price when members are added later | Finance | §4.1 step 11 |
| Q2 | Refund or removal policy after payment | Finance, committee | Member deletion |
| Q3 | Add a late-fee tier? | Finance | Fee configuration |
| Q4 | ~~SCB account name, number and SWIFT for สอวน~~ Answered by Finance's invoice template; enter it on the production server | Finance | Payment step, invoice |
| Q5 | Production hosting confirmed as Firebase + Cloud Run? | Committee | Sprint 4 |
| Q6 | Open-source the code? | Committee | Post-event |
| Q7 | Separate "Individual Observer" role; mandatory admin 2FA? | Committee | Roles, Sprint 2 |
| Q8 | Venue Wi-Fi reliability for check-in | LOC | Offline mode |
| Q9 | Data retention periods and the named data controller | Committee | PDPA page |
| Q10 | ~~Email sending domain and who manages its DNS~~ Answered 16 Oct 2026: no domain, send from iol2027.th@gmail.com | Email team | Resolved |
| Q11 | Working-language list and request deadline | Academic committee | Teams step |
| Q12 | Visa matrix and invitation-letter template | LOC | Visas page, letters |
