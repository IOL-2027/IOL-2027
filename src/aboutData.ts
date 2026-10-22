// Facts for the About page. Olympiads, hosts and counts come from https://ioling.org/history/ (checked 22 Oct 2026);
// countries / teams / contestants are the "Countries / Teams / Participants" columns there. No olympiad is listed for 2020.

export type Olympiad = { year: number; city: string; country: string; lat: number; lon: number; countries?: number; teams?: number; contestants?: number }

export const olympiads: Olympiad[] = [
  { year: 2003, city: 'Borovets', country: 'Bulgaria', lat: 42.27, lon: 23.6, countries: 6, teams: 9, contestants: 33 },
  { year: 2004, city: 'Moscow', country: 'Russia', lat: 55.76, lon: 37.62, countries: 7, teams: 12, contestants: 45 },
  { year: 2005, city: 'Leiden', country: 'Netherlands', lat: 52.16, lon: 4.49, countries: 9, teams: 13, contestants: 50 },
  { year: 2006, city: 'Tartu', country: 'Estonia', lat: 58.38, lon: 26.72, countries: 9, teams: 13, contestants: 51 },
  { year: 2007, city: 'St Petersburg', country: 'Russia', lat: 59.94, lon: 30.31, countries: 9, teams: 15, contestants: 61 },
  { year: 2008, city: 'Slanchev Bryag', country: 'Bulgaria', lat: 42.69, lon: 27.71, countries: 11, teams: 16, contestants: 67 },
  { year: 2009, city: 'Wrocław', country: 'Poland', lat: 51.11, lon: 17.04, countries: 17, teams: 23, contestants: 86 },
  { year: 2010, city: 'Stockholm', country: 'Sweden', lat: 59.33, lon: 18.07, countries: 18, teams: 26, contestants: 99 },
  { year: 2011, city: 'Pittsburgh', country: 'United States', lat: 40.44, lon: -79.99, countries: 19, teams: 27, contestants: 102 },
  { year: 2012, city: 'Ljubljana', country: 'Slovenia', lat: 46.06, lon: 14.51, countries: 26, teams: 34, contestants: 131 },
  { year: 2013, city: 'Manchester', country: 'United Kingdom', lat: 53.48, lon: -2.24, countries: 26, teams: 35, contestants: 138 },
  { year: 2014, city: 'Beijing', country: 'China', lat: 39.9, lon: 116.4, countries: 28, teams: 39, contestants: 152 },
  { year: 2015, city: 'Blagoevgrad', country: 'Bulgaria', lat: 42.02, lon: 23.09, countries: 29, teams: 43, contestants: 166 },
  { year: 2016, city: 'Mysore', country: 'India', lat: 12.3, lon: 76.64, countries: 30, teams: 43, contestants: 167 },
  { year: 2017, city: 'Dublin', country: 'Ireland', lat: 53.35, lon: -6.26, countries: 28, teams: 43, contestants: 172 },
  { year: 2018, city: 'Prague', country: 'Czechia', lat: 50.08, lon: 14.44, countries: 30, teams: 49, contestants: 192 },
  { year: 2019, city: 'Yongin', country: 'Republic of Korea', lat: 37.24, lon: 127.18, countries: 36, teams: 53, contestants: 209 },
  { year: 2021, city: 'Ventspils', country: 'Latvia', lat: 57.39, lon: 21.56, countries: 34, teams: 54, contestants: 216 },
  { year: 2022, city: 'Castletown', country: 'Isle of Man', lat: 54.07, lon: -4.65, countries: 37, teams: 50, contestants: 184 },
  { year: 2023, city: 'Bansko', country: 'Bulgaria', lat: 41.84, lon: 23.49, countries: 38, teams: 52, contestants: 205 },
  { year: 2024, city: 'Brasília', country: 'Brazil', lat: -15.79, lon: -47.88, countries: 38, teams: 52, contestants: 206 },
  { year: 2025, city: 'Taipei', country: 'Taiwan', lat: 25.03, lon: 121.57, countries: 43, teams: 57, contestants: 227 },
  { year: 2026, city: 'Bucharest', country: 'Romania', lat: 44.43, lon: 26.1, countries: 46, teams: 65, contestants: 255 },
  { year: 2027, city: 'Bangkok', country: 'Thailand', lat: 13.76, lon: 100.5 },
]

// Must match the projection used to draw public/assets/about/world-dots.svg (scratch script make_dot_map.py).
export const mapFrame = { lonMin: -125, latMax: 72, scale: 4, width: 1120, height: 468 }

// Working languages at IOL 2026 (https://ioling.org/previous_languages/), written in each language.
export const workingLanguages: { name: string; native: string; lang: string; dir?: 'rtl' }[] = [
  { name: 'Bulgarian', native: 'Български', lang: 'bg' }, { name: 'Chinese (simplified)', native: '简体中文', lang: 'zh-Hans' },
  { name: 'Chinese (traditional)', native: '繁體中文', lang: 'zh-Hant' }, { name: 'Czech', native: 'Čeština', lang: 'cs' },
  { name: 'Dutch', native: 'Nederlands', lang: 'nl' }, { name: 'English (American)', native: 'English (US)', lang: 'en-US' },
  { name: 'English (British)', native: 'English (UK)', lang: 'en-GB' }, { name: 'Estonian', native: 'Eesti', lang: 'et' },
  { name: 'Finnish', native: 'Suomi', lang: 'fi' }, { name: 'French (Canadian)', native: 'Français (Canada)', lang: 'fr-CA' },
  { name: 'German', native: 'Deutsch', lang: 'de' }, { name: 'Greek', native: 'Ελληνικά', lang: 'el' },
  { name: 'Hebrew', native: 'עברית', lang: 'he', dir: 'rtl' }, { name: 'Hungarian', native: 'Magyar', lang: 'hu' },
  { name: 'Japanese', native: '日本語', lang: 'ja' }, { name: 'Kazakh', native: 'Қазақ тілі', lang: 'kk' },
  { name: 'Korean', native: '한국어', lang: 'ko' }, { name: 'Latvian', native: 'Latviešu', lang: 'lv' },
  { name: 'Polish', native: 'Polski', lang: 'pl' }, { name: 'Portuguese (Brazilian)', native: 'Português (Brasil)', lang: 'pt-BR' },
  { name: 'Romanian', native: 'Română', lang: 'ro' }, { name: 'Russian', native: 'Русский', lang: 'ru' },
  { name: 'Slovenian', native: 'Slovenščina', lang: 'sl' }, { name: 'Spanish (European)', native: 'Español (España)', lang: 'es-ES' },
  { name: 'Spanish (Latin American)', native: 'Español (Latinoamérica)', lang: 'es-419' }, { name: 'Swedish', native: 'Svenska', lang: 'sv' },
  { name: 'Thai', native: 'ไทย', lang: 'th' }, { name: 'Turkish', native: 'Türkçe', lang: 'tr' }, { name: 'Ukrainian', native: 'Українська', lang: 'uk' },
]

// Photos from Wikimedia Commons, CC BY 4.0, resized for the web.
export const aboutPhotos = {
  ceremony: { src: '/assets/about/iol-2024-opening-ceremony.jpg', alt: 'Hundreds of contestants and team leaders with their national flags in an auditorium under an IOL Brasília 2024 banner', caption: 'Opening ceremony of IOL 2024 in Brasília: 206 contestants from 38 countries.', credit: "Photo: L'Astorina, CC BY 4.0", source: 'https://commons.wikimedia.org/wiki/File:IOL_2024_Opening_ceremony.jpg' },
  team: { src: '/assets/about/iol-2019-team-yongin.jpg', alt: 'A national team holding the Brazilian flag in front of an IOL Yongin 2019 backdrop', caption: 'The Brazilian team at IOL 2019 in Yongin, Republic of Korea.', credit: "Photo: L'Astorina, CC BY 4.0", source: 'https://commons.wikimedia.org/wiki/File:Time_brasileiro_na_IOL_2019.jpg' },
}

// Brand icons from Simple Icons (https://simpleicons.org, CC0), 24x24 viewBox.
export const socialLinks = [
  { label: "Facebook", href: "https://www.facebook.com/international.linguistics.olympiad", path: "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" },
  { label: "Instagram", href: "https://www.instagram.com/ioling.official/", path: "M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077" },
  { label: "X", href: "https://twitter.com/IOLing_official", path: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" },
]
