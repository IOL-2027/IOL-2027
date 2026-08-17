# IOL 2027 Website and Registration PRD

**Status:** Development reference and source-of-truth summary  
**Event:** 24th International Linguistics Olympiad (IOL 2027), Thailand  
**Event dates:** 21-28 July 2027  
**Host city:** Bangkok, Thailand  
**Primary domain:** `iol2027.ioling.org`  
**Audience:** International delegations, contestants, team leaders, teachers, volunteers, staff, media, partners, and the public  
**Last distilled:** 2026-08-17

## 1. Purpose and product direction

The website is the public information layer and operational front door for IOL 2027. It must move from a lightweight Coming Soon page to a complete public information site, then support the registration, payment-verification, check-in, results, gallery, and handover work needed for the event.

The public site should be clear to an international user on the first visit. Use conventional labels such as Registration, Visas, Schedule, Results, and Gallery. Registration must remain reachable in one click and must not be hidden under a thematic label.

The website and operational system must be maintainable for at least five years and then transferable to the faculty or successor host. Keep the architecture portable and document deployment, backups, environment variables, data schema, and restore procedures.

## 2. Goals

1. Publish accurate, staged information from the first public preview through the event and post-event archive.
2. Make registration understandable and operational for approximately 60 countries and 300+ participants.
3. Give team leaders one clear flow for country, team, participant, logistics, payment-proof, and confirmation data.
4. Give staff an admin surface for payment reconciliation, participant status, check-in, scores, news, gallery, and exports.
5. Protect minors and sensitive data under Thailand's PDPA.
6. Keep the site responsive, accessible, testable across browsers, and portable for handover.
7. Provide a complete handover package, including source code, deployment runbook, backups, data schema, user manuals, and operational contacts.

## 3. Non-goals and explicit boundaries

- The current public site is not the registration backend; registration remains a separate operational system until that integration is approved.
- Do not invent final fee dates, SCB account details, visa eligibility tables, committee names, final venue allocations, or guidebook content that the organising teams have not confirmed.
- Do not hard-code content that will change frequently after launch: news, results, gallery, participant records, fees, deadlines, or operational status.
- The base payment requirement is manual wire transfer and upload of proof. An online card gateway is an open decision, not a committed requirement.
- A custom registration build is not the default. The shared IOL registration system (regsy) is the recommended spine unless the host committee explicitly approves a custom build.

## 4. Delivery phases and acceptance gates

| Phase | Target | Public scope | Acceptance gate |
| --- | --- | --- | --- |
| Coming Soon | July 2026 | Logo, event name/year, dates, countdown, central email, short launch message | Static page deploys cleanly and domain resolves over HTTPS |
| Limited site | September 2026 | Home, News, About, Host Thailand, Registration guidance, programme/dates, contact, PDPA, initial sponsors | Content owners approve copy; responsive/browser checks pass |
| Full site | December 2026 | Full sitemap, logistics, Explore, People, visa guidance, audience portals, guidebook placeholder or final PDF, press assets | Operational owners approve each information area |
| Registration live | January 2027 | Invite-code/account flow, delegation data, payment instructions, proof upload, review status | End-to-end UAT with test delegations and staff |
| Event operations | 21-28 July 2027 | Check-in, live status, scores/results, news, gallery, support/on-call | Venue rehearsal, offline fallback, backup QR/list verified |
| Post-event / handover | After event; minimum hosting horizon five years | Final results/gallery, archive, backups, runbook, lessons learned, transfer package | Faculty/successor host can deploy, restore, and operate the system |

## 5. Information architecture and sitemap

### Primary navigation

- Home
- News and Updates
- About
  - About the IOL
  - Host: Thailand and Bangkok
  - The Thai language and script
- Registration
  - How to register and invitation code
  - Accredited countries (link to the governing IOL list when confirmed)
  - Fees and deadlines
  - Working languages
  - Visas and invitation letters
  - Payment guidance
- Logistics
  - Schedule and programme
  - Venues
  - Accommodation
  - Transportation
  - Important dates
  - Guidebook (PDF)
- Explore
  - Excursions
  - Cultural programme, food, and city guide
- People
  - Local organising committee
  - International Board / Jury
  - Problem Committee
  - Volunteers
- Results
  - Individual contest
  - Team contest
- Media
  - Gallery
  - Press and media kit
- Audience portals
  - Teachers and educators
  - Contestants area
- Footer
  - Contact, partners, sponsors, UNESCO/partner information, Privacy/PDPA, source code, social links

### Current static route mapping

The current Vite app implements these sections as public routes and uses a Firebase Hosting rewrite to the SPA entry point. Dynamic back-office content is not yet connected.

## 6. Public content requirements

### Home

The hero must show IOL 2027, Thailand/Bangkok, 21-28 July 2027, a countdown, and a clear Registration CTA. The page should explain that IOL is a language-puzzle competition based on reasoning rather than prior language knowledge. Include the individual contest, team contest, host-city context, venues, sponsors, and staged publication status.

### About and host

Explain the contest format: unfamiliar language data, pattern discovery, individual and team rounds, no specialist language knowledge assumed, up to two teams per accredited country/territory, and teams of up to four contestants plus a team leader. Present Thailand and Bangkok as the host context without claiming unconfirmed attractions or venue decisions.

### News

Maintain a chronological, data-driven announcement log. Use it to publish staged deadlines and operational reminders: member details, arrival/departure information, T-shirt sizes, excursions, city tours, payment deadlines, and other changes.

### Registration

The public guide must explain:

1. A central team sends an invite code to each country's official contact.
2. The team leader creates an account with Google sign-in or email/password.
3. Email verification and/or OTP is required before use.
4. The leader registers country/delegation, teams, working languages, transport, and people.
5. The system calculates the configured fee tier and displays wire-transfer instructions.
6. The leader uploads PDF/JPG/PNG proof of payment.
7. Staff manually reconcile the proof with the SCB statement and approve or reject it.
8. After approval, the system sends an electronic receipt, QR ID-badge information, and invitation-letter information.
9. Later member additions create an incremental amount and a new proof/review cycle.

The system should disclose which fields lock after submission and provide one clear change-request channel.

### Fees and payment

- Currency: USD.
- Known baseline: one five-person team package is USD 1,000.
- Early-bird and normal rates are required; exact cut-off dates are Finance-owned and must remain configuration, not source-code constants.
- A late-fee tier is an open decision.
- Base channel: international wire transfer to the SCB account of POSN/SorPorSor as supplied by Finance.
- The payer should use OUR fee handling so the net amount received matches the invoice.
- Account name, account number, and SWIFT code must be supplied by Finance before launch.
- Payment proof is uploaded; reconciliation is manual; every approval/rejection must be auditable.

### Logistics

The working plan names Mandarin Hotel as home base, Kasetsart University as opening stage, and Chulalongkorn University as contest campus. Final accommodation, venue, transport, meal, and Wi-Fi details are Logistics-owned and must be marked as draft until confirmed.

### Results, media, and people

Before the event, Results must clearly state that no official scores exist yet. During the event, staff must publish draft scores, approve/publish final results, and support CSV import. Gallery starts empty and becomes an admin-managed photo/video record. Committee, jury, and volunteer names are published only after official confirmation.

## 7. Users and permissions

| Role | Required access |
| --- | --- |
| Guest/public | Read all published public pages; no login |
| Team Leader | One account per country; manage delegation, teams, people, logistics, payment proof, status, and downloads |
| Admin / event staff | Back office for registration review, payment reconciliation, participant status, check-in, scores, gallery, news, and exports |
| Finance staff | Payment queue, statement reconciliation, audit trail, receipt status |
| Check-in staff | QR scan/search and check-in status; limited sensitive-data visibility |
| Medical/welfare staff | Only the sensitive fields needed for their duty |
| Super Admin | Role management, configuration, audit access, backup/restore operations |

## 8. Functional requirements

### Authentication and account security

- Invite-code gate sent through the central email.
- Google sign-in or email/password registration.
- Verified email before operational access.
- Self-service password reset.
- Strong password policy, HTTPS/TLS, expiry of inactive sessions, and optional/required Admin 2FA decision before launch.

### Team Leader portal

- Country/delegation record.
- Teams, observers, working languages, transport records, accommodation and dietary data.
- Per-person identity/passport, role, room preference, dietary, medical/accessibility, guardian consent and emergency contact for minors, transport assignment, and T-shirt size.
- Add/remove/edit policy with explicit post-payment rules.
- Payment status, change requests, e-receipt, invitation-letter and QR-ID downloads.

### Admin portal

- Overview counts by country, payment status, and registration stage.
- Per-person lifecycle: registered -> awaiting payment -> payment confirmed -> badge issued -> checked in.
- QR scan from phone camera/webcam, plus name/passport fallback.
- Score entry/editing, draft versus published results, CSV import.
- News CRUD, gallery upload with caption, and exportable check-in/payment/participant reports.

### Email

Use a shared central mailbox or Google Group rather than a personal mailbox. It is the From/Reply-to for invite codes, verification, payment notices, e-receipts, invitation letters, QR information, deadline reminders, and event announcements.

## 9. Non-functional requirements

- English default; Thai mirror for internal/local use.
- Responsive on mobile, tablet, and desktop.
- Test Chrome, Firefox, Safari, Edge, and mobile browsers before each release phase.
- HTTPS throughout; secure storage and access controls for passport scans, payment proof, health/dietary data, guardian consent, and emergency contacts.
- PDPA page in the footer, explicit consent, least-privilege access, retention/deletion policy, and auditable changes.
- Daily offsite backups for database and files; restore test before launch and before handover.
- Support approximately 60 countries and 300+ participants, with headroom for deadline peaks.
- Uptime and on-call readiness are most critical near registration deadlines, check-in, and results publication.
- Portable hosting and documented deployment; open-source publication remains a decision for the committee.

## 10. Ownership and dependencies

- Web/Dev: website, hosting, registration integration, check-in, admin, PDPA.
- Email/social: central mailbox and official social channels.
- Finance: fee tiers, SCB/POSN account data, payment reconciliation approval.
- Local Organising Committee: venue, schedule, accommodation, transport, committee/jury, Explore content.
- Web team feeds Welfare/Venue room counts, Recreation liaison counts, ID-card and airport/hotel teams with confirmed participant data.
- PR supplies the logo and approved central contact information.

## 11. Open decisions before operational development

1. Price formula for incremental members.
2. Refund/removal policy after payment.
3. Final SCB account name, number, and SWIFT.
4. Production hosting provider and five-year ownership/handover plan.
5. Whether the project is fully open-sourced.
6. Whether Individual Observer is a separate role.
7. Whether Admin 2FA is mandatory.
8. Venue Wi-Fi reliability and offline check-in scope.
9. Final working-language list and request deadline.
10. Final visa matrix, official links, and invitation-letter workflow.
11. Final data-retention periods and data controller/contact.
12. Whether to add a card payment gateway in addition to wire transfer.

## 12. Definition of done

A release is complete only when content owners approve it, all changed pages work on mobile and desktop, no sensitive data is exposed, deployment is reproducible, backup/restore is tested where applicable, and the handover documentation is updated.
