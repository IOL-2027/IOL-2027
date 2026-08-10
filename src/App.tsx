import { useEffect, useState } from 'react'
import { ArrowRight, Asterisk, CalendarDays, ChevronRight, Menu, X } from 'lucide-react'
import { event, schedule, venues } from './siteData'

const nav = [
  ['Home', '/'], ['About', '/about'], ['Thailand', '/thailand'], ['Programme', '/programme'],
  ['Explore', '/explore'], ['Sponsors', '/sponsors'], ['People', '/people'], ['News', '/news'], ['Registration', '/registration'], ['Contact', '/contact'],
]

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
      <nav className="desktop-nav" aria-label="Main navigation">{nav.slice(1, 7).map(([label, href]) => <a key={href} href={href}>{label}</a>)}</nav>
      <a className="register-link" href="/registration">Register <ArrowRight size={15} /></a>
      <button className="menu-button" onClick={() => setOpen(!open)} aria-label="Toggle menu">{open ? <X /> : <Menu />}</button>
    </header>
    <div className={`mobile-menu ${open ? 'open' : ''}`}>{nav.map(([label, href], i) => <a key={href} href={href} style={{ '--i': i } as React.CSSProperties}>{label}</a>)}</div>
  </>
}

function Footer() {
  return <footer>
    <section className="footer-sponsors" aria-label="Official supporting organisations">
      <p className="eyebrow">Official supporting organisations</p>
      <div className="footer-sponsor-logos"><div><img src="/assets/sponsor-posn-v2.png" alt="POSN" /><span>POSN</span></div><div><img src="/assets/sponsor-chula.png" alt="Chulalongkorn University" /><span>Chulalongkorn University</span></div><div><img src="/assets/sponsor-kasetsart.png" alt="Kasetsart University" /><span>Kasetsart University</span></div></div>
    </section>
    <div><img src="/assets/iol-mark.png" alt="IOL 2027 mark" /><p>{event.name}<br />{event.dates} · {event.city}</p></div>
    <div className="footer-links"><a href="/about">About IOL</a><a href="/programme">Programme</a><a href="/sponsors">Sponsors</a><a href="/registration">Registration</a><a href="/contact">Contact</a><a href="/resources">Sources & notes</a></div><a className="footer-email" href="mailto:iol2027.th@gmail.com">iol2027.th@gmail.com</a>
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
function NotFound() { return <><PageIntro eyebrow="404" title="That signal was lost." body="The page may have moved, or it has not been published yet." /><div className="wrap"><LinkButton href="/">Return home</LinkButton></div></> }

function App() {
  useEffect(() => { window.scrollTo(0, 0) }, [])
  const path = window.location.pathname.replace(/\/$/, '') || '/'
  const pages: Record<string, React.ReactElement> = { '/': <Home />, '/about': <About />, '/thailand': <Thailand />, '/programme': <Programme />, '/explore': <Explore />, '/sponsors': <Sponsors />, '/people': <People />, '/news': <News />, '/registration': <Registration />, '/contact': <Contact />, '/resources': <Resources /> }
  const isRegistration = path === '/registration'
  return <div className="app"><Header /><main>{pages[path] || <NotFound />}</main>{!isRegistration && <Footer />}</div>
}

export default App
