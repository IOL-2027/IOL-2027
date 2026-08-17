# IOL 2027 font handover

The website now serves its web fonts locally from `public/fonts/`, so it no longer depends on Google Fonts at runtime.

## Included font files

| File | Family | Weights | Website usage |
| --- | --- | --- | --- |
| `manrope.woff2` | Manrope | 400-700 | Body copy, headings, buttons, cards and general interface text |
| `ibm-plex-mono-400.woff2` | IBM Plex Mono | 400 | Small metadata and technical labels where regular weight is needed |
| `ibm-plex-mono-500.woff2` | IBM Plex Mono | 500 | Navigation, dates, uppercase labels, counters and interface metadata |
| `noto-sans-thai.woff2` | Noto Sans Thai | 400-600 | Thai characters and the large Thai-script display element |

## Fonts that are not bundled

`Georgia` is used only as a decorative serif fallback for selected italic/accent text. It is a system font, not a project asset, so it is not redistributed here.

Lucide icons are rendered as SVG components and do not require an icon font file.

## Source

The bundled files were downloaded from Google Fonts and are referenced by local `@font-face` declarations in `src/index.css`.
