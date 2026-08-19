import { useEffect, useState } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight, ExternalLink, MapPin, Menu, Volume2, X } from 'lucide-react'
import { event, schedule, venues } from './siteData'

type NavItem = { label: string; href: string; external?: boolean; children?: { label: string; href: string }[] }

const navigation: NavItem[] = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about', children: [
    { label: 'Host: Thailand', href: '/about/thailand' },
    { label: 'Thai language & script', href: '/about/thai-language' },
    { label: 'Important dates', href: '/about/important-dates' },
  ] },
  { label: 'Hosts', href: '/hosts' },
  { label: 'Sponsors', href: '/sponsors' },
  { label: 'Registration', href: '/registration', children: [
    { label: 'How to register', href: '/registration/how-to-register' },
    { label: 'Fees & deadlines', href: '/registration/fees-deadlines' },
    { label: 'Visa & invitation letters', href: '/registration/visas' },
  ] },
  { label: 'Event guide', href: '/event-guide', children: [
    { label: 'Schedule & venues', href: '/programme' },
    { label: 'Accommodation', href: '/event-guide/accommodation' },
    { label: 'Transportation', href: '/event-guide/transportation' },
    { label: 'Guidebook', href: '/event-guide/guidebook' },
  ] },
  { label: 'Results', href: 'https://ioling.org/results/by_year/', external: true },
  { label: 'Gallery', href: '/gallery' },
  { label: 'People', href: '/people', children: [
    { label: 'Committee', href: '/people/committee' },
    { label: 'Jury & Problem Committee', href: '/people/jury' },
    { label: 'Volunteers', href: '/people/volunteers' },
  ] },
  { label: 'Contact', href: '/contact' },
]

const hosts = [
  { eyebrow: 'HOST 01', name: 'The Promotion of Academic Olympiad and Development of Science Education Foundation (POSN)', shortName: 'POSN', description: 'Nurturing young talent and advancing Thailand through academic Olympiads and science education.', image: '/assets/sponsor-posn-v2.png', className: 'sponsor-posn' },
  { eyebrow: 'HOST 02', name: 'Chulalongkorn University', shortName: 'Chulalongkorn University', description: 'A leading centre of knowledge, innovation and academic excellence in the heart of Bangkok.', image: '/assets/sponsor-chula.png', className: 'sponsor-chula' },
  { eyebrow: 'HOST 03', name: 'Kasetsart University', shortName: 'Kasetsart University', description: 'Driving discovery and meaningful impact through education, research and innovation.', image: '/assets/sponsor-kasetsart.png', className: 'sponsor-kasetsart' },
]

const newsItems = [
  { date: '18 JAN 2027', tag: 'REGISTRATION', title: 'Early bird registration opens', body: 'Fee information is released and the early bird registration period begins.', image: '/assets/iol-social.jpg' },
  { date: '12 MAR 2027', tag: 'REGISTRATION', title: 'Early bird registration closes', body: 'The early bird period ends. Regular registration runs from 13 March to 30 April 2027.', image: '/assets/iol-social.jpg' },
]

const hotelImages = [
  { src: '/assets/mandarin-hotel.jpg', alt: 'Mandarin Hotel Bangkok exterior and surroundings', caption: 'Mandarin Hotel Bangkok' },
  { src: '/assets/hotel-gallery/01-lobby-atrium.jpg', alt: 'Mandarin Hotel Bangkok lobby atrium', caption: 'Lobby atrium' },
  { src: '/assets/hotel-gallery/02-reception.jpg', alt: 'Mandarin Hotel Bangkok reception counter', caption: 'Reception' },
  { src: '/assets/hotel-gallery/03-lobby-lounge.jpg', alt: 'Mandarin Hotel Bangkok lobby lounge', caption: 'Lobby lounge' },
  { src: '/assets/hotel-gallery/04-pool-garden.jpg', alt: 'Mandarin Hotel Bangkok outdoor pool and garden', caption: 'Outdoor pool and garden' },
  { src: '/assets/hotel-gallery/05-grand-ballroom.jpg', alt: 'Mandarin Hotel Bangkok grand ballroom arranged for a conference', caption: 'Grand ballroom' },
  { src: '/assets/hotel-gallery/06-ballroom-stage.jpg', alt: 'Mandarin Hotel Bangkok ballroom and stage', caption: 'Ballroom and stage' },
  { src: '/assets/hotel-gallery/07-ballroom-banquet.jpg', alt: 'Mandarin Hotel Bangkok ballroom event layout', caption: 'Ballroom event space' },
  { src: '/assets/hotel-gallery/08-conference-hall.jpg', alt: 'Mandarin Hotel Bangkok conference hall', caption: 'Conference hall' },
  { src: '/assets/hotel-gallery/09-meeting-room.jpg', alt: 'Mandarin Hotel Bangkok meeting room', caption: 'Meeting room' },
  { src: '/assets/hotel-gallery/10-thai-artwork.jpg', alt: 'Thai-inspired artwork displayed inside Mandarin Hotel Bangkok', caption: 'Thai-inspired hotel artwork' },
]

const thaiPhrases = [
  { thai: 'สวัสดีครับ / สวัสดีค่ะ', reading: 'sawatdee khráp / sawatdee khâ', meaning: 'Hello' },
  { thai: 'ขอบคุณครับ / ขอบคุณค่ะ', reading: 'khop khun khráp / khop khun khâ', meaning: 'Thank you' },
  { thai: 'ขอโทษครับ / ขอโทษค่ะ', reading: 'kho thot khráp / kho thot khâ', meaning: 'Sorry / Excuse me' },
  { thai: 'ไม่เป็นไร', reading: 'mai pen rai', meaning: "It is okay / You're welcome" },
  { thai: 'ใช่', reading: 'chai', meaning: 'Yes' },
  { thai: 'ไม่ใช่', reading: 'mai chai', meaning: 'No / Not correct' },
  { thai: 'อร่อย', reading: 'aroi', meaning: 'Delicious' },
  { thai: 'ชอบ', reading: 'chop', meaning: 'I like it' },
  { thai: 'ห้องน้ำอยู่ที่ไหน', reading: 'hong nam yu thi nai', meaning: 'Where is the restroom?' },
  { thai: 'เท่าไหร่', reading: 'thao rai', meaning: 'How much?' },
  { thai: 'ช่วยด้วย', reading: 'chuai duai', meaning: 'Please help' },
  { thai: 'พูดภาษาอังกฤษได้ไหม', reading: 'phut phasa angkrit dai mai', meaning: 'Can you speak English?' },
]

function NavLink({ item, className }: { item: NavItem; className?: string }) {
  const path = window.location.pathname.replace(/\/$/, '') || '/'
  const matches = (href: string) => href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`)
  const active = !item.external && (matches(item.href) || Boolean(item.children?.some((child) => matches(child.href))))
  return <a className={`${className || ''}${active ? ' active' : ''}`.trim()} href={item.href} aria-current={active ? 'page' : undefined} target={item.external ? '_blank' : undefined} rel={item.external ? 'noreferrer' : undefined}>{item.label}{item.external && <ExternalLink size={12} />}</a>
}

function LinkButton({ href, children, light = false }: { href: string; children: React.ReactNode; light?: boolean }) {
  return <a className={`pill ${light ? 'pill-light' : ''}`} href={href}>{children}<span><ArrowRight size={16} /></span></a>
}

function Header() {
  const [open, setOpen] = useState(false)
  return <>
    <header className="topbar">
      <a className="wordmark" href="/" aria-label="IOL 2027 home"><img src="/assets/iol-mark.png" alt="" /><span>IOL 2027</span></a>
      <nav className="desktop-nav" aria-label="Main navigation">
        {navigation.map((item) => item.children ? <div className="nav-dropdown" key={item.href}><NavLink item={item} className="nav-parent" /><ChevronRight size={13} /><div className="nav-menu">{item.children.map((child) => <a key={child.href} href={child.href}>{child.label}</a>)}</div></div> : <NavLink key={item.href} item={item} />)}
      </nav>
      <button className="menu-button" onClick={() => setOpen(!open)} aria-label="Toggle menu" aria-expanded={open} aria-controls="mobile-navigation">{open ? <X /> : <Menu />}</button>
    </header>
    <div id="mobile-navigation" className={`mobile-menu ${open ? 'open' : ''}`}>
      {navigation.map((item, index) => item.children ? <div className="mobile-nav-group" key={item.href} style={{ '--i': index } as React.CSSProperties}><NavLink item={item} className="mobile-parent" /><div>{item.children.map((child) => <a key={child.href} href={child.href}>{child.label}</a>)}</div></div> : <NavLink key={item.href} item={item} />)}
    </div>
  </>
}

function Footer() {
  return <footer className="site-footer"><a className="footer-identity" href="/"><img src="/assets/iol-mark.png" alt="IOL 2027 mark" /><span><strong>IOL 2027</strong>{event.dates}<br />{event.city}</span></a><nav className="footer-links" aria-label="Footer navigation">{navigation.map((item) => <NavLink key={item.href} item={item} />)}</nav></footer>
}

function PageIntro({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return <section className="page-intro grain"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="lede">{body}</p></section>
}

function ContentCards({ cards }: { cards: { label: string; title: string; body: string }[] }) {
  return <section className="content-cards wrap">{cards.map((card) => <article key={card.title}><span>{card.label}</span><h2>{card.title}</h2><p>{card.body}</p></article>)}</section>
}

function SectionLinks({ links }: { links: { href: string; label: string; detail: string }[] }) {
  return <section className="section-links wrap">{links.map((link) => <a key={link.href} href={link.href}><div><h2>{link.label}</h2><p>{link.detail}</p></div><ArrowRight size={21} /></a>)}</section>
}

function Countdown() {
  const target = new Date(event.openingDate).getTime()
  const [remaining, setRemaining] = useState(Math.max(0, target - Date.now()))
  useEffect(() => { const timer = window.setInterval(() => setRemaining(Math.max(0, target - Date.now())), 1000); return () => window.clearInterval(timer) }, [target])
  const days = Math.floor(remaining / 86400000)
  const hours = Math.floor((remaining % 86400000) / 3600000)
  const minutes = Math.floor((remaining % 3600000) / 60000)
  return <div className="countdown" aria-label={`${days} days until IOL 2027 begins`}><span className="countdown-label">COUNTDOWN TO OPENING</span><div className="countdown-units"><strong>{String(days).padStart(3, '0')}<small>D</small></strong><strong>{String(hours).padStart(2, '0')}<small>H</small></strong><strong>{String(minutes).padStart(2, '0')}<small>M</small></strong></div></div>
}

function HeroHostedBy() {
  return <div className="hero-hosted"><span>Hosted by</span>{hosts.map((host) => <img key={host.shortName} src={host.image} alt={host.shortName} />)}</div>
}

function NewsCarousel() {
  const [active, setActive] = useState(0)
  const item = newsItems[active]
  return <section className="news-carousel" aria-label="IOL 2027 news">
    {active > 0 && <button className="carousel-arrow carousel-arrow-left" type="button" onClick={() => setActive(active - 1)} aria-label="Previous news"><ChevronLeft /></button>}
    <div className="news-slide" key={item.title}><div className="news-image"><img src={item.image} alt="IOL 2027 news placeholder" /></div><div className="news-copy"><div><span>{item.tag}</span><time>{item.date}</time></div><h2>{item.title}</h2><p>{item.body}</p><div className="news-controls">{newsItems.map((news, index) => <button key={news.title} className={index === active ? 'active' : ''} onClick={() => setActive(index)} aria-label={`Show news item ${index + 1}`} />)}</div></div></div>
    {active < newsItems.length - 1 && <button className="carousel-arrow carousel-arrow-right" type="button" onClick={() => setActive(active + 1)} aria-label="Next news"><ChevronRight /></button>}
  </section>
}

function HostCarousel() {
  const [active, setActive] = useState(0)
  const host = hosts[active]
  return <section className="sponsor-carousel wrap" aria-label="IOL 2027 hosts">
    <div className="sponsor-heading"><p className="eyebrow">Hosted by</p><h2>Three institutions.<br /><em>One shared welcome.</em></h2><p className="sponsor-counter">0{active + 1} / 0{hosts.length}</p></div>
    <div className="sponsor-stage">
      {active > 0 && <button className="carousel-arrow carousel-arrow-left" type="button" onClick={() => setActive(active - 1)} aria-label="Previous host"><ChevronLeft /></button>}
      <div className={`sponsor-slide ${host.className}`} key={host.name}>
        <div className="sponsor-copy"><h3>{host.name}</h3><p>{host.description}</p></div>
        <div className="sponsor-logo"><img src={host.image} alt={`${host.name} logo`} /></div><a className="sponsor-profile-link" href="/hosts">View all hosts <ArrowRight size={15} /></a>
      </div>
      {active < hosts.length - 1 && <button className="carousel-arrow carousel-arrow-right" type="button" onClick={() => setActive(active + 1)} aria-label="Next host"><ChevronRight /></button>}
    </div>
    <div className="sponsor-dots">{hosts.map((item, index) => <button key={item.name} className={index === active ? 'active' : ''} onClick={() => setActive(index)} aria-label={`Show ${item.name}`} />)}</div>
  </section>
}

function SponsorPreview({ full = false }: { full?: boolean }) {
  return <section className={`commercial-sponsors wrap ${full ? 'commercial-sponsors-full' : ''}`}>
    <div className="commercial-heading"><p className="eyebrow">Sponsors</p><h2>Partners who help make IOL 2027 possible.</h2><p>Our sponsors support the people, spaces and services that bring delegations together in Bangkok. Confirmed partners will be recognised here according to their level of support and contribution to the Olympiad.</p></div>
    <article className="sponsor-tier sponsor-tier-high"><div className="fictional-logo logo-company-a"><span>A</span><strong>COMPANY A</strong></div><div><span>LEAD SPONSOR</span><h3>Company A</h3><p>Lead sponsors help IOL 2027 welcome international delegations and deliver the programme, venues and participant services that make the Olympiad possible.</p></div></article>
    <div className="sponsor-tier-low-grid"><article className="sponsor-tier sponsor-tier-low"><div className="fictional-logo logo-company-b"><span>B</span><strong>COMPANY B</strong></div><div><span>SUPPORTING SPONSOR</span><h3>Company B</h3></div></article><article className="sponsor-tier sponsor-tier-low"><div className="fictional-logo logo-company-c"><span>C</span><strong>COMPANY C</strong></div><div><span>SUPPORTING SPONSOR</span><h3>Company C</h3></div></article></div>
    {!full && <LinkButton href="/sponsors">View sponsor opportunities</LinkButton>}
  </section>
}

function Home() {
  return <>
    <section className="hero grain">
      <div className="orbit orbit-one" /><div className="orbit orbit-two" />
      <div className="hero-copy">
        <div className="hero-kicker"><p className="system-label">[ BANGKOK · THAILAND · 2027 ]</p><HeroHostedBy /></div>
        <h1><span className="hero-title-small">THE 24TH</span><span className="hero-title-serif">INTERNATIONAL</span><span className="hero-title-main">LINGUISTICS OLYMPIAD</span></h1>
        <p className="hero-deck">Eight days. Two contests. Dozens of languages and hundreds of ways to see the world differently.</p>
        <div className="hero-actions"><LinkButton href="/programme" light>View the programme</LinkButton><a href="/registration" className="text-link">Registration preview <ChevronRight size={16} /></a></div>
        <div className="hero-event-row"><Countdown /><div className="hero-event-place"><strong>21-28 JULY 2027</strong><span>BANGKOK, THAILAND</span></div></div>
      </div>
      <div className="hero-mark"><img src="/assets/iol-mark.png" alt="Official IOL 2027 Thailand mark" /></div>
    </section>
    <NewsCarousel />
    <section className="statement"><h2>A world championship<br />for <em>thinking in languages.</em></h2><div className="statement-grid"><div className="statement-mark"><img src="/assets/iol-wordmark-transparent.png" alt="International Linguistics Olympiad logo" /></div><div className="statement-copy"><p>The International Linguistics Olympiad brings high-school students together to solve complex puzzles drawn from languages around the world using reasoning, intuition and curiosity rather than prior linguistic knowledge.</p><LinkButton href="/about">Discover the Olympiad</LinkButton></div></div></section>
    <HostCarousel />
    <section className="feature-grid wrap">
      <article className="feature-card saffron"><span>INDIVIDUAL CONTEST</span><h3>Five problems.<br />Six hours.</h3><p>Contestants work independently through an exacting set of linguistic puzzles.</p></article>
      <article className="feature-card plum"><span>TEAM CONTEST</span><h3>Four minds.<br />One problem.</h3><p>Teams combine perspectives to solve one large-scale challenge together.</p></article>
      <article className="feature-card jade"><span>HOST PROGRAMME</span><h3>One shared<br />language: curiosity.</h3><p>Excursions, culture and friendships turn a competition into a global community.</p></article>
    </section>
    <section className="venues-preview wrap"><div className="section-heading"><p className="eyebrow">Across Bangkok</p><h2>Three places.<br />One Olympiad.</h2><LinkButton href="/programme">See venues</LinkButton></div><div className="venue-stack">{venues.map((venue) => <article key={venue.index}><span>{venue.index}</span><div><p>{venue.role}</p><h3>{venue.name}</h3><small>{venue.detail}</small></div></article>)}</div></section>
    <SponsorPreview />
  </>
}

function About() {
  return <><PageIntro eyebrow="About the Olympiad" title="Data holds the pattern, deduction holds the key." body="IOL is one of the International Science Olympiads: a yearly meeting of young problem-solvers who decode the structures hidden inside human language." /><section className="two-col wrap"><div><p className="eyebrow">What happens</p><h2>Reasoning through pattern, verified by rigor.</h2></div><div className="prose"><p>Problems may draw on any language in the world. Contestants discover patterns, test hypotheses and explain systems they have never seen before. No specialist language and linguistic theory is assumed.</p><p>Each accredited country or territory may send up to two teams. A contest team has no more than four contestants and one team leader. Contestants take part in both an individual round and a collaborative team round.</p><p>Careful observation, hypothesis testing and a clear explanation matter more than memorised vocabulary.</p></div></section><section className="number-grid wrap"><article><strong>5</strong><span>individual problems</span></article><article><strong>6h</strong><span>individual contest</span></article><article><strong>4</strong><span>students per team</span></article><article><strong>8</strong><span>days together</span></article></section><SectionLinks links={[{ href: '/about/thailand', label: 'Host: Thailand', detail: 'Meet Bangkok and the host programme.' }, { href: '/about/thai-language', label: 'Thai language & script', detail: 'Useful phrases for travelling in Thailand.' }, { href: '/about/important-dates', label: 'Important dates', detail: 'Registration periods and the event week.' }]} /></>
}

function Thailand() {
  const words = ['สวัสดี', '你好', 'HELLO', 'HALLO', 'こんにちは', 'नमस्ते', 'مرحبا', 'BONJOUR', 'HOLA', 'CIAO', '안녕하세요', 'ΓΕΙΑ ΣΟΥ']
  return <><PageIntro eyebrow="Host: Thailand" title="The journey begins in Bangkok." body="In 2027, the IOL comes to Thailand, a meeting point of scripts, sounds, histories, neighbourhoods and new ways of seeing." /><section className="word-cloud wrap" aria-label="Greetings in many languages">{words.map((word, index) => <span key={word} className={`word-cloud-${(index % 6) + 1}`}>{word}</span>)}</section><section className="three-notes wrap"><article><h3>Read the city</h3><p>Bangkok links the home base, university campuses, contest rooms, ceremonies and the city programme.</p></article><article><h3>Meet the host culture</h3><p>Excursions, food, cultural programming and everyday encounters give delegations a way to experience Thailand together.</p></article><article><h3>Notice the forms</h3><p>Thai language and script offer a living system whose patterns reward close attention.</p></article></section><section className="experience-grid wrap"><article className="exp-one"><span>DAY 04 / EXCURSION</span><h2>Move beyond the contest room.</h2><p>A shared day to encounter Thailand through place, culture and conversation. The final route will be confirmed by the organising team.</p></article><article className="exp-two"><span>DAY 05 / CITY PROGRAMME</span><h2>Read Bangkok.</h2><p>Campus, neighbourhood, food, river and street life become part of the week-long setting.</p></article><article className="exp-three"><span>DAY 07 / CULTURAL NIGHT</span><h2>Celebrate the community.</h2><p>After solutions, awards and closing, delegations gather for the host culture and friendships that outlast the score.</p></article></section></>
}

function speakThai(text: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text.replace(' / ', ' '))
  utterance.lang = 'th-TH'
  utterance.rate = 0.82
  window.speechSynthesis.speak(utterance)
}

function ThaiLanguage() {
  const letters = [{ t: 'ก', r: 'ko kai', m: 'chicken' }, { t: 'ข', r: 'kho khai', m: 'egg' }, { t: 'ค', r: 'kho khwai', m: 'buffalo' }, { t: 'ง', r: 'ngo ngu', m: 'snake' }, { t: 'จ', r: 'cho chan', m: 'plate' }, { t: 'ช', r: 'cho chang', m: 'elephant' }]
  return <><PageIntro eyebrow="Thai language & script" title="A practical pocket phrasebook." body="Listen to useful Thai words and phrases before you arrive, then keep this page close while travelling around Bangkok." /><section className="thai-intro wrap"><div><p className="eyebrow">A quick note</p><h2>Speak gently. Listen closely.</h2></div><div className="prose"><p>Thai is a tonal language. The browser pronunciation button uses the speech voice available on your device, so pronunciation quality may vary. The English readings below are practical approximations.</p><p>Men commonly end polite sentences with <strong>ครับ (khráp)</strong>; women commonly use <strong>ค่ะ (khâ)</strong>.</p></div></section><section className="phrase-grid wrap">{thaiPhrases.map((phrase) => <article key={phrase.thai}><h2 lang="th">{phrase.thai}</h2><p className="phrase-reading">{phrase.reading}</p><p>{phrase.meaning}</p><button type="button" onClick={() => speakThai(phrase.thai)} aria-label={`Play Thai pronunciation for ${phrase.meaning}`}><Volume2 size={18} /> Listen</button></article>)}</section><section className="thai-alphabet wrap"><div><p className="eyebrow">Thai script at a glance</p><h2>Letters carry sound, class and character.</h2></div><div className="alphabet-grid">{letters.map((letter) => <article key={letter.t}><strong lang="th">{letter.t}</strong><span>{letter.r}</span><small>{letter.m}</small><button onClick={() => speakThai(letter.t)} aria-label={`Play ${letter.t}`}><Volume2 size={16} /></button></article>)}</div></section></>
}

function Programme() {
  return <><PageIntro eyebrow="Schedule & venues" title="Eight days in Bangkok." body="The tentative programme runs from 21 to 28 July 2027 across Mandarin Hotel, Kasetsart University, Chulalongkorn University and other programme locations." /><figure className="schedule-artifact wrap"><img src="/assets/iol-2027-schedule.png" alt="Tentative hourly schedule for IOL 2027 from 21 to 28 July" /><figcaption><div><span>TENTATIVE SCHEDULE</span><p>Times and activities may change as the organising team confirms operations.</p></div><a className="pill" href="/downloads/IOL-2027-Schedule.html" target="_blank" rel="noreferrer">Open full schedule <span><ExternalLink size={15} /></span></a></figcaption></figure><section className="timeline wrap">{schedule.map((item) => <article key={item.date}><div><span>{item.day}</span><strong>{item.date}</strong></div><h2>{item.title}</h2><p>{item.detail}</p></article>)}</section><section className="venue-section"><div className="wrap"><p className="eyebrow">Venue plan</p><h2>Bangkok, connected.</h2><div className="venue-cards">{venues.map((venue) => <article key={venue.index}><p>{venue.role}</p><h3>{venue.name}</h3><small>{venue.detail}</small></article>)}</div></div></section></>
}

function Hosts() {
  return <><PageIntro eyebrow="Hosts" title="A shared welcome from Thailand." body="IOL 2027 is hosted by organisations that bring together academic Olympiad experience, education, research and Bangkok's university community." /><section className="sponsor-detail-list wrap">{hosts.map((host, index) => <article className={`sponsor-detail ${host.className}`} key={host.name}><div className="sponsor-detail-logo"><img src={host.image} alt={`${host.name} logo`} /></div><div><h2>{host.name}</h2><p>{host.description}</p><p className="sponsor-detail-note">{index === 0 ? 'POSN supports Thailand academic Olympiads and the development of young talent.' : index === 1 ? 'Chulalongkorn University hosts the contests, solution presentations, closing ceremony and cultural night.' : 'Kasetsart University welcomes delegations for the opening ceremony.'}</p></div></article>)}</section></>
}

function Sponsors() {
  return <><PageIntro eyebrow="Sponsors" title="A clear place for every level of support." body="This page demonstrates how approved sponsors can be presented without confusing them with the official hosts." /><SponsorPreview full /><section className="sponsor-thanks"><p className="eyebrow">Sponsor IOL 2027</p><h2>Help young minds look closer.</h2><a className="text-link" href="mailto:iol2027.th@gmail.com?subject=IOL%202027%20sponsorship">Contact the organising team <ArrowRight size={16} /></a></section></>
}

function Registration() {
  return <><section className="coming-soon grain"><div className="coming-mark"><img src="/assets/iol-mark.png" alt="IOL 2027 Thailand mark" /></div><div><p className="system-label">REGISTRATION CHANNEL / PREPARING</p><h1>OPENS<br /><em>18 JAN 2027.</em></h1><p>Registration is not open yet. The planned flow uses one team leader per country, an invitation code, staged participant data, bank-transfer payment and proof review.</p><div className="hero-actions"><LinkButton href="/registration/how-to-register" light>See the registration flow</LinkButton><a href="/registration/fees-deadlines" className="text-link">Fees & deadlines <ArrowRight size={16} /></a></div></div><aside><span>FEE RELEASE</span><strong>18 JAN 2027</strong><span>EARLY BIRD</span><strong>18 JAN-12 MAR</strong><span>REGULAR</span><strong>13 MAR-30 APR</strong><span>STATUS</span><strong>PREPARING</strong></aside></section></>
}

function RegistrationHow() {
  const steps = ['Receive an invitation code from the organising team.', 'Create a team-leader account and verify your email address.', 'Register the delegation, teams, members and travel details.', 'Submit the registration and follow the payment instructions.', 'Upload proof of payment for review by the organising team.', 'Receive confirmation and participant documents.']
  return <><PageIntro eyebrow="Registration / How to register" title="One clear path for every delegation." body="One team leader coordinates the delegation through registration, payment confirmation, travel information and document delivery." /><section className="steps wrap">{steps.map((step, index) => <article key={step}><span>0{index + 1}</span><div><h2>{step}</h2><p>{index === 3 ? 'Fees, payment instructions and registration periods are published together on the Fees & deadlines page.' : index === 5 ? 'Invitation letters are sent to registered email addresses after payment is confirmed.' : 'The registration dashboard will keep the next required action visible.'}</p></div></article>)}</section></>
}

function RegistrationFees() {
  return <><PageIntro eyebrow="Registration / Fees & deadlines" title="Registration and payment in one place." body="The confirmed registration windows come from the IOL 2027 fees and important dates notice. Final amounts and bank-account instructions will be published after Finance approval." /><section className="fee-grid wrap"><article><span>FEE RELEASE</span><strong>18 JAN 2027</strong><p>Fee information and approved payment instructions are released.</p></article><article><span>EARLY BIRD</span><strong>18 JAN-12 MAR</strong><p>Early bird registration period.</p></article><article><span>REGULAR</span><strong>13 MAR-30 APR</strong><p>Regular registration period.</p></article></section><section className="two-col wrap"><div><p className="eyebrow">Payment process</p><h2>Register, transfer and submit proof.</h2></div><div className="prose"><p>Delegations will follow the bank-transfer instructions shown in the registration system and upload the requested proof of payment. The organising team will verify the payment before confirming registration.</p><p>Final fees, bank details, transfer references, accepted file formats, refund conditions and any additional-person rate will be published here once approved.</p></div></section></>
}

function Visas() {
  return <><PageIntro eyebrow="Registration / Visa & invitation letters" title="Check the requirements for your own country." body="Visa requirements and application conditions differ by nationality, passport type and country of application. Please confirm the current rules with the Royal Thai Embassy or Consulate responsible for your country." /><section className="two-col wrap"><div><p className="eyebrow">Before you travel</p><h2>Use the guidance issued for your country.</h2></div><div className="prose"><p>Please check the conditions directly with the Royal Thai Embassy or Consulate responsible for your country. The organising team cannot determine whether a participant needs a visa or guarantee the outcome of an application.</p><p>After payment is confirmed, the invitation letter will be sent to the participant's registered email address. The letter supports a visa application but does not replace the visa decision made by the relevant Thai authority.</p></div></section><ContentCards cards={[{ label: 'OFFICIAL SOURCE', title: 'Thai e-Visa', body: 'Check official Thai e-Visa information and whether online application is available for your location.' }, { label: 'INVITATION LETTER', title: 'Sent after confirmation.', body: "Once payment is confirmed, the invitation letter will be sent automatically through the system to the participant's registered email address." }, { label: 'LOCAL AUTHORITY', title: 'Check your Thai Consulate.', body: 'Application documents, timelines and procedures differ between countries.' }]} /><section className="visa-link wrap"><a className="pill" href="https://www.thaievisa.go.th/" target="_blank" rel="noreferrer">Visit thaievisa.go.th <span><ExternalLink size={16} /></span></a></section></>
}

function EventGuide() {
  return <><PageIntro eyebrow="Event guide" title="Everything you need for the week." body="Find the schedule, venues, home base, official transportation and the practical guidebook in one place." /><SectionLinks links={[{ href: '/programme', label: 'Schedule & venues', detail: 'The tentative eight-day programme and venue plan.' }, { href: '/event-guide/accommodation', label: 'Accommodation', detail: 'Mandarin Hotel, our home base in Bangkok.' }, { href: '/event-guide/transportation', label: 'Transportation', detail: 'Airport and programme transfers coordinated by the organising team.' }, { href: '/event-guide/guidebook', label: 'Guidebook', detail: 'The downloadable event guide will be added later.' }]} /></>
}

function Accommodation() {
  const [active, setActive] = useState(0)
  const image = hotelImages[active]
  return <><PageIntro eyebrow="Event guide / Accommodation" title="Our home base in Bangkok." body="Mandarin Hotel Bangkok, managed by Centre Point, is the home base for IOL 2027 delegations, jury, volunteers and staff." /><section className="hotel-feature wrap"><figure className="hotel-gallery"><div className="hotel-gallery-frame">{active > 0 && <button className="carousel-arrow carousel-arrow-left" type="button" onClick={() => setActive(active - 1)} aria-label="Previous hotel image"><ChevronLeft /></button>}<img key={image.src} src={image.src} alt={image.alt} />{active < hotelImages.length - 1 && <button className="carousel-arrow carousel-arrow-right" type="button" onClick={() => setActive(active + 1)} aria-label="Next hotel image"><ChevronRight /></button>}</div><figcaption><span>{image.caption} · Official Mandarin Hotel Bangkok image</span><span>{active + 1} / {hotelImages.length}</span></figcaption></figure><div><p className="eyebrow">Mandarin Hotel Bangkok</p><h2>662 Rama IV Road, Bang Rak, Bangkok 10500</h2><p>Located near MRT Sam Yan and within easy reach of Chulalongkorn University and central Bangkok.</p><div className="hotel-actions"><a className="pill" href="https://www.mandarin-bkk.com/" target="_blank" rel="noreferrer">Hotel website <span><ExternalLink size={16} /></span></a><a className="text-link" href="https://www.google.com/maps/search/?api=1&query=Mandarin+Hotel+Bangkok+662+Rama+IV+Road" target="_blank" rel="noreferrer"><MapPin size={16} /> Open in Google Maps</a></div></div></section><section className="hotel-map wrap"><iframe title="Mandarin Hotel Bangkok location" src="https://www.google.com/maps?q=Mandarin+Hotel+Bangkok+662+Rama+IV+Road&output=embed" loading="lazy" allowFullScreen referrerPolicy="no-referrer-when-downgrade" /></section></>
}

function Transportation() {
  return <><PageIntro eyebrow="Event guide / Transportation" title="Arrive, move and depart with us." body="Official airport pick-up and drop-off services will be provided at Suvarnabhumi Airport (BKK) and Don Mueang International Airport (DMK) during the designated arrival and departure periods." /><ContentCards cards={[{ label: 'ARRIVAL & DEPARTURE', title: 'Share your flight details.', body: 'Participants will be asked to submit their flight details through the registration system so the organising team can coordinate transportation.' }, { label: 'LOCAL MOVEMENT', title: 'Transfers are provided.', body: 'Transfers between the home base, contest campuses, ceremonies and city programme venues will be provided and coordinated by the organising team.' }]} /><section className="pickup-plan wrap"><div><p className="eyebrow">Airport pick-up service</p><h2>The service timetable will appear here.</h2><p>Pick-up windows, airport meeting points, contact instructions and coach departure times will be published after the transport plan is confirmed.</p></div><div className="pickup-table-wrap"><table className="pickup-table"><caption>Future airport pick-up schedule</caption><thead><tr><th>Airport</th><th>Service period</th><th>Operating hours</th><th>Meeting point</th></tr></thead><tbody><tr><td>BKK / DMK</td><td colSpan={3}>Schedule to be confirmed</td></tr></tbody></table></div></section></>
}

function ImportantDates() {
  const dates = [
    { label: 'FEE RELEASE', date: '18 JAN 2027', detail: 'Fee information is released.' },
    { label: 'EARLY BIRD', date: '18 JAN-12 MAR', detail: 'Early bird registration period.' },
    { label: 'REGULAR', date: '13 MAR-30 APR', detail: 'Regular registration period.' },
    { label: 'IOL 2027', date: '21-28 JULY', detail: 'The 24th International Linguistics Olympiad in Bangkok.' },
  ]
  return <><PageIntro eyebrow="About / Important dates" title="Keep the key moments in view." body="Registration dates come from the IOL 2027 fees and important dates notice. Additional deadlines will be added after they are approved." /><section className="date-list wrap">{dates.map((item) => <article key={item.label}><div><p>{item.label}</p><h2>{item.date}</h2><small>{item.detail}</small></div></article>)}</section></>
}

function Guidebook() {
  return <><PageIntro eyebrow="Event guide / Guidebook" title="Your practical guide to the week." body="The official programme booklet will be provided later as a downloadable PDF." /><section className="guidebook-panel wrap"><div><p className="eyebrow">Coming later</p><h2>One document for the whole week.</h2><p className="prose">The final PDF will gather the confirmed schedule, venue, accommodation, transportation, safety, emergency contact and participant instructions. No placeholder download is provided until the approved file is ready.</p></div><div className="guidebook-placeholder"><span>PDF</span><strong>Guidebook<br />2027</strong><small>Not yet published</small></div></section></>
}

function Gallery() {
  return <><PageIntro eyebrow="Gallery" title="The week in pictures." body="The gallery will become a living record of the contest, host programme and people who make IOL feel like a community." /><section className="gallery-grid wrap">{['Opening', 'Contest rooms', 'Bangkok', 'Cultural night', 'Awards', 'Friends'].map((label, index) => <article key={label} className={`gallery-tile gallery-${index + 1}`}><h2>{label}</h2><small>Event photographs will be added after the July 2027 programme.</small></article>)}</section></>
}

function People() {
  return <><PageIntro eyebrow="People" title="Built by many kinds of minds." body="Committee, jury and volunteer information will be added when the approved names and roles are provided." /><SectionLinks links={[{ href: '/people/committee', label: 'Committee', detail: 'Local organising and operational teams.' }, { href: '/people/jury', label: 'Jury & Problem Committee', detail: 'Judges, problem writers, translators and markers.' }, { href: '/people/volunteers', label: 'Volunteers', detail: 'The people who welcome and guide every delegation.' }]} /></>
}

function PeopleSubpage({ kind }: { kind: 'committee' | 'jury' | 'volunteers' }) {
  const jury = kind === 'jury'
  const title = kind === 'committee' ? 'Committee' : jury ? 'Jury & Problem Committee' : 'Volunteers'
  const body = kind === 'committee' ? 'The approved committee roster and role descriptions will be published here.' : jury ? 'The main judges, problem writers, translators and markers will be introduced with photographs and approved biographies.' : 'The approved volunteer information and responsibilities will be published here.'
  return <><PageIntro eyebrow={`People / ${title}`} title={title} body={body} />{jury ? <section className="portrait-grid wrap">{Array.from({ length: 6 }, (_, index) => <article key={index}><div className="portrait-placeholder"><span>PHOTO</span></div><h2>Name to be confirmed</h2><p>Role and biography will be added after approval.</p></article>)}</section> : <section className="two-col wrap"><div><p className="eyebrow">Roster pending</p><h2>Information will be added when the organising team confirms it.</h2></div><div className="prose"><p>This page intentionally does not show photo placeholders. Names, responsibilities and public contact details will be published only after approval.</p></div></section>}</>
}

function Contact() {
  return <><PageIntro eyebrow="Contact" title="Let's keep the signal clear." body="For enquiries regarding IOL 2027, visa-related issues, sponsorship, programme information, future announcements, or any other issues, please contact the Local Organising Committee through email." /><section className="contact-panel wrap"><div><p className="eyebrow">Central contact</p><a className="contact-email" href="mailto:iol2027.th@gmail.com">iol2027.th@gmail.com</a></div><div className="prose"><p>Please include a clear subject line and the participant's country or delegation where relevant so the enquiry can reach the appropriate team.</p><a className="pill" href="mailto:iol2027.th@gmail.com?subject=IOL%202027%20enquiry">Send an enquiry <span><ArrowRight size={16} /></span></a></div></section></>
}

function Privacy() {
  return <><PageIntro eyebrow="Privacy / PDPA" title="Respecting the people behind the data." body="IOL 2027 will collect and use participant information only for legitimate registration, safety and event-operation purposes." /><section className="two-col wrap"><div><p className="eyebrow">Privacy principles</p><h2>Clear purpose. Limited access. Responsible deletion.</h2></div><div className="prose"><p>Registration may include identity, passport, contact, accommodation, transport, dietary, accessibility, guardian, emergency-contact, payment-proof, check-in and event-operation data.</p><p>Access will be limited by staff role. The final notice will identify the legal data controller, applicable lawful bases, retention periods, service providers and contact route for rights requests under Thailand's Personal Data Protection Act.</p></div></section></>
}

function ExternalResultsRedirect() {
  useEffect(() => { window.location.replace('https://ioling.org/results/by_year/') }, [])
  return <PageIntro eyebrow="Results" title="Opening the official IOL results archive." body="If the archive does not open automatically, use the Results link in the navigation." />
}

function NotFound() {
  return <><PageIntro eyebrow="404" title="That signal was lost." body="The page may have moved or is not published yet." /><div className="not-found-link wrap"><LinkButton href="/">Return home</LinkButton></div></>
}

function App() {
  useEffect(() => { window.scrollTo(0, 0) }, [])
  const path = window.location.pathname.replace(/\/$/, '') || '/'
  const pages: Record<string, React.ReactElement> = {
    '/': <Home />,
    '/about': <About />, '/about/the-iol': <About />, '/about/thailand': <Thailand />, '/about/thai-language': <ThaiLanguage />, '/about/important-dates': <ImportantDates />, '/thailand': <Thailand />,
    '/hosts': <Hosts />, '/sponsors': <Sponsors />,
    '/registration': <Registration />, '/registration/how-to-register': <RegistrationHow />, '/registration/fees-deadlines': <RegistrationFees />, '/registration/payment': <RegistrationFees />, '/registration/visas': <Visas />, '/registration/accredited-countries': <Registration />, '/registration/working-languages': <Registration />,
    '/event-guide': <EventGuide />, '/programme': <Programme />, '/event-guide/accommodation': <Accommodation />, '/event-guide/transportation': <Transportation />, '/event-guide/guidebook': <Guidebook />,
    '/logistics': <EventGuide />, '/logistics/accommodation': <Accommodation />, '/logistics/transportation': <Transportation />, '/logistics/important-dates': <ImportantDates />, '/logistics/guidebook': <Guidebook />,
    '/explore': <Thailand />, '/explore/excursions': <Thailand />, '/explore/culture': <Thailand />, '/explore/city-guide': <Thailand />,
    '/gallery': <Gallery />, '/media': <Gallery />, '/media/gallery': <Gallery />, '/media/press': <Contact />, '/news': <Home />,
    '/people': <People />, '/people/committee': <PeopleSubpage kind="committee" />, '/people/jury': <PeopleSubpage kind="jury" />, '/people/volunteers': <PeopleSubpage kind="volunteers" />,
    '/results': <ExternalResultsRedirect />, '/results/individual': <ExternalResultsRedirect />, '/results/team': <ExternalResultsRedirect />,
    '/contact': <Contact />, '/privacy': <Privacy />,
  }
  const isRegistration = path === '/registration'
  return <div className="app"><Header /><main>{pages[path] || <NotFound />}</main>{!isRegistration && <Footer />}</div>
}

export default App
