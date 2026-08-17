import { useEffect, useState } from 'react'
import { ArrowRight, Asterisk, CalendarDays, ChevronRight, Menu, X } from 'lucide-react'
import { event, schedule, venues } from './siteData'

const navGroups = [
  { label: 'About', href: '/about', children: [['About the IOL', '/about/the-iol'], ['Host: Thailand', '/about/thailand'], ['Thai language & script', '/about/thai-language']] },
  { label: 'Registration', href: '/registration', children: [['How to register', '/registration/how-to-register'], ['Accredited countries', '/registration/accredited-countries'], ['Fees & deadlines', '/registration/fees-deadlines'], ['Working languages', '/registration/working-languages'], ['Visas & invitation letters', '/registration/visas'], ['Payment', '/registration/payment']] },
  { label: 'Logistics', href: '/logistics', children: [['Schedule & venues', '/logistics'], ['Accommodation', '/logistics/accommodation'], ['Transportation', '/logistics/transportation'], ['Important dates', '/logistics/important-dates'], ['Guidebook', '/logistics/guidebook']] },
  { label: 'Explore', href: '/explore', children: [['Excursions', '/explore/excursions'], ['Culture & food', '/explore/culture'], ['City guide', '/explore/city-guide']] },
  { label: 'Results', href: '/results', children: [['Individual contest', '/results/individual'], ['Team contest', '/results/team']] },
  { label: 'Media', href: '/media', children: [['Gallery', '/media/gallery'], ['Press & media kit', '/media/press']] },
  { label: 'People', href: '/people', children: [['Committee', '/people/committee'], ['Jury & problem committee', '/people/jury'], ['Volunteers', '/people/volunteers']] },
]

const directNav = [['Home', '/'], ['News', '/news'], ['Contact', '/contact']]

function LinkButton({ href, children, light = false }: { href: string; children: React.ReactNode; light?: boolean }) {
  return <a className={`pill ${light ? 'pill-light' : ''}`} href={href}>{children}<span><ArrowRight size={16} /></span></a>
}

const sponsors = [
  { eyebrow: 'SPONSOR 01', name: 'The Promotion of Academic Olympiad and Development of Science Education Foundation (POSN)', shortName: 'POSN', description: "Nurturing young talent and advancing Thailand’s future through academic Olympiads and science education.", image: '/assets/sponsor-posn-v2.png', className: 'sponsor-posn' },
  { eyebrow: 'SPONSOR 02', name: 'Chulalongkorn University', shortName: 'Chulalongkorn University', description: 'A leading center of knowledge, innovation, and academic excellence in the heart of Bangkok.', image: '/assets/sponsor-chula.png', className: 'sponsor-chula' },
  { eyebrow: 'SPONSOR 03', name: 'Kasetsart University', shortName: 'Kasetsart University', description: 'Driving discovery and creating meaningful impact through education, research, and innovation.', image: '/assets/sponsor-kasetsart.png', className: 'sponsor-kasetsart' },
]

function SponsorCarousel() {
  const [active, setActive] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setActive((current) => (current + 1) % sponsors.length), 5000)
    return () => window.clearInterval(timer)
  }, [])
  const sponsor = sponsors[active]
  return <section className="sponsor-carousel wrap" aria-label="IOL 2027 sponsors">
    <div className="sponsor-heading"><p className="eyebrow">With support from</p><h2>Supporting the minds<br /><em>that solve tomorrow’s puzzles.</em></h2><p className="sponsor-counter">0{active + 1} / 0{sponsors.length}</p></div>
    <div className={`sponsor-slide ${sponsor.className}`} onClick={() => setActive((active + 1) % sponsors.length)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setActive((active + 1) % sponsors.length) }} role="button" tabIndex={0} aria-label={`View next sponsor. Current sponsor: ${sponsor.name}`}>
      <div className="sponsor-copy"><span className="system-label">{sponsor.eyebrow}</span><h3>{sponsor.name}</h3><p>{sponsor.description}</p><span className="sponsor-next">Click to continue <ArrowRight size={16} /></span></div>
      <div className="sponsor-logo"><img src={sponsor.image} alt={`${sponsor.name} logo`} /></div><a className="sponsor-profile-link" href="/sponsors" onClick={(event) => event.stopPropagation()}>View sponsor profile <ArrowRight size={15} /></a>
    </div>
    <div className="sponsor-dots">{sponsors.map((item, index) => <button key={item.name} className={index === active ? 'active' : ''} onClick={() => setActive(index)} aria-label={`Show ${item.name}`} />)}</div>
  </section>
}

function Header() {
  const [open, setOpen] = useState(false)
  return <>
    <header className="topbar">
      <a className="wordmark" href="/" aria-label="IOL 2027 home">
        <img src="/assets/iol-mark.png" alt="" /><span>IOL<sup>27</sup></span>
      </a>
      <nav className="desktop-nav" aria-label="Main navigation">
        {directNav.slice(0, 1).map(([label, href]) => <a key={href} href={href}>{label}</a>)}
        {navGroups.map((group) => <div className="nav-dropdown" key={group.href}><a className="nav-parent" href={group.href}>{group.label}<ChevronRight size={13} /></a><div className="nav-menu">{group.children.map(([label, href]) => <a key={href} href={href}>{label}</a>)}</div></div>)}
        {directNav.slice(1).map(([label, href]) => <a key={href} href={href}>{label}</a>)}
      </nav>
      <a className="register-link" href="/registration">Register <ArrowRight size={15} /></a>
      <button className="menu-button" onClick={() => setOpen(!open)} aria-label="Toggle menu">{open ? <X /> : <Menu />}</button>
    </header>
    <div className={`mobile-menu ${open ? 'open' : ''}`}>
      {directNav.map(([label, href], i) => <a key={href} href={href} style={{ '--i': i } as React.CSSProperties}>{label}</a>)}
      {navGroups.map((group, i) => <div className="mobile-nav-group" key={group.href} style={{ '--i': i + 3 } as React.CSSProperties}><a className="mobile-parent" href={group.href}>{group.label}</a><div>{group.children.map(([label, href]) => <a key={href} href={href}>{label}</a>)}</div></div>)}
    </div>
  </>
}

function Footer() {
  return <footer>
    <section className="footer-sponsors" aria-label="Official supporting organisations">
      <p className="eyebrow">Official supporting organisations</p>
      <div className="footer-sponsor-logos"><div><img src="/assets/sponsor-posn-v2.png" alt="POSN" /><span>POSN</span></div><div><img src="/assets/sponsor-chula.png" alt="Chulalongkorn University" /><span>Chulalongkorn University</span></div><div><img src="/assets/sponsor-kasetsart.png" alt="Kasetsart University" /><span>Kasetsart University</span></div></div>
    </section>
    <div><img src="/assets/iol-mark.png" alt="IOL 2027 mark" /><p>{event.name}<br />{event.dates} · {event.city}</p></div>
    <div className="footer-links"><a href="/about">About IOL</a><a href="/logistics">Logistics</a><a href="/sponsors">Partners & sponsors</a><a href="/registration">Registration</a><a href="/contact">Contact</a><a href="/teachers">For teachers</a><a href="/contestants">Contestants</a><a href="/privacy">Privacy / PDPA</a><a href="/unesco">UNESCO & partners</a><a href="/source-code">Source code</a><a href="/resources">Sources & notes</a><a href="/media/press">Press & media</a></div><a className="footer-email" href="mailto:iol2027.th@gmail.com">iol2027.th@gmail.com</a>
    <p className="fineprint">Public information preview · Operational details are published as each responsible team confirms them. Official social handles will be added by the Email/Social team when approved.</p>
  </footer>
}

function PageIntro({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return <section className="page-intro grain"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="lede">{body}</p></section>
}

function Countdown() {
  const target = new Date(event.openingDate).getTime()
  const [remaining, setRemaining] = useState(Math.max(0, target - Date.now()))
  useEffect(() => {
    const timer = window.setInterval(() => setRemaining(Math.max(0, target - Date.now())), 1000)
    return () => window.clearInterval(timer)
  }, [target])
  const days = Math.floor(remaining / 86400000)
  const hours = Math.floor((remaining % 86400000) / 3600000)
  const minutes = Math.floor((remaining % 3600000) / 60000)
  return <div className="countdown" aria-label={`${days} days until IOL 2027 begins`}><span className="countdown-label">COUNTDOWN TO OPENING</span><div className="countdown-units"><strong>{String(days).padStart(3, '0')}<small>D</small></strong><strong>{String(hours).padStart(2, '0')}<small>H</small></strong><strong>{String(minutes).padStart(2, '0')}<small>M</small></strong></div></div>
}

function Home() {
  return <>
    <section className="hero grain">
      <div className="orbit orbit-one" /><div className="orbit orbit-two" />
      <div className="hero-copy">
        <p className="system-label">[ BANGKOK · THAILAND · 2027 ]</p>
        <h1>LINGUISTICS<br /><em>UNLOCKED.</em></h1>
        <p className="hero-deck">Eight days. Two contests. Dozens of languages—and hundreds of ways to see the world differently.</p>
        <div className="hero-actions"><LinkButton href="/programme" light>View the programme</LinkButton><a href="/registration" className="text-link">Registration preview <ChevronRight size={16} /></a></div><Countdown />
      </div>
      <div className="hero-mark"><img src="/assets/iol-mark.png" alt="Official IOL 2027 Thailand mark" /></div>
      <div className="hero-meta"><span><CalendarDays size={17} />{event.dates}</span><span>{event.city}</span><span>24th edition</span></div>
    </section>

    <section className="statement">
      <p className="eyebrow">Meet IOL 2027</p>
      <h2>A world championship<br />for <em>thinking in languages.</em></h2>
      <div className="statement-grid"><p>The International Linguistics Olympiad brings high-school students together to solve complex puzzles drawn from languages around the world—using reasoning, intuition and curiosity rather than prior linguistic knowledge.</p><LinkButton href="/about">Discover the Olympiad</LinkButton></div>
    </section>

    <SponsorCarousel />

    <section className="feature-grid wrap">
      <article className="feature-card saffron"><span>01 / INDIVIDUAL</span><h3>Five problems.<br />Six hours.</h3><p>Contestants work independently through an exacting set of linguistic puzzles.</p></article>
      <article className="feature-card plum"><span>02 / TEAM</span><h3>Four minds.<br />One problem.</h3><p>Teams combine perspectives to solve one large-scale challenge together.</p></article>
      <article className="feature-card jade"><span>03 / BEYOND</span><h3>One shared<br />language: curiosity.</h3><p>Excursions, culture and friendships turn a competition into a global community.</p></article>
    </section>

    <section className="venues-preview wrap">
      <div className="section-heading"><p className="eyebrow">Across Bangkok</p><h2>Three places.<br />One Olympiad.</h2><LinkButton href="/programme">See venues</LinkButton></div>
      <div className="venue-stack">{venues.map(v => <article key={v.index}><span>{v.index}</span><div><p>{v.role}</p><h3>{v.name}</h3><small>{v.detail}</small></div></article>)}</div>
    </section>

    <section className="date-banner grain"><Asterisk /><p>Save the date</p><h2>21—28<br />JULY 2027</h2><span>Bangkok, Thailand · The 24th IOL</span></section>
  </>
}

function About() {
  return <>
    <PageIntro eyebrow="About the Olympiad" title="No dictionaries. Just deduction." body="IOL is one of the International Science Olympiads: a yearly meeting of young problem-solvers who decode the structures hidden inside human language." />
    <section className="two-col wrap"><div><p className="eyebrow">What happens</p><h2>Reasoning meets linguistic intuition.</h2></div><div className="prose"><p>Problems may draw on any language in the world. Contestants discover patterns, test hypotheses and explain systems they have never seen before. No specialist language knowledge is assumed.</p><p>Each accredited country or territory may send up to two teams. A contest team has no more than four contestants and one team leader; the registration package is planned around five people. Contestants take part in both an individual round and a collaborative team round.</p><p>The problems are designed so that prior knowledge of a particular language is not required. Careful observation, hypothesis testing, and a clear explanation matter more than memorised vocabulary.</p></div></section>
    <section className="number-grid wrap"><article><strong>5</strong><span>individual problems</span></article><article><strong>6h</strong><span>individual contest</span></article><article><strong>4</strong><span>students per team</span></article><article><strong>8</strong><span>days together</span></article></section>
    <section className="dark-panel wrap"><p className="eyebrow">More than a medal</p><h2>The week also makes room for games, academic sessions, excursions, host culture and the gatherings where international friendships begin.</h2></section>
  </>
}

function Thailand() {
  return <>
    <PageIntro eyebrow="Host: Thailand" title="The Journey begins in Bangkok" body="In 2027, the IOL comes to Thailand—a meeting point of scripts, sounds, histories, neighbourhoods and new ways of seeing." />
    <section className="culture-band wrap"><div className="giant-thai">ก ข ค</div><div><p className="eyebrow">A linguistic host</p><h2>Look closely.<br />Language is everywhere.</h2><p>Thailand gives the Olympiad a rich setting for attention and discovery. The event’s visual identity draws from Thai guardian and architectural forms, recast as a vivid contemporary mark.</p></div></section>
    <section className="three-notes wrap"><article><span>01</span><h3>Read the city</h3><p>Bangkok is the shared setting for the week, linking the home base, university campuses, contest rooms, ceremonies, and the city programme.</p></article><article><span>02</span><h3>Meet the host culture</h3><p>Excursions, food, cultural programming, and everyday encounters give delegations a way to experience Thailand together.</p></article><article><span>03</span><h3>Notice the forms</h3><p>The Thai language and script provide a distinctive linguistic hook: a living system whose patterns reward close attention.</p></article></section>
  </>
}

function Programme() {
  return <>
    <PageIntro eyebrow="Programme & venues" title="Eight days in Bangkok." body="The published programme follows the current eight-day working plan. Dates and venue roles are known; transfer timings, room allocations, and detailed activity instructions will be added by Logistics when approved." />
    <section className="timeline wrap">{schedule.map((item, i) => <article key={item.date}><div><span>{item.day}</span><strong>{item.date}</strong></div><h2>{item.title}</h2><p>{item.detail}</p><span className="timeline-no">0{i + 1}</span></article>)}</section>
    <section className="venue-section"><div className="wrap"><p className="eyebrow">Working venue plan</p><h2>Bangkok, connected.</h2><div className="venue-cards">{venues.map(v => <article key={v.index}><span>{v.index}</span><p>{v.role}</p><h3>{v.name}</h3><small>{v.detail}</small></article>)}</div><p className="notice">Working venue plan: Mandarin Hotel is the home base; Kasetsart University hosts the opening; Chulalongkorn University hosts the contests, solution presentations, closing ceremony, and cultural night. Logistics will publish any approved changes here.</p></div></section>
  </>
}

function Explore() {
  return <><PageIntro eyebrow="Explore" title="The contest is only half the story." body="IOL is designed as a full week: hard problems, new friends, and a host programme that makes space to encounter Thailand together." /><section className="experience-grid wrap"><article className="exp-one"><span>DAY 04 / EXCURSION</span><h2>Move beyond the contest room.</h2><p>A shared day to encounter Thailand through place, culture, and conversation. The final route will be confirmed by the organising team.</p></article><article className="exp-two"><span>DAY 05 / CITY PROGRAMME</span><h2>Read Bangkok.</h2><p>Campus, neighbourhood, food, river, and street life become part of the week-long setting.</p></article><article className="exp-three"><span>DAY 07 / CULTURAL NIGHT</span><h2>Celebrate the community.</h2><p>After solutions, awards, and closing, delegations gather for the host culture and the friendships that outlast the score.</p></article></section></>
}

function People() {
  return <><PageIntro eyebrow="People" title="Built by many kinds of minds." body="The Olympiad is made possible by a Local Organising Committee, the international IOL Board, the Problem Committee and Jury, team leaders, volunteers and partners." /><section className="role-list wrap">{['Local Organising Committee', 'Problem Committee & Jury', 'Team leaders', 'International & local volunteers'].map((x, i) => <article key={x}><span>0{i + 1}</span><h2>{x}</h2><p>{i === 0 ? 'Plans and delivers the host programme in Thailand.' : i === 1 ? 'Creates, translates, marks and stewards the competition.' : i === 2 ? 'Guide each national delegation and bridge communication throughout the week.' : 'Welcome delegations and keep every movement of the event connected.'}</p></article>)}</section><section className="pending"><p className="eyebrow">Roster update</p><h2>The source requirements define the roles but do not yet provide an approved roster. Names, role titles, and public contact details will be shown here once the Local Organising Committee confirms them.</h2></section></>
}

function Sponsors() {
  return <><PageIntro eyebrow="Partners & sponsors" title="The people behind the possibility." body="IOL 2027 is made possible by organisations that invest in curiosity, education and the young people who will solve tomorrow’s puzzles." /><section className="sponsor-detail-list wrap">{sponsors.map((sponsor, index) => <article className={`sponsor-detail ${sponsor.className}`} key={sponsor.name}><div className="sponsor-detail-logo"><img src={sponsor.image} alt={`${sponsor.name} logo`} /></div><div><span className="system-label">{sponsor.eyebrow}</span><h2>{sponsor.name}</h2><p>{sponsor.description}</p><p className="sponsor-detail-note">{index === 0 ? 'POSN helps create pathways for talented students through academic Olympiads and science education across Thailand.' : index === 1 ? 'Chulalongkorn University contributes an exceptional academic setting in the heart of Bangkok and hosts key moments of the Olympiad programme.' : 'Kasetsart University brings a culture of discovery, research and education to the opening of IOL 2027 in Thailand.'}</p></div></article>)}</section><section className="sponsor-thanks"><p className="eyebrow">With gratitude</p><h2>Thank you for helping young minds look closer.</h2><a className="text-link" href="mailto:iol2027.th@gmail.com">Partner with the organising team <ArrowRight size={16} /></a></section></>
}
function News() {
  return <><PageIntro eyebrow="News & updates" title="The signal starts here." body="Major announcements will also be shared through official IOL communication channels. This page will remain the chronological public record." /><section className="news-list wrap"><article><time>JUL · 2026</time><div><span>WEBSITE</span><h2>Official preview opens</h2><p>The first public site establishes the IOL 2027 identity, event dates, Bangkok host context, working venue plan, and a route to future registration information.</p></div></article><article><time>SEP · 2026</time><div><span>NEXT PHASE</span><h2>Limited site target</h2><p>The next release is planned to add confirmed announcements, important dates, registration guidance, and the first operational information approved by the organising teams.</p></div></article><article><time>JAN · 2027</time><div><span>REGISTRATION</span><h2>Registration target</h2><p>The operational registration system is planned to open with invite-code access, delegation forms, wire-transfer instructions, and payment-proof review.</p></div></article></section></>
}

function Registration() {
  return <><section className="coming-soon grain"><div className="coming-mark"><img src="/assets/iol-mark.png" alt="IOL 2027 Thailand mark" /></div><div><p className="system-label">REGISTRATION CHANNEL / PREPARING</p><h1>PLANNED<br /><em>JAN 2027.</em></h1><p>Registration is not open yet. The operational flow is being prepared around one team leader per country, an invitation code, staged participant data, wire-transfer payment, and manual proof reconciliation.</p><div className="hero-actions"><LinkButton href="/registration/how-to-register" light>See the registration flow</LinkButton><a href="/" className="text-link">Return to the event <ArrowRight size={16} /></a></div></div><aside><span>STATUS</span><strong>PREPARING</strong><span>EXPECTED SCALE</span><strong>~60 COUNTRIES</strong><span>BASE PACKAGE</span><strong>USD 1,000 / 5 PEOPLE</strong><span>PAYMENT</span><strong>WIRE TRANSFER</strong></aside></section><section className="registration-facts wrap"><p className="eyebrow">What is already decided</p><div><span>Invite-code access</span><span>Google or email account</span><span>Manual payment review</span><span>E-receipt, QR and invitation letter</span></div></section></>
}

function Resources() {
  return <><PageIntro eyebrow="Sources & editorial notes" title="What is confirmed—and what is still moving." body="This preview is based on the official project requirements, the IOL Host’s Handbook, the working venue proposal and the complete IOL 2027 identity package supplied to the web team." /><section className="source-list wrap"><article><span>EVENT FORMAT</span><h2>IOL Host’s Handbook, second edition</h2><p>Used for the competition format, team structure, eight-day pattern and public information requirements.</p></article><article><span>LOCAL PLAN</span><h2>IOL 2027 venue proposal</h2><p>Used for dates, accommodation, universities and the working daily programme.</p></article><article><span>WEB REQUIREMENTS</span><h2>IOL 2027 website specification</h2><p>Used for the information architecture, content phases, conventional navigation, registration flow, and the staged public launch.</p></article><article><span>VISUAL IDENTITY</span><h2>Official logo package</h2><p>All supplied PDF, Illustrator, colour, monochrome and raster logo files informed the palette, mark usage and visual language.</p></article></section></>
}

function Contact() {
  return <><PageIntro eyebrow="Contact" title="Let’s keep the signal clear." body="For questions about IOL 2027, sponsorship, programme information or future announcements, contact the Local Organising Committee." /><section className="contact-panel wrap"><div><p className="eyebrow">Central contact</p><a className="contact-email" href="mailto:iol2027.th@gmail.com">iol2027.th@gmail.com</a></div><div className="prose"><p>We will continue to publish confirmed information here as planning progresses. Registration is not open yet; please use the central contact email for official enquiries in the meantime.</p><a className="pill" href="mailto:iol2027.th@gmail.com?subject=IOL%202027%20enquiry">Send an enquiry <span><ArrowRight size={16} /></span></a></div></section></>
}

function ContentCards({ cards }: { cards: { label: string; title: string; body: string }[] }) {
  return <section className="content-cards wrap">{cards.map((card) => <article key={card.title}><span>{card.label}</span><h2>{card.title}</h2><p>{card.body}</p></article>)}</section>
}

function SectionLinks({ links }: { links: { href: string; label: string; detail: string }[] }) {
  return <section className="section-links wrap">{links.map((link, index) => <a key={link.href} href={link.href}><span>0{index + 1}</span><div><h2>{link.label}</h2><p>{link.detail}</p></div><ArrowRight size={21} /></a>)}</section>
}

function AboutTheIol() {
  return <><PageIntro eyebrow="About the IOL" title="The world's language puzzle championship." body="The International Linguistics Olympiad invites secondary-school students to discover how languages work through elegant, solvable problems." /><section className="two-col wrap"><div><p className="eyebrow">The idea</p><h2>Curiosity is the only prerequisite.</h2></div><div className="prose"><p>IOL problems present unfamiliar data from real or constructed languages. Contestants look for structure, test a theory, and write a clear explanation. They do not need to speak the language in the problem.</p><p>Every edition combines an individual contest with a team contest, alongside a programme of academic exchange, culture and friendship.</p></div></section><ContentCards cards={[{ label: 'INDIVIDUAL CONTEST', title: 'Five problems. Six hours.', body: 'An individual test of observation, reasoning and precise explanation.' }, { label: 'TEAM CONTEST', title: 'Four minds, one solution.', body: 'Teams combine perspectives to solve one larger puzzle together.' }, { label: 'THE COMMUNITY', title: 'A global week of discovery.', body: 'Delegations meet across languages, countries and generations.' }]} /></>
}

function ThaiLanguage() {
  return <><PageIntro eyebrow="The Thai language and script" title="A writing system with its own rhythm." body="Thailand gives IOL 2027 a host language that is visually distinctive, historically layered and full of patterns worth noticing." /><section className="culture-band wrap"><div className="giant-thai">{'\u0e01 \u0e02 \u0e04'}</div><div><p className="eyebrow">A close look</p><h2>Scripts make structure visible.</h2><p className="prose">Thai is written left to right with consonants, vowel signs and tone marks arranged in a compact visual system. Its forms invite the same careful attention that makes a good olympiad solver.</p></div></section><ContentCards cards={[{ label: 'SCRIPT', title: 'Consonants carry the frame.', body: 'Thai consonants organise syllables while vowel signs can appear around them in several positions.' }, { label: 'SOUND', title: 'Tone is part of meaning.', body: 'Tone, vowel length and consonant class work together to distinguish words.' }, { label: 'LIVING LANGUAGE', title: 'Old forms, everyday use.', body: 'The script connects inscriptions, literature, signs, messages and daily conversation.' }]} /></>
}

function RegistrationHow() {
  return <><PageIntro eyebrow="Registration / How to register" title="One clear path for every delegation." body="The operational system is planned for January 2027. One team leader registers the delegation for an accredited country; the public guide is available now so teams can prepare their information." /><section className="steps wrap">{['Receive an invitation code from the organising team.', 'Create a team-leader account and verify your email address.', 'Register the delegation, teams, members and travel details.', 'Submit the registration and follow the payment instructions.', 'Upload proof of payment for manual review by the organising team.', 'Download confirmed documents when your delegation is approved.'].map((step, index) => <article key={step}><span>0{index + 1}</span><div><h2>{step}</h2><p>{index === 0 ? 'Codes are issued by the organising team to the official contact for each accredited country or territory.' : index === 3 ? 'Fees and deadlines are published on the Fees & deadlines page.' : index === 5 ? 'Invitation letters and participant documents become available after confirmation.' : 'Your dashboard keeps the next action visible and shows which fields are still editable.'}</p></div></article>)}</section><section className="notice-panel wrap"><p className="eyebrow">Registration status</p><h2>The system is planned for January 2027. The final invite list, data fields, exact deadlines, and official account details will be published after the responsible teams approve them.</h2><a className="text-link" href="/contact">Ask a registration question <ArrowRight size={16} /></a></section></>
}

function AccreditedCountries() { return <><PageIntro eyebrow="Registration / Accredited countries" title="One invitation route for every delegation." body="The registration system is designed for approximately 60 accredited countries and territories, with one team leader coordinating each national delegation." /><section className="two-col wrap"><div><p className="eyebrow">Delegation rule</p><h2>One official contact receives the code.</h2></div><div className="prose"><p>The organising team sends an invitation code to the official contact for each accredited country or territory. The team leader then registers the country, teams, observers, working languages, transport, and people through the operational system.</p><p>The governing IOL country list is maintained by IOL central. The published registration page will link to that approved list rather than copying a list that can go out of date.</p><p><a className="text-link" href="https://ioling.org/countries" target="_blank" rel="noreferrer">View the IOL country list <ArrowRight size={16} /></a></p></div></section><ContentCards cards={[{ label: 'TEAM LEADER', title: 'One account per country.', body: 'The leader coordinates the delegation and remains the main operational contact.' }, { label: 'TEAM LIMIT', title: 'Up to two teams.', body: 'Each accredited country or territory may send up to two teams, subject to the official rules.' }, { label: 'INVITE CODE', title: 'A light security gate.', body: 'Fast code issuance protects the registration pool without creating an unnecessary bottleneck.' }]} /></> }

function Payment() { return <><PageIntro eyebrow="Registration / Payment" title="Wire transfer, documented clearly." body="The baseline payment path is an international wire transfer followed by proof upload and manual reconciliation by the Finance team." /><section className="fee-grid wrap"><article><span>AMOUNT</span><strong>USD 1,000</strong><p>Known baseline for one five-person team package.</p></article><article><span>CHANNEL</span><strong>Wire transfer</strong><p>Transfer to the SCB account of POSN/SorPorSor using the Finance-approved instructions.</p></article><article><span>PROOF</span><strong>PDF / JPG / PNG</strong><p>Upload the slip or deposit receipt for staff review.</p></article></section><section className="two-col wrap"><div><p className="eyebrow">Reconciliation</p><h2>Payment is confirmed by people, not a bank API.</h2></div><div className="prose"><p>The payer should use OUR fee handling so the net amount received matches the invoice. Finance staff compare the uploaded proof with the real SCB statement, then approve or reject the payment with an audit record.</p><p>After approval, the system sends the e-receipt, QR ID-badge information, and invitation-letter information. Account name, number, SWIFT code, fee cut-offs, refund policy, and any card gateway remain Finance/committee decisions.</p></div></section></> }

function RegistrationFees() {
  return <><PageIntro eyebrow="Registration / Fees & deadlines" title="Plan your delegation early." body="The baseline package is known: one team of five people is USD 1,000. Finance still needs to confirm the early-bird/normal cut-off dates, the incremental-member formula, and the SCB account details." /><section className="fee-grid wrap"><article><span>EARLY-BIRD</span><strong>USD 1,000</strong><p>Known baseline: one five-person team package. The early-bird discount and cut-off date remain Finance-owned configuration.</p></article><article><span>STANDARD</span><strong>Normal rate</strong><p>The same five-person package is the reference point; Finance will confirm the final normal-rate dates and any late tier.</p></article><article><span>PAYMENT</span><strong>Bank transfer</strong><p>Account details, transfer reference and proof-of-payment requirements will be published here.</p></article></section><section className="two-col wrap"><div><p className="eyebrow">What to watch</p><h2>Deadlines are staged so teams can prepare with confidence.</h2></div><div className="prose"><p>Registration will use configurable dates rather than hard-coded amounts. If a team adds members later, the system will show the additional amount and the relevant deadline.</p><p>All fees are published in USD. A late-fee tier is an open decision. Additional members are charged by the configured per-person formula rather than forcing a new five-person package.</p></div></section></>
}

function WorkingLanguages() { return <><PageIntro eyebrow="Registration / Working languages" title="Choose the language your team works in." body="The working-language process helps each team contest run fairly and makes sure delegation preferences are visible before the event." /><ContentCards cards={[{ label: 'STEP 01', title: 'Review the available list.', body: 'Team leaders select a working language for each team contest record. The approved list and any language-request deadline are controlled by the organising and IOL teams.' }, { label: 'STEP 02', title: 'Request a language if needed.', body: 'If a required language is not available, the team leader submits a request through the central contact route before the published deadline.' }, { label: 'STEP 03', title: 'Confirm before the contest.', body: 'Approved choices appear in the team dashboard and are used for contest preparation, staffing, and translation planning.' }]} /><section className="notice-panel wrap"><p className="eyebrow">A practical note</p><h2>Language requests are reviewed for fairness, staffing and translation readiness.</h2></section></> }

function Visas() { return <><PageIntro eyebrow="Registration / Visas & invitation letters" title="A clear route to Thailand." body="Visa guidance will distinguish visa-exempt and visa-required accredited countries, link to current Thai Ministry of Foreign Affairs/embassy guidance, and explain the invitation-letter process." /><section className="two-col wrap"><div><p className="eyebrow">Before you travel</p><h2>Check your passport requirements early.</h2></div><div className="prose"><p>Delegations should check the current official guidance from the Royal Thai Embassy or Consulate serving their country. Requirements can vary by nationality, passport type and length of stay.</p><p>After payment is confirmed, eligible participants can request an invitation letter through the registration process. The letter supports an application but does not replace the visa decision made by the relevant Thai authority.</p></div></section><ContentCards cards={[{ label: 'OFFICIAL SOURCES', title: 'Use Thai government guidance.', body: 'The final page will link to official Thai Ministry of Foreign Affairs and embassy/e-Visa guidance; no unofficial visa advice should be treated as authoritative.' }, { label: 'INVITATION LETTERS', title: 'Issued after confirmation.', body: 'After payment confirmation, the organising team will publish the required participant data, request route, and expected turnaround for invitation letters.' }, { label: 'CONTACT', title: 'Ask before booking.', body: 'Email the central team if a participant has a time-sensitive visa question.' }]} /></> }

function Logistics() {
  return <>
    <PageIntro eyebrow="Logistics" title="Everything that helps the week run smoothly." body="Travel, accommodation, venues, and transportation are being assembled from Local Organising Committee data. The working plan already identifies the home base and contest campuses; final rooming, transfers, meal details, and Wi-Fi instructions remain operational handoff items." />
    <section className="logistics-map wrap">
      <div><p className="eyebrow">The working plan</p><h2>One connected week across Bangkok.</h2><p className="prose">Delegations will have a clear home base, dedicated contest campuses and published transfer guidance. Registered team leaders will receive rooming, transport, meal, arrival/departure, and venue instructions once Logistics approves them.</p></div>
      <div className="logistics-list">{venues.map((venue) => <article key={venue.index}><span>{venue.index}</span><div><p>{venue.role}</p><h3>{venue.name}</h3><small>{venue.detail}</small></div></article>)}</div>
    </section>
    <SectionLinks links={[{ href: '/logistics/important-dates', label: 'Important dates', detail: 'Deadlines and moments to keep visible.' }, { href: '/logistics/guidebook', label: 'Guidebook', detail: 'The practical handbook for delegations.' }]} />
  </>
}

function LogisticsDetail({ kind }: { kind: 'accommodation' | 'transportation' }) { const accommodation = kind === 'accommodation'; return <><PageIntro eyebrow={`Logistics / ${accommodation ? 'Accommodation' : 'Transportation'}`} title={accommodation ? 'A shared home base in Bangkok.' : 'Arrive, move, and depart with confidence.'} body={accommodation ? 'The working venue plan names Mandarin Hotel as the home base for delegations, jury, volunteers, and staff.' : 'The registration data model includes arrival and departure transport records so Logistics can plan airport, hotel, and venue movements.'} /><ContentCards cards={accommodation ? [{ label: 'WORKING PLAN', title: 'Mandarin Hotel', body: 'Accommodation, selected evening activities, and shared meals are part of the current venue proposal.' }, { label: 'REGISTRATION DATA', title: 'Room and dietary needs.', body: 'Team leaders provide room preferences and dietary requirements for the people in their delegation.' }, { label: 'TO CONFIRM', title: 'Final rooming and operations.', body: 'Room assignments, meal windows, accessibility arrangements, and final contact details must be approved by Welfare/Venue.' }] : [{ label: 'ARRIVAL', title: 'Record the journey.', body: 'The system captures transport type, number, date, and time for arrival and departure.' }, { label: 'LOCAL MOVEMENT', title: 'Connect the venues.', body: 'Transfers between home base, contest campuses, ceremonies, and the city programme are planned by Logistics.' }, { label: 'FALLBACK', title: 'Prepare for a weak signal.', body: 'The event team should keep an exportable participant list and manual contact route if venue Wi-Fi is unstable.' }]} /></> }

function ImportantDates() { return <><PageIntro eyebrow="Logistics / Important dates" title="Keep the key moments in view." body="These dates are the approved project milestones from the requirements document. Registration fee cut-offs and participant-data deadlines will be added as Finance and Registration configuration." /><section className="date-list wrap">{[{ label: 'PUBLIC PREVIEW', date: 'JUL 2026', detail: 'The first information site and visual direction.' }, { label: 'LIMITED SITE', date: 'SEP 2026', detail: 'Confirmed information, important dates and registration guidance.' }, { label: 'FULL SITE', date: 'DEC 2026', detail: 'Expanded logistics, people, guidebook and visa information.' }, { label: 'REGISTRATION', date: 'JAN 2027', detail: 'The operational registration system is planned to open.' }, { label: 'IOL 2027', date: '21-28 JUL 2027', detail: 'The 24th International Linguistics Olympiad in Bangkok.' }].map((item, i) => <article key={item.label}><span>0{i + 1}</span><div><p>{item.label}</p><h2>{item.date}</h2><small>{item.detail}</small></div></article>)}</section></> }

function Guidebook() { return <><PageIntro eyebrow="Logistics / Guidebook" title="Your practical guide to the week." body="The Guidebook will gather arrival/departure, accommodation, venue, transport, safety, emergency, contact, contest-week, and cultural-programme information in one downloadable place." /><section className="guidebook-panel wrap"><div><p className="eyebrow">Planned document contents</p><h2>One document. Fewer questions.</h2><p className="prose">The final PDF will be released after Schedule, Venues, Accommodation, Transportation, safety contacts, and participant instructions are confirmed. Until then, the website pages are the working reference.</p></div><div className="guidebook-placeholder"><span>PDF</span><strong>Guidebook<br />2027</strong><small>Not yet published</small></div></section><SectionLinks links={[{ href: '/logistics', label: 'Schedule & venues', detail: 'See the working programme and venue plan.' }, { href: '/contact', label: 'Contact the team', detail: 'Ask a logistics question before travel.' }]} /></> }

function ExploreSubpage({ kind }: { kind: 'excursions' | 'culture' | 'city' }) { const data = kind === 'excursions' ? { eyebrow: 'Explore / Excursions', title: 'Step outside the contest room.', body: 'The excursion day gives every delegation a shared way to encounter Thailand through place, history and conversation.', cards: [{ label: 'DISCOVER', title: 'A day with room to wander.', body: 'The final route will balance shared activities with enough space for teams to notice the details that interest them.' }, { label: 'CONNECT', title: 'Travel together.', body: 'Excursions are designed for mixed delegations, new conversations and memories beyond the score sheet.' }] } : kind === 'culture' ? { eyebrow: 'Explore / Culture & food', title: 'Meet the host culture at the table.', body: 'Food, music, craft and everyday rituals give an international event its sense of place.', cards: [{ label: 'TASTE', title: 'A generous table.', body: 'Dietary information collected during registration will help the team plan inclusive meals.' }, { label: 'LISTEN', title: 'Many ways to welcome.', body: 'Cultural programming will make room for Thai voices and for every delegation to share something of home.' }] } : { eyebrow: 'Explore / City guide', title: 'Bangkok is part of the programme.', body: 'The city guide will help delegations move confidently between the official programme and the places they want to explore.', cards: [{ label: 'MOVE', title: 'Plan the journey.', body: 'Transport notes, meeting points and practical travel advice will be added before arrival.' }, { label: 'NOTICE', title: 'Look closer.', body: 'Markets, rivers, campuses and neighbourhoods all offer the same thing as an olympiad problem: a pattern waiting to be found.' }] }; return <><PageIntro eyebrow={data.eyebrow} title={data.title} body={data.body} /><ContentCards cards={data.cards} /><section className="dark-panel wrap"><p className="eyebrow">What the programme will contain</p><h2>Excursions, cultural programming, food, and a city guide will turn Bangkok into part of the Olympiad experience.</h2></section></> }

function Results({ contest }: { contest?: 'individual' | 'team' }) { const isTeam = contest === 'team'; return <><PageIntro eyebrow={contest ? `Results / ${isTeam ? 'Team contest' : 'Individual contest'}` : 'Results'} title={contest ? `${isTeam ? 'Team' : 'Individual'} results will be published here.` : 'The scoreboard comes later.'} body="Before the event, no official scores exist. This page defines the public structure that staff will populate from approved score data during IOL 2027." /><section className="results-panel wrap"><div className="results-header"><p className="eyebrow">{isTeam ? 'TEAM CONTEST' : 'INDIVIDUAL CONTEST'}</p><h2>{isTeam ? 'One shared solution.' : 'One careful mind.'}</h2></div><div className="results-table"><div><span>RANK</span><span>COUNTRY / TEAM</span><span>SCORE</span></div>{['NO OFFICIAL SCORE YET', 'PRE-EVENT INFORMATION ONLY', 'RESULTS WILL FOLLOW APPROVED PUBLICATION'].map((row, i) => <div key={row}><strong>0{i + 1}</strong><span>{row}</span><span>-</span></div>)}</div></section></> }

function Gallery() { return <><PageIntro eyebrow="Media / Gallery" title="The week in pictures." body="The gallery will become a living record of the contest, the host programme and the people who make IOL feel like a community." /><section className="gallery-grid wrap">{['Opening', 'Contest rooms', 'Bangkok', 'Cultural night', 'Awards', 'Friends'].map((label, index) => <article key={label} className={`gallery-tile gallery-${index + 1}`}><span>0{index + 1}</span><h2>{label}</h2><small>No event photographs are published before the July 2027 programme; these categories are ready for the Gallery team.</small></article>)}</section></> }

function Press() { return <><PageIntro eyebrow="Media / Press & media kit" title="The story of IOL 2027, ready to share." body="Press contacts, approved event facts, logos and downloadable media materials will be collected here." /><ContentCards cards={[{ label: 'MEDIA CONTACT', title: 'Start with the central team.', body: 'For interviews, filming access or official statements, email iol2027.th@gmail.com.' }, { label: 'MEDIA KIT', title: 'Facts, logos and images.', body: 'A downloadable kit will be published with the full site and updated as the event develops.' }, { label: 'USAGE', title: 'Please use approved assets.', body: 'The visual identity and event name should be reproduced accurately in public coverage.' }]} /></> }

function PeopleSubpage({ kind }: { kind: 'committee' | 'jury' | 'volunteers' }) { const data = kind === 'committee' ? ['Local Organising Committee', 'Operations, programme, finance, communications and the many details that turn a plan into a welcoming week.'] : kind === 'jury' ? ['Jury & Problem Committee', 'Problem writers, translators and markers protect the quality, fairness and spirit of the competition.'] : ['Volunteers', 'Student and community volunteers will welcome delegations, guide movement and help every guest feel at home.']; return <><PageIntro eyebrow={`People / ${data[0]}`} title={data[0]} body={data[1]} /><section className="two-col wrap"><div><p className="eyebrow">Roster update</p><h2>Names and role assignments are not included in the source requirements yet. The page is ready for the approved Local Organising Committee, International Board, Jury, Problem Committee, and volunteer roster.</h2></div><div className="prose"><p>The people listed here will be introduced with a short role description and a clear contact route where appropriate. Until then, the team remains focused on building a safe, generous and well-run event.</p></div></section><section className="pending"><p className="eyebrow">Built together</p><h2>Every good olympiad is a collaboration between people who care about the details.</h2></section></> }

function Privacy() { return <><PageIntro eyebrow="Privacy / PDPA" title="Respecting the people behind the data." body="IOL 2027 will handle participant information carefully, transparently and only for legitimate organising purposes." /><section className="two-col wrap"><div><p className="eyebrow">What this page will cover</p><h2>Clear consent. Limited access. A useful answer to every question.</h2></div><div className="prose"><p>The policy should describe registration identity, passport, country/team, contact, accommodation, transport, dietary, health/accessibility, guardian consent, emergency contact, payment-proof, check-in, and event-operation data.</p><p>It should explain purpose limitation, least-privilege access, correction requests, sharing with appointed Finance/Logistics/Welfare/ID-card teams, post-event retention/deletion, and how to contact the data controller under Thailand's Personal Data Protection Act.</p></div></section><ContentCards cards={[{ label: 'MINORS', title: 'Extra care for young participants.', body: 'Guardian consent and emergency-contact fields will be treated as sensitive information.' }, { label: 'ACCESS', title: 'Only the right teams see the right data.', body: 'Operational staff receive access based on what they need to do their role.' }, { label: 'CONTACT', title: 'Questions have a home.', body: 'The final policy will name the responsible contact and the change-request process.' }]} /></> }

function AudiencePage({ kind }: { kind: 'teachers' | 'contestants' }) { const teacher = kind === 'teachers'; return <><PageIntro eyebrow={`Audience portal / ${teacher ? 'Teachers & educators' : 'Contestants area'}`} title={teacher ? 'A useful home for team leaders.' : 'Your week, in one place.'} body={teacher ? 'Guidance for delegation leaders and educators will explain invite codes, account verification, country/team/member forms, payment proof, locked fields, change requests, travel details, and the information that must be collected for minors.' : 'Contestants will find orientation, contest-day notes, QR/check-in guidance, working-language reminders, safeguarding contacts, and the confirmed programme here once the operational plan is approved.'} /><ContentCards cards={teacher ? [{ label: 'GUIDANCE', title: 'Registration and deadlines.', body: 'A step-by-step guide will explain the delegation flow and important actions.' }, { label: 'LOGISTICS', title: 'Information to share.', body: 'Travel, accommodation and safeguarding notes will be easy to download and forward.' }] : [{ label: 'BEFORE ARRIVAL', title: 'Know what to expect.', body: 'A calm introduction to the week, the contest rooms and the host programme.' }, { label: 'DURING THE WEEK', title: 'Find the next signal.', body: 'Meeting points, programme changes and practical reminders in one place.' }]} /></> }

function GlobalInfo({ kind }: { kind: 'unesco' | 'source-code' }) {
  const isCode = kind === 'source-code'
  return <><PageIntro eyebrow={isCode ? 'Open source and handover' : 'Global partners'} title={isCode ? 'A site made to be handed forward.' : 'Partnerships belong in the confirmed record.'} body={isCode ? 'The project is being documented so the faculty and a future IOL host can understand, deploy, and maintain the work.' : 'Partner, sponsor, and UNESCO information will be published only when the relevant organisation and wording are officially confirmed.'} /><section className="two-col wrap"><div><p className="eyebrow">{isCode ? 'Handover discipline' : 'No unsupported claims'}</p><h2>{isCode ? 'Document the route, not just the result.' : 'Accuracy matters more than a decorative badge.'}</h2></div><div className="prose"><p>{isCode ? 'The repository, deployment workflow, environment configuration, data schema, backup/restore steps, and admin manuals belong in the handover package. The committee still needs to decide whether the full source is published publicly.' : 'The current source materials name UNESCO and partners as footer information, but do not provide an approved patronage or partner list. This page therefore avoids implying an endorsement that has not been confirmed.'}</p><p><a className="text-link" href={isCode ? '/resources' : '/contact'}>{isCode ? 'Review sources and notes' : 'Contact the organising team'} <ArrowRight size={16} /></a></p></div></section></>
}

function MediaLanding() { return <><PageIntro eyebrow="Media" title="The story, in every format." body="Follow the week through photographs, approved facts, press materials and the voices of the people who make IOL 2027 happen." /><SectionLinks links={[{ href: '/media/gallery', label: 'Gallery', detail: 'Photos and video from the event.' }, { href: '/media/press', label: 'Press & media kit', detail: 'Facts, assets and contact information.' }]} /></> }

function NotFound() { return <><PageIntro eyebrow="404" title="That signal was lost." body="The page may have moved, or it has not been published yet." /><div className="wrap"><LinkButton href="/">Return home</LinkButton></div></> }

function App() {
  useEffect(() => { window.scrollTo(0, 0) }, [])
  const path = window.location.pathname.replace(/\/$/, '') || '/'
  const pages: Record<string, React.ReactElement> = {
    '/': <Home />, '/about': <About />, '/about/the-iol': <AboutTheIol />, '/about/thailand': <Thailand />, '/about/thai-language': <ThaiLanguage />, '/thailand': <Thailand />,
    '/programme': <Programme />, '/logistics': <Logistics />, '/logistics/accommodation': <LogisticsDetail kind="accommodation" />, '/logistics/transportation': <LogisticsDetail kind="transportation" />, '/logistics/important-dates': <ImportantDates />, '/logistics/guidebook': <Guidebook />,
    '/explore': <Explore />, '/explore/excursions': <ExploreSubpage kind="excursions" />, '/explore/culture': <ExploreSubpage kind="culture" />, '/explore/city-guide': <ExploreSubpage kind="city" />,
    '/sponsors': <Sponsors />, '/people': <People />, '/people/committee': <PeopleSubpage kind="committee" />, '/people/jury': <PeopleSubpage kind="jury" />, '/people/volunteers': <PeopleSubpage kind="volunteers" />,
    '/news': <News />, '/registration': <Registration />, '/registration/how-to-register': <RegistrationHow />, '/registration/accredited-countries': <AccreditedCountries />, '/registration/fees-deadlines': <RegistrationFees />, '/registration/working-languages': <WorkingLanguages />, '/registration/visas': <Visas />, '/registration/payment': <Payment />,
    '/results': <Results />, '/results/individual': <Results contest="individual" />, '/results/team': <Results contest="team" />, '/media': <MediaLanding />, '/media/gallery': <Gallery />, '/media/press': <Press />,
    '/contact': <Contact />, '/resources': <Resources />, '/privacy': <Privacy />, '/teachers': <AudiencePage kind="teachers" />, '/contestants': <AudiencePage kind="contestants" />, '/unesco': <GlobalInfo kind="unesco" />, '/source-code': <GlobalInfo kind="source-code" />
  }
  const isRegistration = path === '/registration'
  return <div className="app"><Header /><main>{pages[path] || <NotFound />}</main>{!isRegistration && <Footer />}</div>
}

export default App
