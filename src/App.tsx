import { useEffect, useState } from 'react'
import { ArrowRight, Asterisk, CalendarDays, ChevronRight, Menu, X } from 'lucide-react'
import { event, schedule, venues } from './siteData'

const navGroups = [
  { label: 'About', href: '/about', children: [['About the IOL', '/about/the-iol'], ['Host: Thailand', '/about/thailand'], ['Thai language & script', '/about/thai-language']] },
  { label: 'Registration', href: '/registration', children: [['How to register', '/registration/how-to-register'], ['Fees & deadlines', '/registration/fees-deadlines'], ['Working languages', '/registration/working-languages'], ['Visas & invitation letters', '/registration/visas']] },
  { label: 'Logistics', href: '/logistics', children: [['Schedule & venues', '/logistics'], ['Important dates', '/logistics/important-dates'], ['Guidebook', '/logistics/guidebook']] },
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
    <p className="fineprint">Official preview · Content will continue to be confirmed by the Local Organising Committee.</p>
  </footer>
}

function PageIntro({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return <section className="page-intro grain"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="lede">{body}</p></section>
}

function Home() {
  return <>
    <section className="hero grain">
      <div className="orbit orbit-one" /><div className="orbit orbit-two" />
      <div className="hero-copy">
        <p className="system-label">[ BANGKOK · THAILAND · 2027 ]</p>
        <h1>LINGUISTICS<br /><em>UNLOCKED.</em></h1>
        <p className="hero-deck">Eight days. Two contests. Dozens of languages—and hundreds of ways to see the world differently.</p>
        <div className="hero-actions"><LinkButton href="/programme" light>View the programme</LinkButton><a href="/registration" className="text-link">Registration preview <ChevronRight size={16} /></a></div>
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
    <section className="two-col wrap"><div><p className="eyebrow">What happens</p><h2>Reasoning meets linguistic intuition.</h2></div><div className="prose"><p>Problems may draw on any language in the world. Contestants discover patterns, test hypotheses and explain systems they have never seen before. No specialist language knowledge is assumed.</p><p>Each accredited country or territory may send up to two teams. A team has no more than four contestants and one team leader. Contestants take part in both an individual round and a collaborative team round.</p></div></section>
    <section className="number-grid wrap"><article><strong>5</strong><span>individual problems</span></article><article><strong>6h</strong><span>individual contest</span></article><article><strong>4</strong><span>students per team</span></article><article><strong>8</strong><span>days together</span></article></section>
    <section className="dark-panel wrap"><p className="eyebrow">More than a medal</p><h2>The week also makes room for games, academic sessions, excursions, host culture and the gatherings where international friendships begin.</h2></section>
  </>
}

function Thailand() {
  return <>
    <PageIntro eyebrow="Host: Thailand" title="The Journey begins in Bangkok" body="In 2027, the IOL comes to Thailand—a meeting point of scripts, sounds, histories, neighbourhoods and new ways of seeing." />
    <section className="culture-band wrap"><div className="giant-thai">ก ข ค</div><div><p className="eyebrow">A linguistic host</p><h2>Look closely.<br />Language is everywhere.</h2><p>Thailand gives the Olympiad a rich setting for attention and discovery. The event’s visual identity draws from Thai guardian and architectural forms, recast as a vivid contemporary mark.</p></div></section>
    <section className="three-notes wrap"><article><span>01</span><h3>Read the city</h3><p>From university campuses to busy central neighbourhoods, Bangkok will be the shared context for the week.</p></article><article><span>02</span><h3>Meet the host culture</h3><p>Excursions, a city programme and cultural night carry the experience beyond the contest room.</p></article><article><span>03</span><h3>Notice the forms</h3><p>The official palette and mark translate Thai ornamental rhythm into a retro-futurist event system.</p></article></section>
  </>
}

function Programme() {
  return <>
    <PageIntro eyebrow="Programme & venues" title="Eight days in Bangkok." body="This first public programme follows the working venue plan. Individual activity details and transfer arrangements remain subject to confirmation." />
    <section className="timeline wrap">{schedule.map((item, i) => <article key={item.date}><div><span>{item.day}</span><strong>{item.date}</strong></div><h2>{item.title}</h2><p>{item.detail}</p><span className="timeline-no">0{i + 1}</span></article>)}</section>
    <section className="venue-section"><div className="wrap"><p className="eyebrow">Working venue plan</p><h2>Bangkok, connected.</h2><div className="venue-cards">{venues.map(v => <article key={v.index}><span>{v.index}</span><p>{v.role}</p><h3>{v.name}</h3><small>{v.detail}</small></article>)}</div><p className="notice">Venue allocations and the programme are a working draft and may change as the Local Organising Committee completes operational planning.</p></div></section>
  </>
}

function Explore() {
  return <><PageIntro eyebrow="Explore" title="The contest is only half the story." body="IOL is designed as a full week: hard problems, new friends and a host programme that makes space to encounter Thailand together." /><section className="experience-grid wrap"><article className="exp-one"><span>DAY 04</span><h2>Excursion</h2><p>A full day to move beyond the campus and discover another side of the host country.</p></article><article className="exp-two"><span>DAY 05</span><h2>City programme</h2><p>Bangkok becomes a shared classroom—layered, energetic and full of signals to decode.</p></article><article className="exp-three"><span>DAY 07</span><h2>Cultural night</h2><p>The final evening brings delegations together after solutions, awards and the closing ceremony.</p></article></section></>
}

function People() {
  return <><PageIntro eyebrow="People" title="Built by many kinds of minds." body="The Olympiad is made possible by a Local Organising Committee, the international IOL Board, the Problem Committee and Jury, team leaders, volunteers and partners." /><section className="role-list wrap">{['Local Organising Committee', 'Problem Committee & Jury', 'Team leaders', 'International & local volunteers'].map((x, i) => <article key={x}><span>0{i + 1}</span><h2>{x}</h2><p>{i === 0 ? 'Plans and delivers the host programme in Thailand.' : i === 1 ? 'Creates, translates, marks and stewards the competition.' : i === 2 ? 'Guide each national delegation and bridge communication throughout the week.' : 'Welcome delegations and keep every movement of the event connected.'}</p></article>)}</section><section className="pending"><p className="eyebrow">Roster update</p><h2>Named committee and jury profiles will be published after official confirmation.</h2></section></>
}

function Sponsors() {
  return <><PageIntro eyebrow="Partners & sponsors" title="The people behind the possibility." body="IOL 2027 is made possible by organisations that invest in curiosity, education and the young people who will solve tomorrow’s puzzles." /><section className="sponsor-detail-list wrap">{sponsors.map((sponsor, index) => <article className={`sponsor-detail ${sponsor.className}`} key={sponsor.name}><div className="sponsor-detail-logo"><img src={sponsor.image} alt={`${sponsor.name} logo`} /></div><div><span className="system-label">{sponsor.eyebrow}</span><h2>{sponsor.name}</h2><p>{sponsor.description}</p><p className="sponsor-detail-note">{index === 0 ? 'POSN helps create pathways for talented students through academic Olympiads and science education across Thailand.' : index === 1 ? 'Chulalongkorn University contributes an exceptional academic setting in the heart of Bangkok and hosts key moments of the Olympiad programme.' : 'Kasetsart University brings a culture of discovery, research and education to the opening of IOL 2027 in Thailand.'}</p></div></article>)}</section><section className="sponsor-thanks"><p className="eyebrow">With gratitude</p><h2>Thank you for helping young minds look closer.</h2><a className="text-link" href="mailto:iol2027.th@gmail.com">Partner with the organising team <ArrowRight size={16} /></a></section></>
}
function News() {
  return <><PageIntro eyebrow="News & updates" title="The signal starts here." body="Major announcements will also be shared through official IOL communication channels. This page will remain the chronological public record." /><section className="news-list wrap"><article><time>JUL · 2026</time><div><span>WEBSITE</span><h2>First look: IOL 2027 Thailand</h2><p>The first information site and visual direction are now in preview. Dates, venue planning and programme structure are being prepared for public release.</p></div></article><article><time>NEXT</time><div><span>COMING UP</span><h2>Limited site release</h2><p>Confirmed organising information, important dates and registration guidance will be added in stages.</p></div></article></section></>
}

function Registration() {
  return <section className="coming-soon grain"><div className="coming-mark"><img src="/assets/iol-mark.png" alt="IOL 2027 Thailand mark" /></div><div><p className="system-label">REGISTRATION CHANNEL / OFFLINE</p><h1>COMING<br /><em>SOON.</em></h1><p>Registration is planned to open in early 2027. Official delegations will receive clear instructions through accredited national organisations.</p><a href="/" className="text-link">Return to the event <ArrowRight size={16} /></a></div><aside><span>STATUS</span><strong>PREPARING</strong><span>EDITION</span><strong>24 / THAILAND</strong><span>EVENT</span><strong>{event.dates}</strong></aside></section>
}

function Resources() {
  return <><PageIntro eyebrow="Sources & editorial notes" title="What is confirmed—and what is still moving." body="This preview is based on the official project requirements, the IOL Host’s Handbook, the working venue proposal and the complete IOL 2027 identity package supplied to the web team." /><section className="source-list wrap"><article><span>EVENT FORMAT</span><h2>IOL Host’s Handbook, second edition</h2><p>Used for the competition format, team structure, eight-day pattern and public information requirements.</p></article><article><span>LOCAL PLAN</span><h2>IOL 2027 venue proposal</h2><p>Used for dates, accommodation, universities and the working daily programme.</p></article><article><span>WEB REQUIREMENTS</span><h2>IOL 2027 website specification</h2><p>Used for the information architecture, content phases, conventional navigation and registration placeholder.</p></article><article><span>VISUAL IDENTITY</span><h2>Official logo package</h2><p>All supplied PDF, Illustrator, colour, monochrome and raster logo files informed the palette, mark usage and visual language.</p></article></section></>
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
  return <><PageIntro eyebrow="Registration / How to register" title="One clear path for every delegation." body="Registration will open after the official invitation window. Accredited teams will receive an invitation code and step-by-step instructions." /><section className="steps wrap">{['Receive an invitation code from the organising team.', 'Create a team-leader account and verify your email address.', 'Register the delegation, teams, members and travel details.', 'Submit the registration and follow the payment instructions.', 'Upload proof of payment for manual review by the organising team.', 'Download confirmed documents when your delegation is approved.'].map((step, index) => <article key={step}><span>0{index + 1}</span><div><h2>{step}</h2><p>{index === 0 ? 'Codes are issued to the official contact for each accredited country.' : index === 3 ? 'Fees and deadlines are published on the Fees & deadlines page.' : index === 5 ? 'Invitation letters and participant documents become available after confirmation.' : 'Your dashboard keeps the next action visible.'}</p></div></article>)}</section><section className="notice-panel wrap"><p className="eyebrow">Registration status</p><h2>Opening date and the final data fields will be announced by the Local Organising Committee.</h2><a className="text-link" href="/contact">Ask a registration question <ArrowRight size={16} /></a></section></>
}

function RegistrationFees() {
  return <><PageIntro eyebrow="Registration / Fees & deadlines" title="Plan your delegation early." body="The Finance team will publish confirmed fee tiers and payment instructions here before registration opens." /><section className="fee-grid wrap"><article><span>EARLY-BIRD</span><strong>To be confirmed</strong><p>For delegations submitting complete information before the first deadline.</p></article><article><span>STANDARD</span><strong>To be confirmed</strong><p>The regular rate during the main registration window.</p></article><article><span>PAYMENT</span><strong>Bank transfer</strong><p>Account details, transfer reference and proof-of-payment requirements will be published here.</p></article></section><section className="two-col wrap"><div><p className="eyebrow">What to watch</p><h2>Deadlines are staged so teams can prepare with confidence.</h2></div><div className="prose"><p>Registration will use configurable dates rather than hard-coded amounts. If a team adds members later, the system will show the additional amount and the relevant deadline.</p><p>All fees are published in USD. The organising team will confirm whether a late-fee tier is used.</p></div></section></>
}

function WorkingLanguages() { return <><PageIntro eyebrow="Registration / Working languages" title="Choose the language your team works in." body="The working-language process helps each team contest run fairly and makes sure delegation preferences are visible before the event." /><ContentCards cards={[{ label: 'STEP 01', title: 'Review the available list.', body: 'The final list of working languages will be published with the registration form.' }, { label: 'STEP 02', title: 'Request a language if needed.', body: 'Team leaders can contact the organising team with a reasoned request before the stated deadline.' }, { label: 'STEP 03', title: 'Confirm before the contest.', body: 'Approved working-language choices appear in the team dashboard and operational briefings.' }]} /><section className="notice-panel wrap"><p className="eyebrow">A practical note</p><h2>Language requests are reviewed for fairness, staffing and translation readiness.</h2></section></> }

function Visas() { return <><PageIntro eyebrow="Registration / Visas & invitation letters" title="A clear route to Thailand." body="Visa guidance will be tailored to each delegation once the official participant list and travel dates are confirmed." /><section className="two-col wrap"><div><p className="eyebrow">Before you travel</p><h2>Check your passport requirements early.</h2></div><div className="prose"><p>Delegations should check the current official guidance from the Royal Thai Embassy or Consulate serving their country. Requirements can vary by nationality, passport type and length of stay.</p><p>After payment is confirmed, eligible participants can request an invitation letter through the registration process. The letter supports an application but does not replace the visa decision made by the relevant Thai authority.</p></div></section><ContentCards cards={[{ label: 'OFFICIAL SOURCES', title: 'Use Thai government guidance.', body: 'Links to the Ministry of Foreign Affairs and relevant embassies will be added before applications open.' }, { label: 'INVITATION LETTERS', title: 'Issued after confirmation.', body: 'The organising team will publish the required participant details and turnaround time.' }, { label: 'CONTACT', title: 'Ask before booking.', body: 'Email the central team if a participant has a time-sensitive visa question.' }]} /></> }

function Logistics() {
  return <>
    <PageIntro eyebrow="Logistics" title="Everything that helps the week run smoothly." body="Travel, accommodation and venue information will move from working plan to confirmed guide as the organising team completes operational planning." />
    <section className="logistics-map wrap">
      <div><p className="eyebrow">The working plan</p><h2>One connected week across Bangkok.</h2><p className="prose">Delegations will have a clear home base, dedicated contest campuses and published transfer guidance. Final rooming, transport and meal details will be shared with registered team leaders.</p></div>
      <div className="logistics-list">{venues.map((venue) => <article key={venue.index}><span>{venue.index}</span><div><p>{venue.role}</p><h3>{venue.name}</h3><small>{venue.detail}</small></div></article>)}</div>
    </section>
    <SectionLinks links={[{ href: '/logistics/important-dates', label: 'Important dates', detail: 'Deadlines and moments to keep visible.' }, { href: '/logistics/guidebook', label: 'Guidebook', detail: 'The practical handbook for delegations.' }]} />
  </>
}

function ImportantDates() { return <><PageIntro eyebrow="Logistics / Important dates" title="Keep the key moments in view." body="The dates below are the current planning frame. Confirmed deadlines will be added as each operational decision is approved." /><section className="date-list wrap">{[{ label: 'PUBLIC PREVIEW', date: 'JUL 2026', detail: 'The first information site and visual direction.' }, { label: 'LIMITED SITE', date: 'SEP 2026', detail: 'Confirmed information, important dates and registration guidance.' }, { label: 'FULL SITE', date: 'DEC 2026', detail: 'Expanded logistics, people, guidebook and visa information.' }, { label: 'REGISTRATION', date: 'JAN 2027', detail: 'The operational registration system is planned to open.' }, { label: 'IOL 2027', date: '21-28 JUL 2027', detail: 'The 24th International Linguistics Olympiad in Bangkok.' }].map((item, i) => <article key={item.label}><span>0{i + 1}</span><div><p>{item.label}</p><h2>{item.date}</h2><small>{item.detail}</small></div></article>)}</section></> }

function Guidebook() { return <><PageIntro eyebrow="Logistics / Guidebook" title="Your practical guide to the week." body="The guidebook will gather arrival, accommodation, venue, transport, safety and contact information in one downloadable place." /><section className="guidebook-panel wrap"><div><p className="eyebrow">Coming in the full site</p><h2>One document. Fewer questions.</h2><p className="prose">A final PDF will be published after the schedule, venue allocations and travel guidance are confirmed.</p></div><div className="guidebook-placeholder"><span>PDF</span><strong>Guidebook<br />2027</strong><small>Not yet published</small></div></section><SectionLinks links={[{ href: '/logistics', label: 'Schedule & venues', detail: 'See the working programme and venue plan.' }, { href: '/contact', label: 'Contact the team', detail: 'Ask a logistics question before travel.' }]} /></> }

function ExploreSubpage({ kind }: { kind: 'excursions' | 'culture' | 'city' }) { const data = kind === 'excursions' ? { eyebrow: 'Explore / Excursions', title: 'Step outside the contest room.', body: 'The excursion day gives every delegation a shared way to encounter Thailand through place, history and conversation.', cards: [{ label: 'DISCOVER', title: 'A day with room to wander.', body: 'The final route will balance shared activities with enough space for teams to notice the details that interest them.' }, { label: 'CONNECT', title: 'Travel together.', body: 'Excursions are designed for mixed delegations, new conversations and memories beyond the score sheet.' }] } : kind === 'culture' ? { eyebrow: 'Explore / Culture & food', title: 'Meet the host culture at the table.', body: 'Food, music, craft and everyday rituals give an international event its sense of place.', cards: [{ label: 'TASTE', title: 'A generous table.', body: 'Dietary information collected during registration will help the team plan inclusive meals.' }, { label: 'LISTEN', title: 'Many ways to welcome.', body: 'Cultural programming will make room for Thai voices and for every delegation to share something of home.' }] } : { eyebrow: 'Explore / City guide', title: 'Bangkok is part of the programme.', body: 'The city guide will help delegations move confidently between the official programme and the places they want to explore.', cards: [{ label: 'MOVE', title: 'Plan the journey.', body: 'Transport notes, meeting points and practical travel advice will be added before arrival.' }, { label: 'NOTICE', title: 'Look closer.', body: 'Markets, rivers, campuses and neighbourhoods all offer the same thing as an olympiad problem: a pattern waiting to be found.' }] }; return <><PageIntro eyebrow={data.eyebrow} title={data.title} body={data.body} /><ContentCards cards={data.cards} /><section className="dark-panel wrap"><p className="eyebrow">More detail soon</p><h2>The Local Organising Committee is shaping a programme that is welcoming, practical and distinctly Thai.</h2></section></> }

function Results({ contest }: { contest?: 'individual' | 'team' }) { const isTeam = contest === 'team'; return <><PageIntro eyebrow={contest ? `Results / ${isTeam ? 'Team contest' : 'Individual contest'}` : 'Results'} title={contest ? `${isTeam ? 'Team' : 'Individual'} results will be published here.` : 'The scoreboard comes later.'} body="Before the event, this is a clear home for the results structure. During IOL 2027, published data will replace these placeholders." /><section className="results-panel wrap"><div className="results-header"><p className="eyebrow">{isTeam ? 'TEAM CONTEST' : 'INDIVIDUAL CONTEST'}</p><h2>{isTeam ? 'One shared solution.' : 'One careful mind.'}</h2></div><div className="results-table"><div><span>RANK</span><span>COUNTRY / TEAM</span><span>SCORE</span></div>{['Results will be published after the contest.', 'Verified scores will appear here.', 'Thank you for waiting for the official release.'].map((row, i) => <div key={row}><strong>0{i + 1}</strong><span>{row}</span><span>-</span></div>)}</div></section></> }

function Gallery() { return <><PageIntro eyebrow="Media / Gallery" title="The week in pictures." body="The gallery will become a living record of the contest, the host programme and the people who make IOL feel like a community." /><section className="gallery-grid wrap">{['Opening', 'Contest rooms', 'Bangkok', 'Cultural night', 'Awards', 'Friends'].map((label, index) => <article key={label} className={`gallery-tile gallery-${index + 1}`}><span>0{index + 1}</span><h2>{label}</h2><small>Photos will be added during IOL 2027.</small></article>)}</section></> }

function Press() { return <><PageIntro eyebrow="Media / Press & media kit" title="The story of IOL 2027, ready to share." body="Press contacts, approved event facts, logos and downloadable media materials will be collected here." /><ContentCards cards={[{ label: 'MEDIA CONTACT', title: 'Start with the central team.', body: 'For interviews, filming access or official statements, email iol2027.th@gmail.com.' }, { label: 'MEDIA KIT', title: 'Facts, logos and images.', body: 'A downloadable kit will be published with the full site and updated as the event develops.' }, { label: 'USAGE', title: 'Please use approved assets.', body: 'The visual identity and event name should be reproduced accurately in public coverage.' }]} /></> }

function PeopleSubpage({ kind }: { kind: 'committee' | 'jury' | 'volunteers' }) { const data = kind === 'committee' ? ['Local Organising Committee', 'Operations, programme, finance, communications and the many details that turn a plan into a welcoming week.'] : kind === 'jury' ? ['Jury & Problem Committee', 'Problem writers, translators and markers protect the quality, fairness and spirit of the competition.'] : ['Volunteers', 'Student and community volunteers will welcome delegations, guide movement and help every guest feel at home.']; return <><PageIntro eyebrow={`People / ${data[0]}`} title={data[0]} body={data[1]} /><section className="two-col wrap"><div><p className="eyebrow">Roster update</p><h2>Names will be published after official confirmation.</h2></div><div className="prose"><p>The people listed here will be introduced with a short role description and a clear contact route where appropriate. Until then, the team remains focused on building a safe, generous and well-run event.</p></div></section><section className="pending"><p className="eyebrow">Built together</p><h2>Every good olympiad is a collaboration between people who care about the details.</h2></section></> }

function Privacy() { return <><PageIntro eyebrow="Privacy / PDPA" title="Respecting the people behind the data." body="IOL 2027 will handle participant information carefully, transparently and only for legitimate organising purposes." /><section className="two-col wrap"><div><p className="eyebrow">What this page will cover</p><h2>Clear consent. Limited access. A useful answer to every question.</h2></div><div className="prose"><p>The final policy will describe the data collected for registration, accommodation, transport, dietary needs, emergency contact, guardian consent, payment verification and event operations.</p><p>It will explain retention, access, correction requests, sharing with appointed service teams and how to contact the data controller under Thailand's Personal Data Protection Act.</p></div></section><ContentCards cards={[{ label: 'MINORS', title: 'Extra care for young participants.', body: 'Guardian consent and emergency-contact fields will be treated as sensitive information.' }, { label: 'ACCESS', title: 'Only the right teams see the right data.', body: 'Operational staff receive access based on what they need to do their role.' }, { label: 'CONTACT', title: 'Questions have a home.', body: 'The final policy will name the responsible contact and the change-request process.' }]} /></> }

function AudiencePage({ kind }: { kind: 'teachers' | 'contestants' }) { const teacher = kind === 'teachers'; return <><PageIntro eyebrow={`Audience portal / ${teacher ? 'Teachers & educators' : 'Contestants area'}`} title={teacher ? 'A useful home for team leaders.' : 'Your week, in one place.'} body={teacher ? 'Guidance for delegation leaders and educators will be added as registration opens.' : 'Contestants will find orientation, contest-day notes and practical information here once the programme is confirmed.'} /><ContentCards cards={teacher ? [{ label: 'GUIDANCE', title: 'Registration and deadlines.', body: 'A step-by-step guide will explain the delegation flow and important actions.' }, { label: 'LOGISTICS', title: 'Information to share.', body: 'Travel, accommodation and safeguarding notes will be easy to download and forward.' }] : [{ label: 'BEFORE ARRIVAL', title: 'Know what to expect.', body: 'A calm introduction to the week, the contest rooms and the host programme.' }, { label: 'DURING THE WEEK', title: 'Find the next signal.', body: 'Meeting points, programme changes and practical reminders in one place.' }]} /></> }

function SimpleInfo({ title, eyebrow, body }: { title: string; eyebrow: string; body: string }) { return <><PageIntro eyebrow={eyebrow} title={title} body={body} /><section className="two-col wrap"><div><p className="eyebrow">IOL 2027</p><h2>Open, useful information for an international audience.</h2></div><div className="prose"><p>This page is part of the public information architecture and will be expanded as the Local Organising Committee confirms content, people and operational details.</p><p><a className="text-link" href="/contact">Contact the organising team <ArrowRight size={16} /></a></p></div></section></> }

function MediaLanding() { return <><PageIntro eyebrow="Media" title="The story, in every format." body="Follow the week through photographs, approved facts, press materials and the voices of the people who make IOL 2027 happen." /><SectionLinks links={[{ href: '/media/gallery', label: 'Gallery', detail: 'Photos and video from the event.' }, { href: '/media/press', label: 'Press & media kit', detail: 'Facts, assets and contact information.' }]} /></> }

function NotFound() { return <><PageIntro eyebrow="404" title="That signal was lost." body="The page may have moved, or it has not been published yet." /><div className="wrap"><LinkButton href="/">Return home</LinkButton></div></> }

function App() {
  useEffect(() => { window.scrollTo(0, 0) }, [])
  const path = window.location.pathname.replace(/\/$/, '') || '/'
  const pages: Record<string, React.ReactElement> = {
    '/': <Home />, '/about': <About />, '/about/the-iol': <AboutTheIol />, '/about/thailand': <Thailand />, '/about/thai-language': <ThaiLanguage />, '/thailand': <Thailand />,
    '/programme': <Programme />, '/logistics': <Logistics />, '/logistics/important-dates': <ImportantDates />, '/logistics/guidebook': <Guidebook />,
    '/explore': <Explore />, '/explore/excursions': <ExploreSubpage kind="excursions" />, '/explore/culture': <ExploreSubpage kind="culture" />, '/explore/city-guide': <ExploreSubpage kind="city" />,
    '/sponsors': <Sponsors />, '/people': <People />, '/people/committee': <PeopleSubpage kind="committee" />, '/people/jury': <PeopleSubpage kind="jury" />, '/people/volunteers': <PeopleSubpage kind="volunteers" />,
    '/news': <News />, '/registration': <Registration />, '/registration/how-to-register': <RegistrationHow />, '/registration/fees-deadlines': <RegistrationFees />, '/registration/working-languages': <WorkingLanguages />, '/registration/visas': <Visas />,
    '/results': <Results />, '/results/individual': <Results contest="individual" />, '/results/team': <Results contest="team" />, '/media': <MediaLanding />, '/media/gallery': <Gallery />, '/media/press': <Press />,
    '/contact': <Contact />, '/resources': <Resources />, '/privacy': <Privacy />, '/teachers': <AudiencePage kind="teachers" />, '/contestants': <AudiencePage kind="contestants" />, '/unesco': <SimpleInfo eyebrow="Global partners" title="Learning across borders." body="IOL 2027 will publish confirmed partner and UNESCO information as the host programme develops." />, '/source-code': <SimpleInfo eyebrow="Open source" title="A site made to be handed forward." body="The organising team is documenting the website and deployment so future hosts can learn from the work." />
  }
  const isRegistration = path === '/registration'
  return <div className="app"><Header /><main>{pages[path] || <NotFound />}</main>{!isRegistration && <Footer />}</div>
}

export default App
