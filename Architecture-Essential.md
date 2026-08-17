# IOL 2027 Architecture Essential

Use this file as the short context pack before changing the website or designing a future system. Treat `PRD.md` and `Architecture.md` as the detailed source of truth; treat the DOCX as the authoritative original when a conflict appears.

## Project identity

- Event: 24th International Linguistics Olympiad (IOL 2027), Thailand.
- Dates: 21-28 July 2027.
- Host city: Bangkok, Thailand.
- Domain: `iol2027.ioling.org`.
- English is the public default; Thai is an internal/local mirror requirement.
- Scale: roughly 60 countries and 300+ participants, with deadline/event peaks.

## Product direction

Build a clear international event site first, then connect it to the operational registration and event systems. Use normal labels: Registration, Visas, Schedule, Results, Gallery. Registration is the operational core and must remain one click away.

The site must survive at least five years and be handed to the faculty/successor host. Keep deployment, content, data, storage, backups, and business rules portable. Do not create vendor lock-in or hide important operational logic in page components.

## Phase gates

- Coming Soon: July 2026 - logo, name, dates, countdown, central email, short launch message.
- Limited site: September 2026 - core public information, registration guidance, programme/dates, contact, PDPA.
- Full site: December 2026 - full sitemap, logistics, Explore, People, visa guidance, audience/media content.
- Registration live: January 2027.
- Event operations: 21-28 July 2027.
- Post-event: final results/gallery, archive, backup, runbook, handover.

## Sitemap that must remain represented

Home; News and Updates; About (About IOL, Host Thailand/Bangkok, Thai language/script); Registration (How, accredited countries, fees/deadlines, working languages, visas/invitation letters, payment); Logistics (schedule, venues, accommodation, transportation, important dates, guidebook); Explore (excursions, culture/food, city guide); People (organisers, International Board/Jury, Problem Committee, volunteers); Results (individual/team); Media (gallery/press); Teachers; Contestants; Footer (contact, partners, sponsors, UNESCO/partner information, Privacy/PDPA, source code, social).

## Registration truth

The recommended spine is the shared IOL `regsy` system, not a custom registration app, unless the committee explicitly decides otherwise. The public site should link to it rather than duplicate its database.

Flow: central invite code -> team leader account (Google or email/password) -> email verification -> country/delegation -> teams -> transport -> participants -> configured fee -> wire transfer -> PDF/JPG/PNG proof upload -> manual Finance reconciliation -> approval/rejection -> e-receipt, QR badge information, invitation letter -> later member additions and incremental review.

Known baseline: USD 1,000 for one five-person team package. Early-bird and normal tiers are required; exact dates and account/SWIFT details are Finance-owned. Base payment is wire transfer to the SCB account supplied by Finance. Online card payment and late-fee tier are open decisions.

## Data and privacy truth

Sensitive data includes passport, health/dietary, accessibility, guardian consent, emergency contact, travel, and payment proof. Minors are expected. Use least-privilege roles, explicit consent, HTTPS/TLS, private file storage, audit logs, retention/deletion rules, and a Privacy/PDPA page.

Roles: public; Team Leader; Registration Admin; Finance Admin; Check-in Staff; Welfare/Medical Staff; Content Editor; Results Staff; Super Admin. Check-in QR contains only an opaque participant reference, with name/passport search fallback and an offline/manual backup.

## Current codebase

- Vite + React + TypeScript SPA.
- `src/App.tsx`: pages and pathname routing.
- `src/siteData.ts`: event facts, schedule, working venues.
- `src/index.css`: visual system and responsive layout.
- `public/assets/`: logo and sponsor assets.
- `public/fonts/`: local Manrope, IBM Plex Mono, Noto Sans Thai files.
- Firebase Hosting serves `dist/` with an SPA rewrite.
- Current public site is static/content-ready; no auth, database, admin CRUD, upload, payment reconciliation, QR scanning, or live result backend is implemented yet.

## Content rules for every future edit

- Use confirmed facts from the DOCX/approved owner; do not invent names, fees, visa tables, account details, final schedules, final venues, or official partners.
- If a fact is not confirmed, label it as draft, planned, or awaiting owner confirmation; replace vague filler with a useful explanation of what is known and what decision is pending.
- Keep changing content data-driven in the target architecture; do not hard-code news, scores, gallery, deadlines, or participant status.
- Preserve responsive behavior, keyboard/touch navigation, accessible labels, and direct-link routes.
- Update the handover documentation when architecture, provider, secrets, data fields, or deployment steps change.

## Critical open decisions

Incremental-member price formula; post-payment removal/refund policy; SCB account details; production hosting and ownership; shared-regsy confirmation; open-source decision; Individual Observer role; Admin 2FA; venue Wi-Fi/offline check-in; final language list; visa matrix and invitation-letter process; retention periods; card-payment gateway decision.
