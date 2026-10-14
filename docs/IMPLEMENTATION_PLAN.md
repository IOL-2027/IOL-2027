# IOL 2027 implementation plan

**Status as of:** 15 October 2026
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
| Registration concept done | October 2026 | 🟡 | Portal redesign in PR #3; login and database wiring under way |
| Full site (all pages) | December 2026 | ⬜ | See §2 |
| Registration live | January 2027 | ⬜ | Fee release and early bird open **18 January 2027** |
| Event | 21–28 July 2027 | ⬜ | |
| Post-event archive | After July 2027 | ⬜ | ⚠️ Static archive, not a five-year live system (see D3) |

### Sprint plan to registration go-live

| Sprint | Dates | Goal |
| --- | --- | --- |
| 1 | now → 7 Nov 2026 | Login with roles, portal saves to the database, API on Cloud Run (dev), emails switched on |
| 2 | 8 Nov → 5 Dec 2026 | Admin back office (payment queue, people status, exports), password reset, audit log, guardian consent |
| 3 | 6 Dec → 31 Dec 2026 | Full site content, PDPA page final, news admin, custom domain, UAT round 1 |
| 4 | 1 Jan → 17 Jan 2027 | Cross-browser and mobile QA, load test, backup and restore test, production deploy, invite codes sent |
| Go-live | 18 Jan 2027 | Registration opens |

---

## 2. Public website

Source §3. Hosted on Firebase Hosting (`main` → https://iol2027.web.app, `development` → https://iol2027-dev.web.app).

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
| People: committee, jury, problem committee, volunteers | Limited → ongoing | 🟡 | Committee roster done; jury and volunteers waiting on names |
| Results (individual, team) | Full / event | ⚠️ | Links to the IOL central archive today; source wants admin-entered results (§6) |
| Gallery | Before event: empty | 🟡 | Page exists; admin upload not built (§6) |
| For Teachers portal | Optional | ⬜ | Lowest priority |
| Sponsors | Not in source | ✅ | Equal-area grid per board feedback |
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
| Session-based login (HttpOnly cookie, idle timeout) | 🟡 | Sprint 1 |
| Role-based permissions; Team Leaders see only their own delegation | 🟡 | Sprint 1 |
| Test accounts for every role | 🟡 | Sprint 1 |
| Self-service password reset | ⬜ | Sprint 2. Source §13: a direct fix for regsy and Taiwan's weakness |
| Sign in with Google | ⬜ | Sprint 2–3. Source §4 asks for both Google and email/password |
| Password policy (length, breached-password check) | 🟡 | 12-character minimum in the UI; enforce on the server |
| Admin 2FA | ⚠️ | Open question Q7 |
| Login rate limiting and lockout | ⬜ | Sprint 1 (basic), Sprint 4 (review) |

---

## 4. Team Leader portal

Source §5. Front end: `src/registration/`. API: `server/index.js`.

### 4.1 Registration flow (source §5.1 steps 1–11)

| # | Source step | Status | Notes |
| --- | --- | --- | --- |
| 1 | Organisers email each country's invite code | ⬜ | Needs the invite-code admin and an email template (§6, §7) |
| 2 | Team Leader enters the code and creates an account | 🟡 | UI done; wiring to API in Sprint 1 |
| 3 | Email verification before first use | 🟡 | API done; wiring in Sprint 1 |
| 4 | Login lands on the team dashboard | 🟡 | Sprint 1 |
| 5 | Enter team and member details | 🟡 | ⚠️ Order changed: payment comes before member details (D2) |
| 6 | Submit; fee calculated from the submission date (early bird / normal) | 🟡 | Fee shown from configuration; tier-by-date logic not built |
| 7 | Team Leader transfers outside the system, then uploads proof | 🟡 | Upload API done (Cloud Storage); UI wiring in Sprint 1 |
| 8 | Admin sees the proof in a review queue | ⬜ | Sprint 2 |
| 9 | Staff check the proof against สอวน's statement, then approve or reject | 🟡 | API exists but approval is currently broken (status value bug), fixed in Sprint 1 |
| 10 | On approval, email (a) e-receipt PDF, (b) ID badge with QR, (c) invitation letter | 🟡 | Confirmation email exists; receipt PDF, badge PDF and letters not built (Sprint 2–3) |
| 11 | Add members later; pay only for the added people | ⬜ | ⚠️ Per-person price formula is open question Q1 |

### 4.2 After registration, before the event (source §5.2)

| Task | Status | Notes |
| --- | --- | --- |
| Add, remove and edit members at any time | 🟡 | Removal after payment depends on refund policy (Q2) |
| See payment and review status | 🟡 | |
| Download invitation letter and QR badge | ⬜ | Sprint 3 |
| Update arrival and departure details | 🟡 | Stay dates required at submission; flights later |
| Change-request channel for locked fields | ⬜ | PRD requirement |

### 4.3 Portal details already designed (keep when wiring)

Team and observer counts; pre-assigned rooms (Team Leaders and observers single, contestants same-gender shared); fee table with team fees and USD 220 rooms; invoice recipient, address, count and split; OUR bank-charge rule; currency conversion is the sender's responsibility; payment reference; proof upload unlocks People; per-person role, team, names, passport, date of birth, gender, exam language, T-shirt and polo sizes, food, medical and emergency contact; team code and contest language; welfare summary; stay dates and flights; review checklist; badges and check-in.

---

## 5. Payment and finance

Source §7.

| Task | Owner | Status | Notes |
| --- | --- | --- | --- |
| Currency USD; team fee USD 1,000 | Finance | ✅ | |
| Room fee USD 220 per room, 2 rooms per team | Finance | ✅ | Confirmed by the user, 15 Oct 2026 |
| Early bird and normal rates as configuration, not code | Web/Dev | 🟡 | Values in `portalData.ts`; move to server config in Sprint 1–2 |
| Late-fee tier | Finance | ⚠️ | Q3 |
| Observer fee | Finance | ⬜ | Rate not set |
| Per-person fee for members added later | Finance | ⚠️ | Q1 |
| Wire transfer only, OUR charges | Web/Dev | ✅ | Shown on the payment step and invoice |
| SCB account name, number and SWIFT for สอวน | Finance | ⬜ | Q4; shown as "pending Finance approval" |
| Invoice download | Web/Dev | ✅ | Printable invoice from the portal |
| Proof upload (PDF, JPG, PNG, 10 MB) | Web/Dev | ✅ | Private Cloud Storage bucket |
| Manual reconciliation with approve / reject | Web/Dev | 🟡 | Sprint 1 fix, Sprint 2 admin UI |
| Audit trail of who approved what and when | Web/Dev | 🟡 | `audit_events` table exists; needs the logged-in user recorded (Sprint 1) |
| E-receipt PDF emailed after approval | Web/Dev | ⬜ | Sprint 2 |
| Refunds | Finance | ⚠️ | Q2 |

---

## 6. Admin and staff back office

Source §6. Only the API pieces exist today.

| Function | Status | Sprint |
| --- | --- | --- |
| Overview dashboard (countries, payment states, proof queue) | 🟡 | API counts exist; UI in Sprint 2 |
| Per-person status (registered → awaiting payment → paid → badge issued → checked in) | ⬜ | 2 |
| Payment review queue with proof preview | ⬜ | 2 |
| Invite-code management (create, send, revoke) | ⬜ | 2 |
| Exports: participants, payments, check-in, by country / team / role (CSV, Excel) | ⬜ | 2 |
| News and Updates posting | ⬜ | 3 |
| Gallery upload with captions | ⬜ | Before event |
| Results entry with draft / publish and CSV import | ⬜ | Before event; ⚠️ see D7 |
| Check-in reports by country | ⬜ | Before event |
| User and role management | ⬜ | 2 |

---

## 7. Email

Source §2.3, §5.1 step 10, and the email questions in the source's question list. Setup guide: [EMAIL_SETUP.md](EMAIL_SETUP.md).

| Task | Status | Notes |
| --- | --- | --- |
| Transactional sending through Resend, logged in `email_deliveries` | ✅ | Code done; switched off until an API key exists |
| Sending domain verified, From and Reply-To set | ⬜ | ⚠️ D5. Needs DNS access for the chosen domain |
| Account verification code | ✅ | |
| Proof received (Team Leader) and Finance alert | ✅ | |
| Payment confirmed | ✅ | Receipt link missing until the e-receipt exists |
| Registration submitted | ✅ | |
| Invite code email | ⬜ | Sprint 2 |
| Password reset email | ⬜ | Sprint 2 |
| E-receipt, QR badge and invitation letter emails | ⬜ | Sprint 2–3 |
| Deadline reminders to unpaid countries | ⬜ | Source §12.1 |
| Announcements to all participants (~500) | ⬜ | Batch sending; Resend free plan caps at 100 a day |

---

## 8. Check-in

Source §8.

| Task | Status | Notes |
| --- | --- | --- |
| QR holds only a random reference, never personal data | ✅ | Signed badge credential |
| Scan from phone camera or webcam, no app install | ✅ | `/registration/check-in` prototype |
| Fallback search by name or passport | ⬜ | |
| Offline or cached mode for weak venue Wi-Fi | ⬜ | Q8 with LOC |
| Printed badges with QR from a vendor | ⬜ | Source §12.1; LOC procurement |
| Rehearsal at the venue | ⬜ | Before event |

---

## 9. Security and PDPA

Source §9.1.

| Task | Status | Notes |
| --- | --- | --- |
| HTTPS everywhere | ✅ | Firebase and Cloud Run |
| Passwords hashed (scrypt), codes hashed | ✅ | |
| Session cookie HttpOnly, Secure, SameSite | 🟡 | Sprint 1 |
| Role-limited access to sensitive fields (health, food, passport, emergency contact) | 🟡 | Sprint 1 (delegation scoping), Sprint 2 (field-level for staff roles) |
| Private storage for proofs and consent forms | ✅ | |
| Guardian consent for minors | ⬜ | Policy pending the organisers |
| Privacy / PDPA page with controller, lawful basis, retention, contact | 🟡 | Content owner needed |
| Audit log of data changes | 🟡 | |
| Retention and deletion schedule | ⚠️ | Q9; post-event deletion planned (§12) |
| Daily backups and a tested restore | 🟡 | Cloud SQL backups and point-in-time recovery on; restore never tested |

---

## 10. Infrastructure and operations

| Task | Status | Notes |
| --- | --- | --- |
| Static site on Firebase Hosting (prod + dev targets) | ✅ | |
| API container on Cloud Run (dev) | 🟡 | Sprint 1 |
| Database: `iol2027` on Cloud SQL `papertrend-pg` | ✅ | Shared instance (Architecture.md §12) |
| Secrets in Secret Manager | ✅ | |
| Budget alert (THB 350 / month) | ✅ | |
| Custom domain `iol2027.ioling.org` | ⬜ | ⚠️ D4: Firebase gives DNS records, which the IOL central team must add |
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
| D5 | Central email such as contact@iol2027.ioling.org as the From address | Central mailbox today is iol2027.th@gmail.com, which cannot be a verified sending domain | Needs a sending domain (EMAIL_SETUP.md) |
| D6 | Team = 5 people for USD 1,000 | Team fee USD 1,000 plus USD 220 per room, 2 rooms per team | Board meeting and fee sheet |
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
| Q4 | SCB account name, number and SWIFT for สอวน | Finance | Payment step, invoice |
| Q5 | Production hosting confirmed as Firebase + Cloud Run? | Committee | Sprint 4 |
| Q6 | Open-source the code? | Committee | Post-event |
| Q7 | Separate "Individual Observer" role; mandatory admin 2FA? | Committee | Roles, Sprint 2 |
| Q8 | Venue Wi-Fi reliability for check-in | LOC | Offline mode |
| Q9 | Data retention periods and the named data controller | Committee | PDPA page |
| Q10 | Email sending domain and who manages its DNS | Email team, IOL central | Emails |
| Q11 | Working-language list and request deadline | Academic committee | Teams step |
| Q12 | Visa matrix and invitation-letter template | LOC | Visas page, letters |
