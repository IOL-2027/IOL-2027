# IOL 2027 Thailand — information site

Public information site and interactive registration proof of concept for the 24th International Linguistics Olympiad in Thailand. The registration portal demonstrates the planned user journey with fictional data; it does not submit or save registration information.

## Local development

```bash
npm install
npm run dev
```

Production validation:

```bash
npm run build
npm run preview
```

## Site routes

- `/` — event landing page
- `/about` — IOL format and purpose
- `/thailand` — host destination and identity
- `/programme` — working schedule and venues
- `/explore` — cultural programme
- `/people` — organising roles
- `/people/committee` — official Thai committee and subcommittee roster
- `/news` — chronological announcements
- `/registration` — registration timeline and PoC entry
- `/registration/team-leader` — static Team Leader journey prototype
- `/registration/check-in` — badge scanner simulation
- `/resources` — source and editorial notes

## Content sources

The copy and structure are based only on the project files supplied in this repository: the IOL 2027 requirements document, IOL Host's Handbook (second edition), working venue proposal, and every file in the official logo and theme package. Working details are labelled as subject to confirmation.

## Deployment direction

The included multi-stage `Dockerfile` serves the Vite build through Nginx on port 8080 and includes the SPA fallback required for direct route access. This is compatible with a future Google Cloud Run deployment without committing the project to a registration backend.

## Registration PoC mode

The badge scanner defaults to a fully static simulation. It accepts the sample code `IOL2027-POC-DEMO` and does not call the API or save a check-in. The existing live API integration remains in place for future development. Set `VITE_BADGE_SCANNER_MODE=live` only after the registration API, database, authentication and staff authorization are ready in the target environment.
