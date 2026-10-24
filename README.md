# IOL 2027 Thailand — website and registration portal

Two apps for the 24th International Linguistics Olympiad in Thailand, built from one repository:

- the **public website** (`index.html`, `src/App.tsx`), and
- the **registration portal** (`portal/index.html`, `src/portal/`), where Team Leaders register and organisers work in the back office. It reuses the screens in `src/registration/` and talks to the API in `server/` (see `server/README.md`).

## Local development

```bash
npm install
npm run dev          # public website, http://localhost:5180
npm run dev:portal   # registration portal, http://localhost:5181 (needs the API: npm run dev:api)
```

Production validation:

```bash
npm run build && npm run preview                  # public website (dist)
npm run build:portal && npm run preview:portal    # registration portal (dist-portal)
```

## Site routes

- `/` — event landing page
- `/about` — IOL format and purpose
- `/thailand` — host destination and identity
- `/programme` — working schedule and venues
- `/explore` — cultural programme
- `/people` — organising roles
- `/people/committee` — official Thai committee and subcommittee roster
- `/people/jury` — jury (placeholder)
- `/people/problem-committee` — problem committee (placeholder)
- `/news` — chronological announcements
- `/registration` — how to register, who can register, key dates, working languages, and the button to the registration portal
- `/registration/team-leader`, `/registration/check-in` — old addresses; they forward to the portal (or show `/registration` before it opens)

Registration portal routes:

- `/` — sign in, or create a Team Leader account with an invitation code (`?invite=CODE` fills it in; `?step=travel` opens a step after sign-in)
- `/staff` — organiser sign-in (no invitation-code option); every role lands on what it may see
- `/check-in` — badge scanner for check-in staff, registration admins and super admins
- `/resources` — source and editorial notes

## Content sources

The copy and structure are based only on the project files supplied in this repository: the IOL 2027 requirements document, IOL Host's Handbook (second edition), working venue proposal, and every file in the official logo and theme package. Working details are labelled as subject to confirmation.

## Deployment direction

The included multi-stage `Dockerfile` serves the Vite build through Nginx on port 8080 and includes the SPA fallback required for direct route access. This is compatible with a future Google Cloud Run deployment without committing the project to a registration backend.

## Image credits

Campus photographs are from Wikimedia Commons under CC BY-SA 4.0. The licence requires the author, licence and source to be shown wherever the image is used; the venue cards on the home page link each credit to its source.

| File | Subject | Author | Source |
| --- | --- | --- | --- |
| `public/assets/venues/chula-mahavajiravudh.jpg` | Maha Vajiravudh Building, Faculty of Arts, Chulalongkorn University | BunBn | [Commons](https://commons.wikimedia.org/wiki/File:Mahavajiravudh_Building,_Chulalongkorn_University.jpg) |
| `public/assets/venues/kasetsart-main-auditorium.jpg` | Main Auditorium, Kasetsart University | David Supervid | [Commons](https://commons.wikimedia.org/wiki/File:Kasetsart_University_Auditorium.jpg) |

`public/assets/about/world-dots.svg` is drawn from [Natural Earth](https://www.naturalearthdata.com/) 1:110m land (public domain): landmasses only, no country borders. The Facebook, Instagram and X icons on the About page are from [Simple Icons](https://simpleicons.org/) (CC0).

Mandarin Hotel Bangkok images come from the hotel's official website.

## Hosting

| Site | URL | Deploys from |
| --- | --- | --- |
| Public website (`prod` target) | https://iol2027.web.app | push to `main` |
| Registration portal (`portal` target) | https://iol2027-portal.web.app | push to `development` until launch, with the test API behind it (`/api/**` → Cloud Run `iol2027-api`). The public website does not link to it before registration opens |
| Development website (`dev` target) | https://iol2027-dev.web.app | push to `development` (not indexed by search engines) |
| Pull request previews | posted as a PR comment | every PR (public website only), expires after 7 days |

Custom domains: the IOL Board, which manages `ioling.org`, adds the DNS records Firebase gives for each name (one A and one TXT record per name), for example `iol2027.ioling.org` for the website and `iol2027-portal.ioling.org` for the portal. Each name needs its own records. Until then the `web.app` addresses are used, and `VITE_PORTAL_URL` / `VITE_PUBLIC_SITE_URL` in the workflows (and `PORTAL_URL` on the API) say which addresses link to each other.

### Branches until registration opens (18 January 2027)

```
development  ──merge──▶  prelaunch  ──PR──▶  main (public site)
```

- `development` is the full system, registration included. Build features here, and start new branches from `development`, never from `main`.
- Registration stays closed on the public website because of how it is **built**, not because of its code: the workflow that deploys `main` (`.github/workflows/firebase-hosting-merge.yml`) builds with `VITE_REGISTRATION_OPEN=false`, and so do pull-request previews into `main`. `src/launch.ts` reads that setting, and the website then shows no link to the portal. The portal itself is deployed from `development` until launch (it is the test environment and says so); a portal built with `VITE_REGISTRATION_OPEN=false` only says that registration opens on 18 January 2027. Every other build, including local development, has registration open.
- `prelaunch` carries the same code as `development`; it is the staging step before the public site.
- To publish public-site changes: merge `development` into `prelaunch`, then open a PR from `prelaunch` to `main` and check its preview. Do not commit to `main` directly.
- The placeholder pages (Gallery, People, Sponsors, and the sponsor block on the home page) are hidden the same way, with `VITE_SHOW_PLACEHOLDER_PAGES=false`; their addresses show the not-found page on the public site.
- To see the public website locally: `VITE_REGISTRATION_OPEN=false VITE_SHOW_PLACEHOLDER_PAGES=false npm run build && npm run preview`.
- When registration opens (or a placeholder section is ready): delete its `VITE_...` line from `firebase-hosting-merge.yml` and from `firebase-hosting-pull-request.yml`, then merge as usual.

## Useful Thai audio

The phrase audio on `/about/thai-language` is pre-rendered, not generated in the visitor's browser. `src/thaiPhrases.json` is the single source for the phrases, their IPA and their audio file names; `scripts/generate-thai-audio.py` reads it and writes `public/audio/thai/<slug>.mp3` plus a `-slow` version of each.

- Model: Gemini `gemini-3.8-flash-tts`. Male voice for ครับ forms, female voice for ค่ะ forms and neutral phrases.
- Each clip is transcribed back with `gemini-3.8-flash` and compared with the intended Thai text; mismatches are listed in `tmp/thai-audio-report.json`. A Thai speaker should still listen before release, because a matching transcript does not prove the tones are right.
- Requires `GEMINI_API_KEY` in `.env` and `ffmpeg` on PATH. The key is never needed at build or runtime.

```bash
python scripts/generate-thai-audio.py --audition                      # hear candidate voices: tmp/voice-audition/index.html
python scripts/generate-thai-audio.py --batch --male NAME --female NAME  # regenerate everything, one recording per voice (consistent sound)
python scripts/generate-thai-audio.py --only hello-khrap,help --force    # regenerate specific clips
```

After regenerating, bump `thaiAudioVersion` in `src/App.tsx` so browsers fetch the new files instead of cached ones. Prefer `--batch`: separate requests give the same voice a slightly different delivery each time.

To add a phrase, add it to `src/thaiPhrases.json` with a new `audio` slug and run the script without `--force`; it only generates missing clips.
