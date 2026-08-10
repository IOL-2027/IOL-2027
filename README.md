# IOL 2027 Thailand — information site

First public-facing draft for the 24th International Linguistics Olympiad in Thailand. Registration is intentionally represented by a coming-soon page; no participant data or registration workflow is implemented.

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
- `/news` — chronological announcements
- `/registration` — coming soon
- `/resources` — source and editorial notes

## Content sources

The copy and structure are based only on the project files supplied in this repository: the IOL 2027 requirements document, IOL Host's Handbook (second edition), working venue proposal, and every file in the official logo and theme package. Working details are labelled as subject to confirmation.

## Deployment direction

The included multi-stage `Dockerfile` serves the Vite build through Nginx on port 8080 and includes the SPA fallback required for direct route access. This is compatible with a future Google Cloud Run deployment without committing the project to a registration backend.
