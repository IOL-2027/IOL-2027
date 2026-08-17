# IOL 2027 Website Architecture

**Status:** Target architecture and current implementation record  
**Source of truth:** `PRD.md` plus the supplied IOL 2027 requirements DOCX  
**Current stage:** Static public site / pre-registration  
**Target horizon:** Full site by December 2026, operational registration by January 2027, event operations 21-28 July 2027

## 1. Architectural principles

1. **Public clarity first.** Conventional information labels keep Registration, Visas, Schedule, Results, and Gallery easy to find.
2. **Portable by design.** The site and operational data must be transferable after at least five years. Avoid provider-specific assumptions in business rules, data exports, and deployment documentation.
3. **Shared registration spine.** Reuse the shared IOL `regsy` system unless the host committee explicitly approves a custom build.
4. **Data-driven operations.** News, results, gallery, fees, deadlines, participant status, and operational content must be managed as records, not hard-coded page text.
5. **Least privilege.** Separate public, team-leader, finance, check-in, welfare/medical, and super-admin access.
6. **Safe defaults for minors.** Treat passport, health/dietary, guardian-consent, emergency-contact, payment proof, and travel data as sensitive.
7. **Graceful degradation.** Check-in needs a manual/offline fallback, and every operational process needs an exportable backup.
8. **Evidence before publication.** Draft schedules, venues, fees, visa information, people, and results must be visibly marked until the responsible team approves them.

## 2. Current implementation

### Frontend

- Vite + React + TypeScript single-page application.
- Main route and page composition: `src/App.tsx`.
- Event facts and working schedule/venues: `src/siteData.ts`.
- Visual system and responsive styles: `src/index.css`.
- Local web fonts: `public/fonts/`.
- Public assets: `public/assets/`.
- Firebase Hosting serves `dist/` and rewrites unknown paths to `index.html`.
- GitHub Actions workflow can build and deploy Hosting from the `main` branch.

The current public pages are a content-ready static preview. They do not yet implement authentication, a registration database, admin CRUD, uploads, payment reconciliation, QR generation/scanning, or live results.

### Current route strategy

`App.tsx` reads `window.location.pathname` and selects a page component. Firebase's Hosting rewrite allows direct navigation to nested paths. This is adequate for the static preview; a future operational application should introduce a tested router or separate application surface rather than growing a single pathname map indefinitely.

## 3. Target system boundaries

```text
                         +------------------------------+
                         |  Public website               |
                         |  Home, news, info, media      |
                         +---------------+--------------+
                                         |
                                  HTTPS / DNS
                                         |
                         +---------------v--------------+
                         | Firebase Hosting (current)   |
                         | Static React frontend         |
                         +---------------+--------------+
                                         |
                            Links/API boundaries, not
                            hard-coded operational data
                                         |
     +-------------------+---------------+-------------------+
     |                   |                                   |
+----v-----+      +------v------+                    +-------v--------+
| Shared   |      | Operational  |                    | Central email   |
| IOL regsy|      | admin/data   |                    | mailbox/group   |
| backend  |      | services     |                    | notifications   |
+----+-----+      +------+------+                    +-------+--------+
     |                   |                                   |
     |                   |                                   |
     |          +--------v---------+                 +--------v---------+
     |          | Database         |                 | File/object store |
     |          | participants,    |                 | payment proof,    |
     |          | status, scores,  |                 | passport files,   |
     |          | audit log        |                 | gallery, backups  |
     |          +------------------+                 +------------------+
     |
+----v----------------------------------------------------------+
| Finance / Logistics / Committee / IOL central data owners     |
| approve fees, venues, schedule, people, results, policy       |
+---------------------------------------------------------------+
```

The diagram shows logical boundaries, not a final vendor commitment. The shared registration system remains the default source for delegation records. If an operational service is built locally, its interface must support export, backup, and handover without tying the event's core data to one vendor.

## 4. Public frontend architecture

### Static site responsibilities

- Render approved public content and staged status notices.
- Keep Registration prominent and link to the approved registration system.
- Render responsive layouts, accessible navigation, keyboard-visible dropdowns, and mobile navigation.
- Show draft/confirmed status where data is not final.
- Avoid exposing participant or payment data in the public bundle.
- Provide stable routes that can survive content edits and future backend changes.

### Content model boundary

The static preview uses TypeScript constants. Before the limited/full site becomes operational, the following should move to a data source or admin-managed content layer:

- News posts.
- Published schedule, venue, accommodation, and transportation records.
- Important dates and fee configuration.
- Committee/jury/volunteer profiles.
- Results and publication status.
- Gallery media and captions.
- Press assets and partner information.

## 5. Registration architecture

### Recommended baseline: shared IOL regsy

The requirements analysis recommends the shared IOL registration system used by Bulgaria, Brazil, and Romania. It is familiar to delegations and centrally maintained. Thailand should negotiate the known pain points before launch:

- Faster approval turnaround during peak windows.
- Clean labels without internal numeric IDs.
- Transparent field-lock rules.
- A single change-request channel with a stated response time.
- Self-service password reset if supported.
- Invite-code issuance that is secure but not a bottleneck.

The public site should link to the approved system rather than duplicate its account and participant database.

### Registration data flow

```text
Central email -> invite code -> team leader account
       -> country/delegation -> teams -> transport -> people
       -> configured fee -> wire transfer -> proof upload
       -> manual Finance reconciliation -> approval/rejection
       -> e-receipt + QR badge data + invitation letter
```

### If a custom operational service is approved

Use explicit service interfaces for:

- Identity and roles.
- Country/delegation and team records.
- Participant and logistics records.
- Payment intents, proofs, decisions, and audit events.
- Document generation and email delivery.
- Check-in events and score publication.
- News/gallery/results content.

Do not let the static website become the only copy of operational data.

## 6. Logical data domains

### Identity and access

`users`, `roles`, `country_invites`, `email_verifications`, `password_resets`, `sessions`, `admin_2fa`.

### Delegation and people

`countries`, `delegations`, `teams`, `participants`, `observers`, `team_leaders`, `transport_records`, `accommodation_assignments`, `dietary_needs`, `medical_accessibility`, `guardian_consents`, `emergency_contacts`, `tshirt_sizes`.

### Payment

`fee_configs`, `fee_tiers`, `invoices`, `payment_proofs`, `payment_reviews`, `receipts`, `refund_decisions`, `payment_audit_events`.

### Event operations

`checkins`, `checkin_devices`, `scores`, `score_imports`, `score_publications`, `news_posts`, `gallery_assets`, `gallery_captions`, `venues`, `schedule_items`, `guidebook_releases`, `press_assets`.

### Governance and observability

`audit_log`, `data_access_log`, `export_jobs`, `backup_records`, `change_requests`, `support_incidents`, `content_approvals`.

Every record containing personal data needs an owner, access policy, retention rule, and export/deletion behavior.

## 7. Roles and authorization

- **Public:** published records only.
- **Team Leader:** only the leader's country/delegation records and generated documents.
- **Registration Admin:** delegation and participant workflow; no unrestricted financial or medical data by default.
- **Finance Admin:** fee configuration, payment proof, reconciliation, receipt state, and finance exports.
- **Check-in Staff:** QR/name/passport lookup and check-in; minimize sensitive fields.
- **Welfare/Medical Staff:** only dietary, medical/accessibility, guardian, and emergency fields needed for duty.
- **Content Editor:** news, schedule, people, Explore, guidebook, press, and gallery records.
- **Results Staff:** score entry/import, draft review, and publication.
- **Super Admin:** role assignment, configuration, audit, backup/restore, and incident response.

Authorization must be enforced server-side for any future operational API. Client-side route hiding is not security.

## 8. Storage, backups, and files

- Keep public website assets separate from private participant uploads.
- Payment proofs and passport copies require private access controls and short, documented retention.
- Gallery originals and published derivatives need an offsite backup.
- Run daily backups for database and files; retain a separate copy; test restore before launch and handover.
- Export participant, payment, and check-in reports in CSV/Excel-compatible formats.
- Document where backups live, who can restore them, the encryption policy, and the deletion schedule.

## 9. Email architecture

Use a shared central mailbox or Google Group, not a personal account. The system sends:

- Invitation codes.
- Email verification and password reset messages.
- Registration/payment status notices.
- E-receipts.
- Invitation-letter links.
- QR badge information.
- Deadline reminders and all-participant announcements.

The From/Reply-to identity, delivery provider, credentials, bounce handling, and rate limits must be documented in the handover runbook.

## 10. Check-in and event-day resilience

- QR contains only an opaque participant reference, never personal data.
- Browser camera/webcam scanning is preferred; name/passport search is the fallback.
- Prepare an offline or local-cache participant list and a printed/manual procedure.
- Keep a backup QR roster and an exportable check-in sheet at the venue.
- Reconcile offline records into the authoritative system after connectivity returns.
- Test venue Wi-Fi with Logistics before the event.

## 11. Security and PDPA

- HTTPS/TLS for all traffic.
- Encrypt sensitive data at rest and in transit.
- Least-privilege role access and periodic access review.
- Explicit consent at account/participant creation, especially for minors.
- Separate private storage for passport scans, payment proofs, health/dietary data, and emergency contacts.
- Maintain access/audit logs for sensitive reads and payment decisions.
- Publish a Privacy/PDPA page with data purposes, retention, rights, contact, and correction requests.
- Define post-event archive and deletion rules before real registration opens.

## 12. Hosting and handover

The current static deployment is Firebase Hosting under the IOL-owned Firebase project. Firebase can remain the frontend host while future database, file storage, email, or backend services are added. The project ID and domain are not the data architecture; services should remain replaceable.

The handover runbook must include:

- Domain/DNS and certificate configuration.
- Hosting/provider account ownership.
- Repository and branch/deploy workflow.
- Build/deploy commands.
- Environment variables and secret rotation.
- Database schema and migrations.
- Storage bucket/object layout and access rules.
- Backup/restore steps and last restore test.
- Admin roles and account recovery.
- Monitoring, incident response, and on-call contacts.
- Post-event transfer plan to faculty/successor host.

## 13. Architecture decisions to record

| Decision | Current direction | Owner / status |
| --- | --- | --- |
| Public frontend host | Firebase Hosting for current static site | In use |
| Registration backend | Shared IOL regsy recommended | Committee/IOL central confirmation needed |
| Payment | Wire transfer + proof upload; no gateway in baseline | Finance confirmation needed |
| Database for future custom services | Not selected; must be portable and exportable | Architecture decision needed only if custom service approved |
| Private file storage | Separate private object storage with offsite backup | Provider/permissions decision needed |
| Central email | Shared mailbox / Google Group | Email team decision needed |
| Admin 2FA | Open question | Committee decision needed |
| Open source | Recommended for handover, not yet committed | Committee decision needed |
| Thai mirror | Required for internal/local use; English is default | Content/translation owner needed |
