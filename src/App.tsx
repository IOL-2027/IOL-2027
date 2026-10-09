import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Camera, CheckCircle, ChevronLeft, ChevronRight, ClipboardCheck, ExternalLink, FileText, Lock, MailCheck, MapPin, Menu, QrCode, ShieldCheck, Upload, Users, Volume2, X } from 'lucide-react'
import { event, schedule, venues } from './siteData'
import { committeeHeading, committees, royalPatron } from './committeeData'

type NavItem = { label: string; href: string; external?: boolean; children?: { label: string; href: string }[] }
type RegistrationFieldKind = 'text' | 'email' | 'tel' | 'number' | 'date' | 'time' | 'textarea' | 'select' | 'multiselect' | 'upload' | 'readonly'
type RegistrationField = { label: string; value: string; help: string; kind?: RegistrationFieldKind; options?: string[]; accept?: string }
type RegistrationRecord = { label: string; meta: string; status: string; fields: RegistrationField[]; notes?: RegistrationField[] }
type RegistrationArea = { title: string; status: string; body: string; fields: RegistrationField[]; notes?: RegistrationField[]; records?: RegistrationRecord[]; required?: boolean }

const badgeScannerMode = import.meta.env.VITE_BADGE_SCANNER_MODE === 'live' ? 'live' : 'demo'
const demoBadgeCode = 'IOL2027-POC-DEMO'

const registrationSelectOptions: Record<string, string[]> = {
  'Number of teams': ['1', '2'],
  Role: ['Contestant', 'Team Leader', 'Deputy', 'Observer'],
  'Team assignment': ['Thailand A', 'Thailand B', 'Thailand A and Thailand B', 'Not assigned'],
  'Team Leader': ['Dr. Ananya Somchai', 'Prof. Preecha K.', 'Add another adult'],
  'Team contest language': ['English', 'French', 'German', 'Russian', 'Spanish', 'Arabic', 'Chinese', 'Other'],
  'Gender for room allocation': ['Female', 'Male', 'Non-binary', 'Prefer to discuss with LOC'],
  'Exam language': ['English', 'French', 'German', 'Russian', 'Spanish', 'Arabic', 'Chinese', 'Other'],
  'T-shirt size': ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
  'Room type preference': ['Twin room', 'Single if available', 'No preference'],
  'Adult room preference': ['Single room requested', 'Shared room (twin)', 'No preference'],
  'Observer category': ['Regular observer', 'Guest observer', 'Observer pending approval'],
  Direction: ['Arrival', 'Departure'],
  'Arrival point': ['Suvarnabhumi Airport (BKK)', 'Don Mueang Airport (DMK)', 'Bangkok railway station', 'Other'],
  'Departure point': ['Suvarnabhumi Airport (BKK)', 'Don Mueang Airport (DMK)', 'Bangkok railway station', 'Other'],
  'Airport terminal': ['Main terminal', 'Domestic terminal', 'International terminal', 'Not sure'],
  'People on this trip': ['Narin Chaiwat', 'Mali Phan', 'Kiet Rattanakul', 'Arun Songsiri', 'Dr. Ananya Somchai', 'Prof. Preecha K.'],
  'Arrival trip': ['Arrival group A', 'Arrival group B', 'Not assigned yet'],
  'Departure trip': ['Departure group A', 'Departure group B', 'Not assigned yet'],
  'Change status': ['Open', 'Submitted to LOC', 'Locked'],
}

function fieldIsReadonly(field: RegistrationField, areaTitle: string) {
  if (field.kind === 'readonly') return true
  if (areaTitle === 'Rooms and welfare' || areaTitle === 'Review & submit') return true
  if (areaTitle.startsWith('Payment') && !['Proof of payment file', 'Number of invoices requested', 'Invoice details', 'Invoice recipient name', 'Invoice recipient address'].includes(field.label)) return true
  if (areaTitle === 'Teams' && ['Team code', 'Team status'].includes(field.label)) return true
  if (areaTitle === 'Travel' && ['Meeting point note', 'Volunteer contact', 'Pickup group', 'Hotel pickup time', 'Bus or van group', 'Boarding check'].includes(field.label)) return true
  return false
}

function inferRegistrationFieldKind(field: RegistrationField, areaTitle: string): RegistrationFieldKind {
  if (field.kind) return field.kind
  if (field.label === 'Guardian consent' || field.label === 'Proof of payment file') return 'upload'
  if (fieldIsReadonly(field, areaTitle)) return 'readonly'
  if (field.label === 'People on this trip') return 'multiselect'
  if (registrationSelectOptions[field.label]) return 'select'
  if (field.label === 'Date of birth' || field.label === 'Local date') return 'date'
  if (field.label === 'Local time') return 'time'
  if (['Number of contestants', 'Number of observers', 'Number of invoices requested'].includes(field.label)) return 'number'
  if (field.label.includes('email') || field.label === 'Email') return 'email'
  if (field.label.includes('Mobile') || field.label.includes('WhatsApp')) return 'tel'
  if (field.label.includes('notes') || field.label === 'Emergency contact') return 'textarea'
  return 'text'
}

const navigation: NavItem[] = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about', children: [
    { label: 'Host: Thailand', href: '/about/thailand' },
    { label: 'Useful Thai', href: '/about/thai-language' },
    { label: 'Important dates', href: '/about/important-dates' },
  ] },
  { label: 'Hosts', href: '/hosts' },
  { label: 'Sponsors', href: '/sponsors' },
  { label: 'Registration', href: '/registration', children: [
    { label: 'How to register', href: '/registration/how-to-register' },
    { label: 'Fees & deadlines', href: '/registration/fees-deadlines' },
    { label: 'Visa & invitation letters', href: '/registration/visas' },
    { label: 'Team Leader account', href: '/registration/team-leader' },
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
  { thai: 'สวัสดีครับ / สวัสดีค่ะ', reading: 'sa-wàt-dii khráp / sa-wàt-dii khâ', ipa: ['/sàʔwàtdiː kʰráp/', '/sàʔwàtdiː kʰâ/'], meaning: 'Hello', audio: ['/audio/th/sawatdee-khrap.m4a', '/audio/th/sawatdee-kha.m4a'] },
  { thai: 'ขอบคุณครับ / ขอบคุณค่ะ', reading: 'khɔ̀ːp khun khráp / khɔ̀ːp khun khâ', ipa: ['/kʰɔ̀ːp kʰun kʰráp/', '/kʰɔ̀ːp kʰun kʰâ/'], meaning: 'Thank you', audio: ['/audio/th/khobkhun-khrap.m4a', '/audio/th/khobkhun-kha.m4a'] },
  { thai: 'ขอโทษครับ / ขอโทษค่ะ', reading: 'khɔ̌ː thôːt khráp / khɔ̌ː thôːt khâ', ipa: ['/kʰɔ̌ː tʰôːt kʰráp/', '/kʰɔ̌ː tʰôːt kʰâ/'], meaning: 'Sorry / Excuse me', audio: ['/audio/th/khothoat-khrap.m4a', '/audio/th/khothoat-kha.m4a'] },
  { thai: 'ไม่เป็นไร', reading: 'mâj pen raj', ipa: ['/mâj pen raj/'], meaning: "It's okay / You're welcome", audio: ['/audio/th/mai-penrai.m4a'] },
  { thai: 'ใช่', reading: 'tɕʰâj', ipa: ['/tɕʰâj/'], meaning: 'Yes', audio: ['/audio/th/chai.m4a'] },
  { thai: 'ไม่ใช่', reading: 'mâj tɕʰâj', ipa: ['/mâj tɕʰâj/'], meaning: 'No / That is not correct', audio: ['/audio/th/mai-chai.m4a'] },
  { thai: 'อร่อย', reading: 'ʔà-rɔ̀j', ipa: ['/ʔàrɔ̀j/'], meaning: 'Delicious', audio: ['/audio/th/aroi.m4a'] },
  { thai: 'ชอบ', reading: 'tɕʰɔ̂ːp', ipa: ['/tɕʰɔ̂ːp/'], meaning: 'I like it', audio: ['/audio/th/chob.m4a'] },
  { thai: 'ห้องน้ำอยู่ที่ไหน', reading: 'hɔ̂ːŋ náːm jùː tʰîː nǎj', ipa: ['/hɔ̂ːŋ náːm jùː tʰîː nǎj/'], meaning: 'Where is the restroom?', audio: ['/audio/th/hongnam.m4a'] },
  { thai: 'เท่าไหร่', reading: 'tʰâw râj', ipa: ['/tʰâw râj/'], meaning: 'How much?', audio: ['/audio/th/thaorai.m4a'] },
  { thai: 'ช่วยด้วย', reading: 'tɕʰûaj dûaj', ipa: ['/tɕʰûaj dûaj/'], meaning: 'Please help', audio: ['/audio/th/chuai-duai.m4a'] },
  { thai: 'พูดภาษาอังกฤษได้ไหม', reading: 'pʰûːt pʰaː-sǎː ʔaŋ-krìt dâj mǎj', ipa: ['/pʰûːt pʰaːsǎː ʔaŋkrìt dâj mǎj/'], meaning: 'Can you speak English?', audio: ['/audio/th/phut-angkrit.m4a'] },
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

function PageIntro({ eyebrow, title, body }: { eyebrow?: string; title: string; body: string }) {
  return <section className="page-intro grain">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1><p className="lede">{body}</p></section>
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
  const leadSponsors = [
    { letter: 'A', name: 'Company A', logoClass: 'logo-company-a' },
    { letter: 'B', name: 'Company B', logoClass: 'logo-company-b' },
    { letter: 'C', name: 'Company C', logoClass: 'logo-company-c' },
  ]
  const supportingSponsors = [
    { letter: 'A', name: 'Supporting Company A', logoClass: 'logo-company-a' },
    { letter: 'B', name: 'Supporting Company B', logoClass: 'logo-company-b' },
    { letter: 'C', name: 'Supporting Company C', logoClass: 'logo-company-c' },
    { letter: 'D', name: 'Supporting Company D', logoClass: 'logo-company-d' },
  ]
  return <section className={`commercial-sponsors wrap ${full ? 'commercial-sponsors-full' : 'commercial-sponsors-home'}`}>
    <div className="sponsor-tier-heading"><p className="eyebrow">Lead sponsors</p><h2>Principal partners of IOL 2027.</h2><p>Lead sponsors provide major support for the programme, venues and participant experience. Every confirmed partner at this level receives the same prominent placement.</p></div>
    <div className="lead-sponsor-list">{leadSponsors.map((sponsor) => <article className="lead-sponsor-card" key={sponsor.name}>
      <div className={`fictional-logo ${sponsor.logoClass}`}><span>{sponsor.letter}</span><strong>{sponsor.name.toUpperCase()}</strong></div>
      <div className="lead-sponsor-content"><span>LEAD SPONSOR</span><h3>{sponsor.name}</h3><p>{sponsor.name} helps IOL 2027 welcome international teams and deliver the spaces, services and shared experiences that make the Olympiad possible. Each lead sponsor receives a logo display area of 320 × 180 px, a 1600 × 500 px feature banner, and space for a description of up to 80 words.</p></div>
    </article>)}</div>
    <div className="supporting-sponsor-heading"><p className="eyebrow">Supporting sponsors</p><h2>Additional partners, recognised together.</h2><p>Supporting sponsors strengthen the services and activities that help teams enjoy a welcoming, well-organised Olympiad week.</p></div>
    <div className="supporting-sponsor-grid">{supportingSponsors.map((sponsor) => <article className="supporting-sponsor-card" key={sponsor.name}>
      <div className={`fictional-logo ${sponsor.logoClass}`}><span>{sponsor.letter}</span><strong>{sponsor.name.toUpperCase()}</strong></div>
      <div className="supporting-sponsor-content"><span>SUPPORTING SPONSOR</span><h3>{sponsor.name}</h3><p>{sponsor.name} supports the participant services and shared programme that bring the IOL community together in Bangkok. Each supporting sponsor receives a logo display area of 220 × 120 px, a 1200 × 300 px feature banner, and space for a description of up to 40 words.</p></div>
    </article>)}</div>
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
  return <><PageIntro eyebrow="About the Olympiad" title="Data holds the pattern, deduction holds the key." body="IOL is one of the International Science Olympiads: a yearly meeting of young problem-solvers who decode the structures hidden inside human language." /><section className="two-col wrap"><div><p className="eyebrow">What happens</p><h2>Reasoning through pattern, verified by rigor.</h2></div><div className="prose"><p>Problems may draw on any language in the world. Contestants discover patterns, test hypotheses and explain systems they have never seen before. No specialist language and linguistic theory is assumed.</p><p>Each accredited country or territory may send up to two teams. A contest team has no more than four contestants and one team leader. Contestants take part in both an individual round and a collaborative team round.</p><p>Careful observation, hypothesis testing and a clear explanation matter more than memorised vocabulary.</p></div></section><section className="number-grid wrap"><article><strong>5</strong><span>individual problems</span></article><article><strong>6h</strong><span>individual contest</span></article><article><strong>4</strong><span>students per team</span></article><article><strong>8</strong><span>days together</span></article></section><SectionLinks links={[{ href: '/about/thailand', label: 'Host: Thailand', detail: 'Meet Bangkok and the host programme.' }, { href: '/about/thai-language', label: 'Useful Thai', detail: 'Useful phrases for travelling in Thailand.' }, { href: '/about/important-dates', label: 'Important dates', detail: 'Registration periods and the event week.' }]} /></>
}

function Thailand() {
  const greetings = [
    { text: 'สวัสดี', lang: 'th', className: 'cloud-word-1' }, { text: 'Hello', lang: 'en', className: 'cloud-word-2' },
    { text: '你好', lang: 'zh', className: 'cloud-word-3' }, { text: 'こんにちは', lang: 'ja', className: 'cloud-word-4' },
    { text: '안녕하세요', lang: 'ko', className: 'cloud-word-5' }, { text: 'مرحبا', lang: 'ar', className: 'cloud-word-6' },
    { text: 'नमस्ते', lang: 'hi', className: 'cloud-word-7' }, { text: 'Bonjour', lang: 'fr', className: 'cloud-word-8' },
    { text: 'Hola', lang: 'es', className: 'cloud-word-9' }, { text: 'Ciao', lang: 'it', className: 'cloud-word-10' },
    { text: 'Hallo', lang: 'de', className: 'cloud-word-11 cloud-word-vertical' }, { text: 'Olá', lang: 'pt', className: 'cloud-word-12' },
    { text: 'Привет', lang: 'ru', className: 'cloud-word-13' }, { text: 'Γεια σου', lang: 'el', className: 'cloud-word-14' },
    { text: 'Merhaba', lang: 'tr', className: 'cloud-word-15 cloud-word-vertical' }, { text: 'Xin chào', lang: 'vi', className: 'cloud-word-16' },
    { text: 'שלום', lang: 'he', className: 'cloud-word-17' }, { text: 'Jambo', lang: 'sw', className: 'cloud-word-18 cloud-word-vertical' },
    { text: 'Sawubona', lang: 'zu', className: 'cloud-word-19' }, { text: 'Selamat', lang: 'id', className: 'cloud-word-20' },
  ]
  return <><PageIntro eyebrow="Host: Thailand" title="The journey begins in Bangkok." body="In 2027, the IOL comes to Thailand, a meeting point of scripts, sounds, histories, neighbourhoods and new ways of seeing." />
    <section className="thailand-introduction wrap"><div><p className="eyebrow">Welcome to Thailand</p><h2 className="mixed-heading">A place to look closer, <em>listen carefully</em> and connect.</h2></div><div className="prose"><p>Thailand welcomes IOL contestants into a setting where language is visible and audible everywhere: in the forms of Thai script, the tones of everyday speech and the many languages spoken across an international city.</p><p>Bangkok will be more than the backdrop to the contest. It will be the shared home of the Olympiad week, linking the hotel, university campuses, ceremonies, cultural activities and the people who make the event possible.</p></div></section>
    <section className="word-cloud-section"><div className="word-cloud-heading wrap"><p className="eyebrow">Twenty ways to say hello</p><h2 className="mixed-heading">A world of <em>hellos.</em></h2><p>Every greeting has its own sound and structure. At IOL 2027, they meet in one shared welcome.</p></div><div className="word-cloud wrap" aria-label="Greetings in twenty languages">{greetings.map((word) => <span key={word.text} lang={word.lang} className={`cloud-word ${word.className}`}>{word.text}</span>)}</div></section>
    <section className="three-notes wrap"><article><h3>Read the city</h3><p>Bangkok links the home base, university campuses, contest rooms, ceremonies and the city programme.</p></article><article><h3>Meet the host culture</h3><p>Excursions, cultural programming and everyday encounters give teams a way to experience Thailand together.</p></article><article><h3>Notice the forms</h3><p>Thai language and script offer a living system whose patterns reward close attention.</p></article></section>
    <section className="thailand-hosts"><div className="wrap"><div className="thailand-hosts-heading"><p className="eyebrow">Who we are</p><h2 className="mixed-heading">Three institutions, <em>one Thai welcome.</em></h2><p>Academic Olympiad experience and Bangkok's university community come together to host the 24th International Linguistics Olympiad.</p></div><div className="thailand-host-grid">{hosts.map((host) => <article key={host.name}><div><img src={host.image} alt={`${host.name} logo`} /></div><h3>{host.name}</h3><p>{host.description}</p></article>)}</div><LinkButton href="/hosts">Meet the hosts</LinkButton></div></section>
    <section className="experience-grid wrap"><article className="exp-one"><span>DAY 04 / EXCURSION</span><h2>Move beyond the contest room.</h2><p>A shared day to encounter Thailand through place, culture and conversation. The final route will be confirmed by the organising team.</p></article><article className="exp-two"><span>DAY 05 / CITY PROGRAMME</span><h2>Read Bangkok.</h2><p>Campus, neighbourhood, river and street life become part of the week-long setting.</p></article><article className="exp-three"><span>DAY 07 / CULTURAL NIGHT</span><h2>Celebrate the community.</h2><p>After solutions, awards and closing, teams gather for the host culture and friendships that outlast the score.</p></article></section></>
}

function ThaiLanguage() {
  const play = (src: string) => {
    const a = new Audio(src)
    a.play().catch(() => {})
  }

  return <>
    <PageIntro title="Useful Thai for your stay" body="A few words and phrases to help you get around, order food, say hello, and enjoy your time in Thailand." />
    <section className="thai-intro wrap">
      <div>
        <p className="eyebrow">A quick note</p>
        <h2 className="mixed-heading">Speak gently. <em>Listen closely.</em></h2>
      </div>
      <div className="prose">
        <p>Thai is a tonal language with five tones — the same syllable at a different pitch carries a different meaning. IPA notation is shown below each phrase using standard tone marks: low <strong>à</strong>, mid <strong>a</strong>, high <strong>á</strong>, rising <strong>ǎ</strong>, falling <strong>â</strong>.</p>
        <p>Men commonly end polite sentences with <strong>ครับ (kʰráp)</strong>; women commonly use <strong>ค่ะ (kʰâ)</strong>. Where both forms are shown, you can listen to each one separately.</p>
      </div>
    </section>
    <section className="phrase-grid wrap">
      {thaiPhrases.map((phrase) => (
        <article key={phrase.thai}>
          <h2 lang="th">{phrase.thai}</h2>
          <p className="phrase-reading">{phrase.reading}</p>
          <p className="phrase-ipa">{phrase.ipa.join(' · ')}</p>
          <p>{phrase.meaning}</p>
          <div className="phrase-audio">
            {phrase.audio.map((src, index) => (
              <button type="button" key={src} onClick={() => play(src)} aria-label={`Play Thai pronunciation${phrase.audio.length > 1 ? (index === 0 ? ' (male)' : ' (female)') : ''}`}>
                <Volume2 size={18} />
                {phrase.audio.length > 1 ? (index === 0 ? 'ครับ' : 'ค่ะ') : 'Listen'}
              </button>
            ))}
          </div>
        </article>
      ))}
    </section>
  </>
}

function Programme() {
  return <><PageIntro eyebrow="Schedule & venues" title="Eight days in Bangkok." body="The tentative programme runs from 21 to 28 July 2027 across Mandarin Hotel, Kasetsart University, Chulalongkorn University and other programme locations." /><figure className="schedule-artifact wrap"><img src="/assets/iol-2027-schedule.png" alt="Tentative hourly schedule for IOL 2027 from 21 to 28 July" /><figcaption><div><span>TENTATIVE SCHEDULE</span><p>Times and activities may change as the organising team confirms operations.</p></div><a className="pill" href="/downloads/IOL-2027-Schedule.html" target="_blank" rel="noreferrer">Open full schedule <span><ExternalLink size={15} /></span></a></figcaption></figure><section className="timeline wrap">{schedule.map((item) => <article key={item.date}><div><span>{item.day}</span><strong>{item.date}</strong></div><h2>{item.title}</h2><p>{item.detail}</p></article>)}</section><section className="venue-section"><div className="wrap"><p className="eyebrow">Venue plan</p><h2>Bangkok, connected.</h2><div className="venue-cards">{venues.map((venue) => <article key={venue.index}><p>{venue.role}</p><h3>{venue.name}</h3><small>{venue.detail}</small></article>)}</div></div></section></>
}

function Hosts() {
  return <><PageIntro eyebrow="Hosts" title="A shared welcome from Thailand." body="IOL 2027 is hosted by organisations that bring together academic Olympiad experience, education, research and Bangkok's university community." /><section className="sponsor-detail-list wrap">{hosts.map((host, index) => <article className={`sponsor-detail ${host.className}`} key={host.name}><div className="sponsor-detail-logo"><img src={host.image} alt={`${host.name} logo`} /></div><div><h2>{host.name}</h2><p>{host.description}</p><p className="sponsor-detail-note">{index === 0 ? 'POSN supports Thailand academic Olympiads and the development of young talent.' : index === 1 ? 'Chulalongkorn University hosts the contests, solution presentations, closing ceremony and cultural night.' : 'Kasetsart University welcomes teams for the opening ceremony.'}</p></div></article>)}</section></>
}

function Sponsors() {
  return <><PageIntro eyebrow="Sponsors" title="A clear place for every level of support." body="This page demonstrates how approved sponsors can be presented without confusing them with the official hosts." /><SponsorPreview full /><section className="sponsor-thanks"><p className="eyebrow">Sponsor IOL 2027</p><h2>Help young minds look closer.</h2><a className="text-link" href="mailto:iol2027.th@gmail.com?subject=IOL%202027%20sponsorship">Contact the organising team <ArrowRight size={16} /></a></section></>
}

function Registration() {
  return <><section className="coming-soon grain"><div className="coming-mark"><img src="/assets/iol-mark.png" alt="IOL 2027 Thailand mark" /></div><div><p className="system-label">REGISTRATION CHANNEL / PREPARING</p><h1>OPENS<br /><em>18 JAN 2027.</em></h1><p>Registration is not open yet. The planned flow uses one team leader per country, an invitation code, staged participant data, bank-transfer instructions, proof upload and later travel updates.</p><div className="hero-actions"><LinkButton href="/registration/team-leader" light>Create Team Leader Account</LinkButton><a href="/registration/how-to-register" className="text-link">See the registration flow <ArrowRight size={16} /></a></div></div><aside><span>FEE RELEASE</span><strong>18 JAN 2027</strong><span>EARLY BIRD</span><strong>18 JAN-12 MAR</strong><span>REGULAR</span><strong>13 MAR-30 APR</strong><span>STATUS</span><strong>PREPARING</strong></aside></section></>
}

function RegistrationHow() {
  const steps = [
    { title: 'Verify the official invitation.', detail: 'The invitation code identifies the country or territory automatically. Country is not entered manually.' },
    { title: 'Create and verify the Team Leader account.', detail: 'The verified name and email become the Team Leader record and are reused throughout registration.' },
    { title: 'Reserve places with four planning fields.', detail: 'Enter team count, contestant count, observer count and adult room preference. Personal details can wait.' },
    { title: 'Complete people and teams when ready.', detail: 'Add badge names, official details, exam language, shirt size and welfare needs. Each team chooses one team-contest language.' },
    { title: 'Confirm invoices before transferring.', detail: 'State how many invoices are needed and any split details before making the bank transfer.' },
    { title: 'Transfer outside the website and upload proof.', detail: 'The sender covers bank fees and currency conversion. The website accepts proof only; Finance reviews it manually.' },
    { title: 'Return later with travel details.', detail: 'Arrival and departure remain open after initial registration because itineraries can change.' },
    { title: 'Use individual QR badges during the event.', detail: 'Every person brings their badge for scanning at arrival and approved checkpoints.' },
  ]
  return <><PageIntro eyebrow="Registration / How to register" title="One clear path for every team." body="One team leader coordinates the entire process, from registration and payment confirmation to travel information and document delivery." /><section className="steps wrap">{steps.map((step, index) => <article key={step.title}><span>{String(index + 1).padStart(2, '0')}</span><div><h2>{step.title}</h2><p>{step.detail}</p></div></article>)}</section><section className="notice-panel wrap"><p className="eyebrow">Team Leader entry</p><h2>Start with the invitation code. You only need headcounts and room preference for the initial setup.</h2><a className="text-link" href="/registration/team-leader">Create Team Leader Account <ArrowRight size={16} /></a></section></>
}

function TeamLeaderAccount() {
  const [accountStep, setAccountStep] = useState(0)
  const [activeArea, setActiveArea] = useState(0)
  const [savedAreas, setSavedAreas] = useState<string[]>([])
  const [proofUploaded, setProofUploaded] = useState(true)
  const [activeRecordByArea, setActiveRecordByArea] = useState<Record<string, number>>({ Teams: 0, People: 0, Travel: 0 })

  const downloadInvoice = () => {
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>IOL 2027 Invoice — Thailand</title><style>
      body{margin:0;padding:40px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#160c1b;background:#fff;-webkit-print-color-adjust:exact}
      .header{background:#160c1b;color:#f3eed4;padding:28px 36px;border-radius:12px;margin-bottom:32px}
      .header p{margin:0;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#eda363;font-weight:700}
      .header h1{margin:8px 0 0;font-size:28px;font-weight:800;letter-spacing:-.03em}
      .meta{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:32px}
      .meta-block small{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#857888;margin-bottom:4px}
      .meta-block strong{font-size:14px}
      table{width:100%;border-collapse:collapse;margin-bottom:24px}
      th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#857888;padding:8px 12px;border-bottom:2px solid #e0d9cc}
      td{padding:12px;border-bottom:1px solid #e0d9cc;font-size:14px}
      .total-row td{font-weight:700;font-size:16px;border-bottom:none;padding-top:16px}
      .bank{background:#f8f5f0;border-radius:8px;padding:20px 24px;margin-bottom:24px}
      .bank h3{margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:.07em;color:#857888}
      .bank p{margin:4px 0;font-size:14px}
      .notice{border-left:3px solid #eda363;padding:12px 16px;background:rgba(237,163,99,.08);border-radius:0 6px 6px 0;font-size:13px;line-height:1.6;margin-bottom:24px}
      .footer{margin-top:40px;font-size:11px;color:#b0a8b4;line-height:1.7}
      @media print{body{padding:24px}}
    </style></head><body>
      <div class="header"><p>IOL 2027 · Bangkok, Thailand</p><h1>Registration Invoice</h1></div>
      <div class="meta">
        <div class="meta-block"><small>Bill to</small><strong>National Linguistics Olympiad Thailand</strong></div>
        <div class="meta-block"><small>Payment reference</small><strong>THA-IOL2027-001</strong></div>
        <div class="meta-block"><small>Invoice date</small><strong>${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</strong></div>
        <div class="meta-block"><small>Due</small><strong>On transfer — before member details unlock</strong></div>
      </div>
      <table>
        <thead><tr><th>Description</th><th>Unit</th><th style="text-align:right">Amount (USD)</th></tr></thead>
        <tbody>
          <tr><td>IOL 2027 Registration — Early bird</td><td>2 teams × USD 1,000</td><td style="text-align:right">2,000.00</td></tr>
          <tr><td>Room accommodation (2 rooms per team)</td><td>2 teams × 2 rooms × USD 220</td><td style="text-align:right">880.00</td></tr>
          <tr><td>Observer registration fee</td><td>TBD</td><td style="text-align:right">—</td></tr>
        </tbody>
        <tfoot><tr class="total-row"><td colspan="2">Total amount due</td><td style="text-align:right">USD 2,880.00 (+ observer fees TBD)</td></tr></tfoot>
      </table>
      <div class="bank">
        <h3>Bank transfer details</h3>
        <p><strong>Beneficiary:</strong> มูลนิธิส่งเสริมโอลิมปิกวิชาการและพัฒนามาตรฐานวิทยาศาสตร์ศึกษา ในพระอุปถัมภ์สมเด็จพระเจ้าพี่นางเธอ เจ้าฟ้ากัลยาณิวัฒนา กรมหลวงนราธิวาสราชนครินทร์ (สอวน.)</p>
        <p><strong>Bank:</strong> ธนาคารไทยพาณิชย์ (SCB) — account details supplied by Finance after approval</p>
        <p><strong>Reference:</strong> THA-IOL2027-001 (include in transfer description)</p>
      </div>
      <div class="notice"><strong>Important:</strong> Transfer the full amount shown above to สอวน (POSN). Select <strong>OUR</strong> when initiating the wire so all intermediary bank charges are borne by the sender — the LOC must receive the full declared amount. Currency conversion costs are the sender's responsibility.</div>
      <div class="footer">
        IOL 2027 Organising Committee · Bangkok, Thailand<br>
        iol2027.th@gmail.com · This invoice is generated from the registration system and is not a tax receipt. An official e-receipt will be issued after Finance confirms the transfer.
      </div>
    <script>window.onload=()=>{window.print()}<\/script></body></html>`)
    win.document.close()
  }
  const steps = [
    ['Invite code', 'IOL2027-THA-7F3K'],
    ['Account details', 'leader@national-olympiad.org'],
    ['Email verification', 'Code 2027'],
    ['Registration dashboard', 'Account ready'],
  ]

  const tshirtHelp = 'XS ≈ 80 cm · S ≈ 85 cm · M ≈ 90 cm · L ≈ 95 cm · XL ≈ 100 cm · 2XL ≈ 106 cm · 3XL ≈ 112 cm (chest circumference)'
  const memberRecordsData: RegistrationRecord[] = [
    { label: 'Narin Chaiwat', meta: 'Contestant - Team A', status: 'Complete', fields: [
      { label: 'Role', value: 'Contestant', help: 'Contestant, Team Leader, Deputy or Observer.' },
      { label: 'Team assignment', value: 'Thailand A', help: 'Connects this person to the team record.' },
      { label: 'Display name', value: 'Narin Chaiwat', help: 'Used on badges, slides and informal lists.' },
      { label: 'Badge name', value: 'Narin', help: 'Short name printed on the lanyard badge. First name or preferred name.' },
      { label: 'Official name', value: 'Narin Chaiwat', help: 'Used on certificates and official records.' },
      { label: 'Passport name', value: 'CHAIWAT NARIN', help: 'Used only where document matching is required.' },
      { label: 'Passport number', value: 'AA1234567', help: 'Sensitive data used for travel support and hotel verification.' },
      { label: 'Passport nationality', value: 'Thai', help: 'Used for accreditation records.' },
      { label: 'Date of birth', value: '2009-02-12', help: 'Contestant eligibility and minor status check.' },
      { label: 'Gender for room allocation', value: 'Male', help: 'Used only for rooming and safeguarding arrangements.' },
      { label: 'Exam language', value: 'English', help: 'Language this contestant will use for the individual examination.' },
      { label: 'T-shirt size', value: 'M', help: tshirtHelp },
      { label: 'Polo shirt size', value: 'M', help: tshirtHelp },
      { label: 'Food and allergy notes', value: 'No shellfish', help: 'Restricted data shared only with food operations.' },
      { label: 'Medical or accessibility notes', value: 'No special requirements', help: 'Restricted data for welfare and emergency planning.' },
      { label: 'Emergency contact', value: 'Somchai Chaiwat, +66 82 111 2233', help: 'Sensitive contact used only for safety purposes.' },
    ] },
    { label: 'Mali Phan', meta: 'Contestant - Team A', status: 'Missing DOB', fields: [
      { label: 'Role', value: 'Contestant', help: 'Contestant, Team Leader, Deputy or Observer.' },
      { label: 'Team assignment', value: 'Thailand A', help: 'Connects this person to the team record.' },
      { label: 'Display name', value: 'Mali Phan', help: 'Used on badges, slides and informal lists.' },
      { label: 'Badge name', value: 'Mali', help: 'Short name printed on the lanyard badge. First name or preferred name.' },
      { label: 'Official name', value: 'Mali Phan', help: 'Used on certificates and official records.' },
      { label: 'Passport name', value: 'PHAN MALI', help: 'Used only where document matching is required.' },
      { label: 'Passport number', value: 'AA7654321', help: 'Sensitive data used for travel support and hotel verification.' },
      { label: 'Passport nationality', value: 'Thai', help: 'Used for accreditation records.' },
      { label: 'Date of birth', value: '', help: 'Required for contestant eligibility and minor status.' },
      { label: 'Gender for room allocation', value: 'Female', help: 'Used only for rooming and safeguarding arrangements.' },
      { label: 'Exam language', value: 'English', help: 'Language this contestant will use for the individual examination.' },
      { label: 'T-shirt size', value: 'S', help: tshirtHelp },
      { label: 'Polo shirt size', value: 'S', help: tshirtHelp },
      { label: 'Food and allergy notes', value: 'Vegetarian', help: 'Restricted data shared only with food operations.' },
      { label: 'Medical or accessibility notes', value: 'No special requirements', help: 'Restricted data for welfare and emergency planning.' },
      { label: 'Emergency contact', value: 'Nok Phan, +66 82 222 3344', help: 'Sensitive contact used only for safety purposes.' },
    ] },
    { label: 'Kiet Rattanakul', meta: 'Contestant - Team A', status: 'Complete', fields: [
      { label: 'Role', value: 'Contestant', help: 'Contestant, Team Leader, Deputy or Observer.' },
      { label: 'Team assignment', value: 'Thailand A', help: 'Connects this person to the team record.' },
      { label: 'Display name', value: 'Kiet Rattanakul', help: 'Used on badges, slides and informal lists.' },
      { label: 'Badge name', value: 'Kiet', help: 'Short name printed on the lanyard badge. First name or preferred name.' },
      { label: 'Official name', value: 'Kiet Rattanakul', help: 'Used on certificates and official records.' },
      { label: 'Passport name', value: 'RATTANAKUL KIET', help: 'Used only where document matching is required.' },
      { label: 'Passport number', value: 'AA2468101', help: 'Sensitive data used for travel support and hotel verification.' },
      { label: 'Passport nationality', value: 'Thai', help: 'Used for accreditation records.' },
      { label: 'Date of birth', value: '2009-06-03', help: 'Contestant eligibility and minor status check.' },
      { label: 'Gender for room allocation', value: 'Male', help: 'Used only for rooming and safeguarding arrangements.' },
      { label: 'Exam language', value: 'English', help: 'Language this contestant will use for the individual examination.' },
      { label: 'T-shirt size', value: 'M', help: tshirtHelp },
      { label: 'Polo shirt size', value: 'M', help: tshirtHelp },
      { label: 'Food and allergy notes', value: 'No pork', help: 'Restricted data shared only with food operations.' },
      { label: 'Medical or accessibility notes', value: 'Carries inhaler', help: 'Restricted data for welfare and emergency planning.' },
      { label: 'Emergency contact', value: 'Arun Rattanakul, +66 82 333 4455', help: 'Sensitive contact used only for safety purposes.' },
    ] },
    { label: 'Arun Songsiri', meta: 'Contestant - Team A', status: 'Complete', fields: [
      { label: 'Role', value: 'Contestant', help: 'Contestant, Team Leader, Deputy or Observer.' },
      { label: 'Team assignment', value: 'Thailand A', help: 'Connects this person to the team record.' },
      { label: 'Display name', value: 'Arun Songsiri', help: 'Used on badges, slides and informal lists.' },
      { label: 'Badge name', value: 'Arun', help: 'Short name printed on the lanyard badge. First name or preferred name.' },
      { label: 'Official name', value: 'Arun Songsiri', help: 'Used on certificates and official records.' },
      { label: 'Passport name', value: 'SONGSIRI ARUN', help: 'Used only where document matching is required.' },
      { label: 'Passport number', value: 'AA3579246', help: 'Sensitive data used for travel support and hotel verification.' },
      { label: 'Passport nationality', value: 'Thai', help: 'Used for accreditation records.' },
      { label: 'Date of birth', value: '2008-11-18', help: 'Contestant eligibility and minor status check.' },
      { label: 'Gender for room allocation', value: 'Male', help: 'Used only for rooming and safeguarding arrangements.' },
      { label: 'Exam language', value: 'English', help: 'Language this contestant will use for the individual examination.' },
      { label: 'T-shirt size', value: 'L', help: tshirtHelp },
      { label: 'Polo shirt size', value: 'L', help: tshirtHelp },
      { label: 'Food and allergy notes', value: 'No restrictions', help: 'Restricted data shared only with food operations.' },
      { label: 'Medical or accessibility notes', value: 'No special requirements', help: 'Restricted data for welfare and emergency planning.' },
      { label: 'Emergency contact', value: 'Malee Songsiri, +66 82 444 5566', help: 'Sensitive contact used only for safety purposes.' },
    ] },
    { label: 'Prof. Preecha K.', meta: 'Observer', status: 'Payment linked', fields: [
      { label: 'Role', value: 'Observer', help: 'Observer fees are calculated separately.' },
      { label: 'Observer category', value: 'Regular observer', help: 'Used by Finance.' },
      { label: 'Display name', value: 'Prof. Preecha K.', help: 'Used on badge and programme lists.' },
      { label: 'Badge name', value: 'Prof. Preecha', help: 'Short name printed on the lanyard badge.' },
      { label: 'Official name', value: 'Preecha Kittisak', help: 'Used on official records.' },
      { label: 'Passport name', value: 'KITTISAK PREECHA', help: 'Used only where document matching is required.' },
      { label: 'Passport number', value: 'AB7659001', help: 'Sensitive data used for travel support and hotel verification.' },
      { label: 'Passport nationality', value: 'Thai', help: 'Used for accreditation records.' },
      { label: 'Email', value: 'preecha@national-olympiad.org', help: 'Receives personal invitation letter and badge notices.' },
      { label: 'Gender for room allocation', value: 'Male', help: 'Used only for rooming arrangements.' },
      { label: 'Room type preference', value: 'Single if available', help: 'May require supplement or approval.' },
      { label: 'T-shirt size', value: 'L', help: tshirtHelp },
      { label: 'Polo shirt size', value: 'L', help: tshirtHelp },
      { label: 'Food and allergy notes', value: 'No pork', help: 'Restricted data shared only with food operations.' },
      { label: 'Medical or accessibility notes', value: 'No special requirements', help: 'Restricted data for welfare and emergency planning.' },
      { label: 'Emergency contact', value: 'Maneerat K., +66 81 888 7766', help: 'Sensitive contact used only for safety purposes.' },
    ] },
  ]

  const getField = (r: RegistrationRecord, label: string) => r.fields.find(f => f.label === label)?.value ?? ''
  const welfare = (() => {
    const mf = memberRecordsData
    const maleCont = mf.filter(r => getField(r, 'Gender for room allocation') === 'Male' && getField(r, 'Role') === 'Contestant').length
    const femaleCont = mf.filter(r => getField(r, 'Gender for room allocation') === 'Female' && getField(r, 'Role') === 'Contestant').length
    const singleNames = mf.filter(r => getField(r, 'Room type preference') === 'Single if available').map(r => getField(r, 'Role'))
    const restrictions: Record<string, number> = {}
    mf.forEach(r => {
      const note = getField(r, 'Food and allergy notes')
      if (!note || /no restrictions/i.test(note)) return
      restrictions[note] = (restrictions[note] || 0) + 1
    })
    const dietarySummary = Object.entries(restrictions).map(([k, v]) => `${k.toLowerCase()}: ${v}`).join('; ') || 'No restrictions reported'
    const medIssues = mf.map(r => getField(r, 'Medical or accessibility notes')).filter(n => n && !/no special requirements/i.test(n))
    const medSummary = medIssues.length === 0 ? 'No special requirements' : `${medIssues.length} note${medIssues.length > 1 ? 's' : ''}: ${medIssues.map(n => n.toLowerCase()).join('; ')}`
    return {
      roomingSummary: `${maleCont} male contestant${maleCont !== 1 ? 's' : ''}, ${femaleCont} female contestant${femaleCont !== 1 ? 's' : ''}, ${singleNames.length} adult single${singleNames.length !== 1 ? 's' : ''} requested`,
      singleRoomReqs: singleNames.join(', ') || 'None',
      dietarySummary,
      medSummary,
    }
  })()

  const areasSource: RegistrationArea[] = [
    { title: 'Before you begin', status: 'Guide', required: false, body: 'See what is needed now, what can wait, and what happens after submission.', fields: [], notes: [
      { label: '① Reserve your place', value: 'Team count and observer count only', help: 'Two fields unlock the fee calculation. Contestant names are not needed yet.' },
      { label: '② Pay and upload proof', value: 'Review calculated fees, fill invoice details, transfer, then upload proof', help: 'Member details are locked until payment proof is submitted. Declare invoice splits before transferring.' },
      { label: '③ Complete people and teams', value: 'Names, badges, passports, exam languages, shirts and welfare', help: 'Unlocked after payment proof is uploaded. Can be completed in stages.' },
      { label: '④ Travel — fill later', value: 'Add arrival and departure details after flights are booked', help: 'Travel remains editable after the initial submission.' },
      { label: 'Event week', value: 'Bring every QR badge for staff scanning', help: 'The QR contains a random reference, never visible personal information.' },
    ] },
    { title: 'Team Leader setup', status: 'Editable', body: 'Enter team count and observer count. Rooms are pre-assigned by the organiser — Team Leaders and Observers receive single rooms; contestants share same-gender rooms automatically.', fields: [
      { label: 'Number of teams', value: '2', help: 'Maximum two teams for an accredited country or territory.' },
      { label: 'Number of observers', value: '0', help: 'Enter the expected number. Observer fees are calculated separately.' },
    ], notes: [
      { label: 'Team Leader', value: 'Dr. Ananya Somchai · leader@national-olympiad.org', help: 'Taken from the verified account and reused automatically.' },
      { label: 'Country or territory', value: 'Thailand · locked by invitation code', help: 'The invitation determines the official country; it cannot be edited here.' },
      { label: 'Room allocation', value: 'Pre-assigned — no action needed', help: 'Team Leaders and Observers get single rooms. Contestants are placed in same-gender shared rooms. No preference entry is required.' },
      { label: 'Next', value: 'Save, then review the calculated fees and fill in invoice details', help: 'Payment instructions and invoice details must be completed before member information is unlocked.' },
    ] },
    { title: 'Teams', status: 'Needs review', body: 'Create each team once, assign contestants from the member list, then choose the team contest working language.', fields: [], records: [
      { label: 'Thailand A', meta: '4 contestants', status: 'Ready', fields: [
        { label: 'Team name', value: 'Thailand A', help: 'Shown in internal team lists and team contest planning.' },
        { label: 'Team code', value: 'THA-A', help: 'Short code for staff exports, badges and score systems.' },
        { label: 'Team contest language', value: 'English', help: 'One working language per team; changes close before the contest.' },
        { label: 'Team status', value: 'Complete', help: 'Shows whether all assigned contestants have required data.' },
      ], notes: [
        { label: 'Team Leader', value: 'Dr. Ananya Somchai · from account', help: 'Reused automatically; no duplicate entry.' },
        { label: 'Contestants assigned', value: 'Narin, Mali, Kiet, Arun', help: 'Selected from saved member records.' },
      ] },
      { label: 'Thailand B', meta: '4 contestants', status: 'Needs language', fields: [
        { label: 'Team name', value: 'Thailand B', help: 'Second team record for the country.' },
        { label: 'Team code', value: 'THA-B', help: 'Short code for staff exports, badges and score systems.' },
        { label: 'Team contest language', value: '', help: 'Required before final submission.' },
        { label: 'Team status', value: 'Missing working language', help: 'Dashboard should surface the next missing action.' },
      ], notes: [
        { label: 'Team Leader', value: 'Dr. Ananya Somchai · from account', help: 'Reused automatically; no duplicate entry.' },
        { label: 'Contestants assigned', value: 'Pim, Tawan, Mira, Chanon', help: 'Selected from saved member records.' },
      ] },
    ] },
    { title: 'People', status: 'Locked', body: 'Member details are unlocked after payment proof is uploaded. Add names, badges, passports, exam languages, shirt sizes and welfare notes for each person.', fields: [], records: memberRecordsData },
    { title: 'Travel', status: 'Fill later', body: 'Travel is not required for the first registration submission. The Team Leader returns here after flights are booked, then updates arrival and departure details as they change.', fields: [], required: false, notes: [
      { label: 'When to complete', value: 'After flights are booked', help: 'Keep this section open later because arrival and departure details change often.' },
      { label: 'Registration requirement', value: 'Not required now', help: 'Team, participant, welfare and payment proof can be submitted first.' },
    ], records: [
      { label: 'Arrival details', meta: 'Fill after booking', status: 'Later', fields: [
        { label: 'Direction', value: 'Arrival', help: 'Arrival or departure trip.' },
        { label: 'Arrival point', value: '', help: 'Airport, train station, bus station or other arrival point.' },
        { label: 'Flight / service number', value: '', help: 'Used by the transport team after travel is known.' },
        { label: 'Local date', value: '', help: 'Bangkok local date.' },
        { label: 'Local time', value: '', help: 'Bangkok local time.' },
        { label: 'People on this trip', value: '', help: 'Assign participants from the team list when travel is confirmed.' },
        { label: 'Airport terminal', value: '', help: 'Optional field for transport staff.' },
        { label: 'Meeting point note', value: 'Assigned after travel submission', help: 'Filled by LOC when pickup details are issued.' },
        { label: 'Volunteer contact', value: 'To be assigned', help: 'Shown to the Team Leader during arrival week.' },
        { label: 'Pickup group', value: 'To be assigned', help: 'Assigned by LOC transport.' },
        { label: 'Change status', value: 'Open', help: 'Leader can update changed flight times before travel.' },
      ] },
      { label: 'Departure details', meta: 'Fill after booking', status: 'Later', fields: [
        { label: 'Direction', value: 'Departure', help: 'Arrival or departure trip.' },
        { label: 'Departure point', value: '', help: 'Airport, train station, bus station or other departure point.' },
        { label: 'Flight / service number', value: '', help: 'Used for departure bus planning after travel is known.' },
        { label: 'Local date', value: '', help: 'Bangkok local date.' },
        { label: 'Local time', value: '', help: 'Bangkok local time.' },
        { label: 'People on this trip', value: '', help: 'Assign participants from the team list when travel is confirmed.' },
        { label: 'Hotel pickup time', value: 'Assigned after travel submission', help: 'Filled by LOC after departure planning.' },
        { label: 'Bus or van group', value: 'To be assigned', help: 'Used by departure-day staff.' },
        { label: 'Boarding check', value: 'Not checked in', help: 'Used by arrival-week operations.' },
        { label: 'Change status', value: 'Open', help: 'Leader can update changed flight times before travel.' },
      ] },
    ] },
    { title: 'Rooms and welfare', status: 'Sensitive', body: 'Summarise rooming, food, medical, accessibility and guardian-consent needs without making the leader retype details already stored on each member.', fields: [
      { label: 'Rooming summary', value: welfare.roomingSummary, help: 'Generated from member gender and room preference fields.' },
      { label: 'Room-sharing notes', value: 'Same team preferred', help: 'Handled by the accommodation team.' },
      { label: 'Single-room requests', value: welfare.singleRoomReqs, help: 'May require supplement or approval.' },
      { label: 'Dietary summary', value: welfare.dietarySummary, help: 'Generated from member food and allergy notes.' },
      { label: 'Medical or accessibility summary', value: welfare.medSummary, help: 'Restricted data for welfare and emergency planning.' },
      { label: 'Guardian consent policy', value: 'Awaiting organiser decision', help: 'No consent upload is required until the organiser confirms the final policy.' },
      { label: 'Sensitive-data access', value: 'Welfare, food and check-in staff only', help: 'Matches the PDPA requirement for role-limited access.' },
      { label: 'Retention note', value: 'Delete after event retention period', help: 'Final deletion schedule needs approval.' },
    ] },
    { title: 'Payment & invoice', status: 'Awaiting proof', body: 'Review the calculated fees, fill in invoice details before transferring, then upload the transfer proof. Member details are locked until proof is submitted.', notes: [
      { label: 'Payment method', value: 'Bank transfer only — outside this website', help: 'No card or online payment gateway. Transfer to the approved account, then upload proof here.' },
      { label: 'How to pay', value: 'Bank transfer to สอวน (POSN) — full amount required', help: 'Transfer the total declared amount in full to สอวน (POSN) via SCB. The LOC must receive the full invoice amount — partial payments are not accepted.' },
      { label: 'Transfer fees', value: 'Choose OUR — sender pays all bank charges', help: 'Select OUR when initiating the wire so all intermediary bank charges are borne by the sender. The LOC is not responsible for fees deducted by intermediary banks.' },
      { label: 'Currency conversion', value: 'Sender\'s responsibility', help: 'All currency conversion costs and exchange-rate differences are the sender\'s responsibility. The LOC does not cover foreign-exchange losses.' },
      { label: 'Invoice deadline', value: 'Declare split details before transferring', help: 'Invoices cannot be split after payment is received. State the number and amounts here first.' },
    ], fields: [
      { label: 'Fee tier', value: 'Early bird', help: 'Calculated from the submission date.' },
      { label: 'Currency', value: 'USD', help: 'Registration fees are charged in USD.' },
      { label: 'Teams registered', value: '2', help: 'From Team Leader setup. Each team: up to 4 contestants + 1 shared Team Leader.' },
      { label: 'Calculated team fees', value: '2 teams × USD 1,000 = USD 2,000', help: 'Per team registration fee × number of teams.' },
      { label: 'Room accommodation', value: '2 teams × 2 rooms × USD 220 = USD 880', help: 'Each team is allocated 2 rooms (1 single for Team Leader + 1 shared for contestants). Room allocation is pre-assigned — no preference required.' },
      { label: 'Observer fees', value: 'TBD — awaiting organiser rate', help: 'Observer fees are approved separately and will be added when confirmed.' },
      { label: 'Total amount due', value: 'USD 2,880 (+ observer fees TBD)', help: 'Transfer this full amount to สอวน (POSN). Do not deduct any bank charges — select OUR.' },
      { label: 'Payment reference', value: 'THA-IOL2027-001', help: 'Include this reference in the bank transfer description.' },
      { label: 'Bank account status', value: 'SCB POSN account — details pending Finance approval', help: 'Account name, number and SWIFT will be shown here once approved by Finance.' },
      { label: 'Number of invoices requested', value: '1', help: 'How many invoices do you need? Declare split details before transferring.' },
      { label: 'Invoice details', value: '', help: 'For one invoice: leave blank. For multiple: state each recipient organisation and the amount (e.g. "National Olympiad Foundation — 1,200 USD; University Fund — 800 USD").' },
      { label: 'Invoice recipient name', value: 'National Linguistics Olympiad Thailand', help: 'Official organisation name to appear on the invoice.' },
      { label: 'Invoice recipient address', value: '', help: 'Full postal address for the invoice, if required by your institution.' },
      { label: 'Proof of payment file', value: 'transfer-iol2027.pdf', help: 'Accepted formats: PDF, JPG or PNG. Uploading this unlocks the People section.' },
      { label: 'Finance review status', value: 'Awaiting review', help: 'Updated after Finance reconciles the proof with the bank statement.' },
      { label: 'Receipt / e-receipt status', value: 'Not issued yet', help: 'E-receipt PDF is emailed and available for download after Finance approval.' },
    ] },
    { title: 'Badges & check-in', status: 'Preparing', body: 'Each registered person receives an individual QR badge. Staff scan it at arrival and controlled checkpoints throughout the event.', fields: [], required: false, notes: [
      { label: 'QR contents', value: 'Random badge reference only', help: 'Names, passport details and other personal data are never encoded in the QR.' },
      { label: 'Issue point', value: 'After names are finalised', help: 'Every contestant, Team Leader and observer receives their own badge.' },
      { label: 'Scanning', value: 'Arrival desk and approved event checkpoints', help: 'Each scan records the checkpoint, time and result for staff operations.' },
      { label: 'Current status', value: '5 of 6 badge names ready', help: 'Complete the remaining person record before issuing all badges.' },
    ] },
    { title: 'Review & submit', status: 'Not submitted', body: 'Review the complete registration, submit it, then track documents, badges and payment review.', fields: [
      { label: 'Registration status', value: 'Draft', help: 'Submit when all required sections are complete.' },
      { label: 'Missing required fields', value: 'Team B working language, Mali date of birth, payment proof', help: 'Travel is not counted as a first-submission requirement.' },
      { label: 'Submission lock', value: 'Unlocked', help: 'Final lock date and change-request channel need advisor approval.' },
      { label: 'Invitation letter status', value: 'Available after payment confirmation', help: 'Supports visa applications for registered people.' },
      { label: 'E-receipt status', value: 'Available after Finance approval', help: 'Receipt PDF is emailed and downloadable.' },
      { label: 'Badge and QR status', value: 'Pending final badge names', help: 'QR codes are issued after participant names are finalised.' },
      { label: 'Travel details status', value: 'Fill later', help: 'Arrival and departure details remain open after first registration submission.' },
      { label: 'Arrival check-in status', value: 'Not arrived', help: 'Updated by the venue check-in system during event week.' },
      { label: 'LOC message', value: 'No open messages', help: 'Questions from the organising team appear here.' },
    ] },
  ]
  const areaOrder = ['Before you begin', 'Team Leader setup', 'Payment & invoice', 'People', 'Teams', 'Rooms and welfare', 'Review & submit', 'Badges & check-in', 'Travel']
  const areas = [...areasSource].sort((a, b) => areaOrder.indexOf(a.title) - areaOrder.indexOf(b.title))
  const area = areas[activeArea]
  const activeRecord = activeRecordByArea[area.title] || 0
  const selectedRecord = area.records?.[activeRecord]
  const visibleFields = selectedRecord?.fields || area.fields
  const readonlyNotes = selectedRecord?.notes || (!selectedRecord ? area.notes : undefined)
  const isPeopleLocked = area.title === 'People' && !proofUploaded
  const requiredAreas = areas.filter((item) => item.required !== false)
  const savedRequiredAreas = savedAreas.filter((title) => requiredAreas.some((item) => item.title === title))
  const progress = Math.round((savedRequiredAreas.length / requiredAreas.length) * 100)
  const confirmationIndex = areas.findIndex((item) => item.title === 'Review & submit')
  const saveArea = () => setSavedAreas((current) => current.includes(area.title) ? current : [...current, area.title])
  const nextArea = () => setActiveArea((current) => current === confirmationIndex ? current : Math.min(current + 1, areas.length - 1))
  const optionalHint = (item: RegistrationArea) => item.title === 'Before you begin' ? 'Start here' : item.title === 'Badges & check-in' ? 'Event week' : 'Fill later'
  const navHint = (item: RegistrationArea) => {
    if (item.title === 'People' && !proofUploaded) return 'Proof required'
    if (item.required === false) return optionalHint(item)
    if (item.records) return `${item.records.length} ${item.title === 'People' ? 'people' : 'records'}`
    return savedAreas.includes(item.title) ? 'Saved' : areas[activeArea]?.title === item.title ? 'Editing' : item.status
  }
  const areaSaveState = area.required === false ? optionalHint(area) : area.records ? `${area.records.length} records` : savedAreas.includes(area.title) ? 'Saved' : 'Not saved'
  const nextButtonLabel = area.title === 'Travel' ? 'Save travel update' : activeArea === confirmationIndex ? 'Review registration' : 'Next section'
  const chooseRecord = (index: number) => setActiveRecordByArea((current) => ({ ...current, [area.title]: index }))
  const getStatusClass = (item: RegistrationArea) => {
    if (item.title === 'Before you begin') return 'guide'
    if (item.title === 'Badges & check-in') return 'qr'
    if (item.title === 'People' && !proofUploaded) return 'warn'
    if (item.required === false) return 'later'
    if (savedAreas.includes(item.title)) return 'done'
    if (item.status === 'Awaiting proof' || item.status === 'Awaiting review') return 'pending'
    if (item.status === 'Needs review') return 'warn'
    if (item.status === 'In progress') return 'progress'
    if (item.status === 'Sensitive') return 'sensitive'
    return 'draft'
  }
  const getRecordStatusClass = (status: string) => {
    if (['Complete', 'Payment linked', 'Ready'].includes(status)) return 'done'
    if (['Needs language', 'Missing DOB'].includes(status)) return 'warn'
    if (status === 'Later') return 'later'
    return 'draft'
  }
  const renderRegistrationField = (field: RegistrationField) => {
    const kind = inferRegistrationFieldKind(field, area.title)
    const options = field.options || registrationSelectOptions[field.label] || []
    if (kind === 'readonly') return <div className="reg-field reg-field-readonly" key={field.label}><span className="reg-field-label">{field.label}</span><strong className="reg-field-value">{field.value || '—'}</strong><small className="reg-field-help">{field.help}</small></div>
    if (kind === 'upload') {
      const isProofField = field.label === 'Proof of payment file'
      return <label className="reg-field reg-field-wide reg-field-upload" key={field.label}><span className="reg-field-label">{field.label}</span><div className={`reg-upload-zone${isProofField && proofUploaded ? ' reg-upload-done' : ''}`}><Upload size={22} /><span>{field.value || 'Click to upload or drag file here'}</span><small>PDF, JPG or PNG · max 10 MB</small><input type="file" accept={field.accept || '.pdf,.jpg,.jpeg,.png'} onChange={isProofField ? () => setProofUploaded(true) : undefined} /></div>{isProofField && <small className="reg-field-help reg-proof-hint"><CheckCircle size={12} /> Uploading this file unlocks the People section for editing.</small>}{!isProofField && <small className="reg-field-help">{field.help}</small>}</label>
    }
    if (kind === 'select') return <label className="reg-field" key={field.label}><span className="reg-field-label">{field.label}</span><select className="reg-input" defaultValue={field.value}><option value="">Select…</option>{options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}</select><small className="reg-field-help">{field.help}</small></label>
    if (kind === 'multiselect') return <label className="reg-field" key={field.label}><span className="reg-field-label">{field.label}</span><select className="reg-input" multiple defaultValue={field.value.split(',').map((i) => i.trim()).filter(Boolean)}>{options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}</select><small className="reg-field-help">{field.help}</small></label>
    if (kind === 'textarea') return <label className="reg-field reg-field-wide" key={field.label}><span className="reg-field-label">{field.label}</span><textarea className="reg-input" defaultValue={field.value} placeholder={field.label} /><small className="reg-field-help">{field.help}</small></label>
    const min = kind === 'number' ? 0 : undefined
    return <label className="reg-field" key={field.label}><span className="reg-field-label">{field.label}</span><input className="reg-input" type={kind} min={min} defaultValue={field.value} placeholder={field.label} /><small className="reg-field-help">{field.help}</small></label>
  }
  return <>
    <PageIntro eyebrow="Registration / Team Leader" title="Set up your team." body="Verify the official invitation, create the Team Leader account, and reserve places before completing personal details later." />
    <section className="poc-notice wrap" role="note"><strong>Interactive prototype</strong><p>This preview demonstrates the planned registration journey. Information entered here is not submitted, emailed, uploaded or saved.</p></section>
    <section className="reg-portal wrap">
      <div className="reg-stepbar">
        {steps.map(([title, detail], index) => <button type="button" key={title} className={`reg-step${index === accountStep ? ' active' : ''}${index < accountStep ? ' done' : ''}`} onClick={() => setAccountStep(index)}><div className="reg-step-num">{index < accountStep ? <CheckCircle size={18} /> : index + 1}</div><div className="reg-step-text"><strong>{title}</strong><small>{detail}</small></div></button>)}
      </div>
      <div className="reg-stage">
        {accountStep === 0 && <div className="reg-entry"><div className="reg-entry-context"><h2>Verify your invitation</h2><p>Each official country or territory receives one code. It identifies your country and registration allowance automatically.</p><span className="reg-entry-step-num">01</span></div><div className="reg-entry-form"><label className="reg-label">Invitation code<input className="reg-input" defaultValue="IOL2027-THA-7F3K" placeholder="IOL2027-XXX-XXXX" /></label><div className="reg-trust-line"><ShieldCheck size={17} /><span>Your code connects the account to the correct country.</span></div><button type="button" className="reg-btn-primary" onClick={() => setAccountStep(1)}>Verify invitation <ArrowRight size={16} /></button></div></div>}
        {accountStep === 1 && <div className="reg-entry"><div className="reg-entry-context"><h2>Create the Team Leader account</h2><p>These details become the official Team Leader record and are reused across teams, badges and communication.</p><span className="reg-entry-step-num">02</span></div><div className="reg-entry-form reg-entry-form-grid"><div className="reg-verified-country"><div><CheckCircle size={19} /><span>Invitation verified</span></div><strong>Thailand</strong><small>National Linguistics Olympiad</small><p><Lock size={14} /> Country is fixed by the invitation code</p></div><label className="reg-label">Team Leader email<input className="reg-input" type="email" defaultValue="leader@national-olympiad.org" /><small className="reg-entry-help">Used for login, verification and official notices.</small></label><label className="reg-label">Team Leader full name<input className="reg-input" defaultValue="Dr. Ananya Somchai" /><small className="reg-entry-help">Reused automatically; you will not type it again.</small></label><label className="reg-label">Password<input className="reg-input" type="password" defaultValue="IOL2027secure" /><small className="reg-entry-help">Use at least 12 characters.</small></label><div className="reg-entry-form-actions"><button type="button" className="reg-btn-primary" onClick={() => setAccountStep(2)}>Create account and email code <ArrowRight size={16} /></button></div></div></div>}
        {accountStep === 2 && <div className="reg-entry"><div className="reg-entry-context"><h2>Check your email</h2><p>Enter the six-digit code sent to the Team Leader email. It expires after 30 minutes.</p><span className="reg-entry-step-num">03</span></div><div className="reg-entry-form"><div className="reg-mail-state"><MailCheck size={24} /><div><strong>Code sent</strong><span>leader@national-olympiad.org</span></div></div><label className="reg-label">Six-digit verification code<input className="reg-input reg-code-input" inputMode="numeric" defaultValue="202027" maxLength={6} placeholder="000000" /></label><button type="button" className="reg-btn-primary" onClick={() => setAccountStep(3)}>Verify and continue <ArrowRight size={16} /></button><button type="button" className="reg-btn-text">Resend code</button></div></div>}
        {accountStep === 3 && <div className="reg-dashboard">
          <div className="reg-dash-head">
            <div><p className="reg-dash-eyebrow">Team Leader workspace</p><h2>Thailand</h2><span className="reg-dash-owner">Dr. Ananya Somchai · verified</span></div>
            <div className="reg-progress-block"><span className="reg-progress-pct">{progress}%</span><div className="reg-progress-bar"><span style={{ width: `${progress}%` }} /></div><small>{savedRequiredAreas.length} of {requiredAreas.length} sections saved</small></div>
          </div>
          <div className="reg-summary-strip">
            <article><Users size={18} /><div><strong>2 teams</strong><span>Up to 8 contestants · 0 observers</span></div></article>
            <article><ClipboardCheck size={18} /><div><strong>{proofUploaded ? 'Proof uploaded' : 'Payment pending'}</strong><span>{proofUploaded ? 'People section unlocked' : 'Upload proof to unlock members'}</span></div></article>
            <article><QrCode size={18} /><div><strong>QR badges</strong><span>Issued after final names</span></div></article>
          </div>
          <div className="reg-dash-body">
            <nav className="reg-sections-nav" aria-label="Registration sections">
              {areas.map((item, index) => {
                const isLocked = item.title === 'People' && !proofUploaded
                return <button type="button" key={item.title} className={`reg-sec-btn${index === activeArea ? ' active' : ''}${savedAreas.includes(item.title) ? ' done' : ''}${isLocked ? ' reg-sec-locked' : ''}`} onClick={() => !isLocked && setActiveArea(index)} aria-disabled={isLocked}><span className="reg-sec-num">{String(index + 1).padStart(2, '0')}</span><div className="reg-sec-info"><strong>{item.title}</strong><span className={`reg-badge reg-badge-${savedAreas.includes(item.title) && !isLocked ? 'done' : getStatusClass(item)}`}>{navHint(item)}</span></div>{isLocked && <Lock size={13} style={{ flexShrink: 0, color: '#c0b8c4' }} />}</button>
              })}
            </nav>
            <div className="reg-panel">
              {isPeopleLocked ? (
                <div className="reg-panel-locked">
                  <div className="reg-lock-icon"><Lock size={32} /></div>
                  <h3>People — locked</h3>
                  <p>Member details are unlocked after you upload proof of payment in the <strong>Payment &amp; invoice</strong> section. This prevents incomplete registrations from being submitted before fees are confirmed.</p>
                  <button type="button" className="reg-btn-next" onClick={() => setActiveArea(areas.findIndex((a) => a.title === 'Payment & invoice'))}>Go to Payment &amp; invoice <ArrowRight size={14} /></button>
                </div>
              ) : <>
              <div className="reg-panel-head">
                <div className="reg-panel-badges"><span className={`reg-badge reg-badge-${getStatusClass(area)}`}>{selectedRecord?.status || area.status}</span><span className="reg-badge reg-badge-save">{areaSaveState}</span></div>
                <h3>{selectedRecord?.label || area.title}</h3>
                <p>{area.body}</p>
              </div>
              {readonlyNotes && <div className="reg-info-notes">{readonlyNotes.map((note) => <article key={note.label}><span>{note.label}</span><strong>{note.value}</strong><small>{note.help}</small></article>)}</div>}
              {area.title === 'Badges & check-in' && <a className="reg-scanner-link" href="/registration/check-in"><QrCode size={20} /><div><strong>Open staff badge scanner</strong><span>Camera scan with manual-code fallback</span></div><ArrowRight size={17} /></a>}
              {area.records && <div className="reg-record-list"><div className="reg-record-list-head"><strong>{area.title} list</strong><button type="button" className="reg-btn-add">+ Add record</button></div>{area.records.map((record, index) => <button type="button" key={record.label} className={`reg-record-item${index === activeRecord ? ' active' : ''}`} onClick={() => chooseRecord(index)}><div><strong>{record.label}</strong><span>{record.meta}</span></div><span className={`reg-badge reg-badge-${getRecordStatusClass(record.status)}`}>{record.status}</span></button>)}</div>}
              <div className="reg-fields" key={`${area.title}-${activeRecord}`}>{visibleFields.map((field) => renderRegistrationField(field))}</div>
              <div className="reg-actions">
                <button type="button" className="reg-btn-save" onClick={saveArea}>Save section</button>
                {area.title === 'Payment & invoice' && <button type="button" className="reg-btn-invoice" onClick={downloadInvoice}><FileText size={14} /> Download invoice</button>}
                <button type="button" className="reg-btn-next" onClick={nextArea}>{nextButtonLabel} <ArrowRight size={14} /></button>
                <button type="button" className="reg-btn-reset" onClick={() => { setAccountStep(0); setActiveArea(0); setSavedAreas([]); setProofUploaded(false); setActiveRecordByArea({ Teams: 0, People: 0, Travel: 0 }) }}>Start over</button>
              </div>
              </>}
            </div>
          </div>
        </div>}
      </div>
    </section>
  </>
}

function BadgeCheckIn() {
  const [checkpoint, setCheckpoint] = useState('Arrival desk')
  const [manualCode, setManualCode] = useState(badgeScannerMode === 'demo' ? demoBadgeCode : '')
  const [cameraState, setCameraState] = useState<'starting' | 'ready' | 'unavailable'>('starting')
  const [scanState, setScanState] = useState<{ tone: 'idle' | 'working' | 'accepted' | 'rejected'; title: string; detail: string }>({ tone: 'idle', title: 'Ready to scan', detail: 'Hold one badge inside the camera frame.' })
  const scanLock = useRef(false)

  const submitScan = async (payload: string) => {
    if (!payload.trim() || scanLock.current) return
    scanLock.current = true
    setScanState({ tone: 'working', title: badgeScannerMode === 'demo' ? 'Running simulation' : 'Checking badge', detail: checkpoint })
    try {
      if (badgeScannerMode === 'demo') {
        await new Promise((resolve) => window.setTimeout(resolve, 450))
        if (payload.trim() !== demoBadgeCode) throw new Error(`For this prototype, use the sample badge code ${demoBadgeCode}.`)
        setScanState({ tone: 'accepted', title: 'Narin Chaiwat', detail: `Contestant · ${checkpoint} simulated · Nothing was saved` })
        setManualCode(demoBadgeCode)
      } else {
        const response = await fetch('/api/registration/check-in/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload: payload.trim(), checkpoint }),
        })
        const result = await response.json()
        if (!response.ok || !result.accepted) throw new Error(result.error || 'Badge is not active.')
        setScanState({ tone: 'accepted', title: result.member.badgeName || result.member.displayName, detail: `${result.member.role.replaceAll('_', ' ')} · ${checkpoint} recorded` })
        setManualCode('')
      }
    } catch (error) {
      setScanState({ tone: 'rejected', title: 'Badge not accepted', detail: error instanceof Error ? error.message : 'Please ask registration staff for help.' })
    } finally {
      window.setTimeout(() => { scanLock.current = false }, 1800)
    }
  }

  useEffect(() => {
    let scanner: { stop: () => Promise<void> } | null = null
    let active = true
    void import('html5-qrcode').then(({ Html5Qrcode }) => {
      if (!active) return
      const reader = new Html5Qrcode('iol-badge-reader')
      scanner = reader
      return reader.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 230, height: 230 } },
        (decodedText) => { if (active) void submitScan(decodedText) },
        () => undefined,
      ).then(() => { if (active) setCameraState('ready') })
    }).catch(() => { if (active) setCameraState('unavailable') })
    return () => {
      active = false
      scanner?.stop().catch(() => undefined)
    }
  }, [checkpoint])

  return <>
    <PageIntro eyebrow="Event operations / Check-in" title="Scan every badge." body={badgeScannerMode === 'demo' ? 'Preview the planned staff check-in journey with a simulated badge. No check-in or participant information is submitted or saved.' : "Use the participant's QR badge at arrival and approved event checkpoints. The QR contains only a secure random reference."} />
    {badgeScannerMode === 'demo' && <section className="poc-notice wrap" role="note"><strong>Scanner simulation</strong><p>This is a static PoC. Use <code>{demoBadgeCode}</code> to demonstrate an accepted badge. Camera scans and manual entries are evaluated locally and never sent to the registration API.</p></section>}
    <section className="checkin-shell wrap">
      <div className="checkin-controls">
        <div><p className="eyebrow">Current checkpoint</p><h2>Where are you scanning?</h2></div>
        <label className="reg-label checkin-label">Checkpoint<select className="reg-input" value={checkpoint} onChange={(event) => setCheckpoint(event.target.value)}><option>Arrival desk</option><option>Hotel departure</option><option>Contest venue entry</option><option>Cultural night</option><option>Awards ceremony</option></select></label>
        <div className={`checkin-result checkin-result-${scanState.tone}`}><span>{scanState.tone === 'accepted' ? <CheckCircle /> : scanState.tone === 'rejected' ? <X /> : <ShieldCheck />}</span><div><strong>{scanState.title}</strong><p>{scanState.detail}</p></div></div>
      </div>
      <div className="checkin-camera">
        <div className="checkin-camera-head"><Camera size={18} /><strong>Badge camera</strong><span>{badgeScannerMode === 'demo' ? cameraState === 'unavailable' ? 'Demo · camera unavailable' : 'Demo mode' : cameraState === 'ready' ? 'Live' : cameraState === 'starting' ? 'Starting' : 'Camera unavailable'}</span></div>
        <div id="iol-badge-reader" className="checkin-reader" />
        <div className="checkin-manual"><span>{badgeScannerMode === 'demo' ? `Sample badge: ${demoBadgeCode}` : 'Camera cannot read it?'}</span><div><input className="reg-input" value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="Enter badge code" /><button type="button" className="reg-btn-save" onClick={() => void submitScan(manualCode)}>{badgeScannerMode === 'demo' ? 'Simulate check-in' : 'Check badge'}</button></div></div>
      </div>
    </section>
  </>
}

function RegistrationFees() {
  return <><PageIntro eyebrow="Registration / Fees & deadlines" title="Transfer instructions, not online checkout." body="The confirmed registration windows come from the IOL 2027 fees and important dates notice. Final amounts and bank-account instructions will be published after Finance approval." /><section className="fee-grid wrap"><article><span>FEE RELEASE</span><strong>18 JAN 2027</strong><p>Fee information and approved transfer instructions are released.</p></article><article><span>EARLY BIRD</span><strong>18 JAN-12 MAR</strong><p>Early bird registration period.</p></article><article><span>REGULAR</span><strong>13 MAR-30 APR</strong><p>Regular registration period.</p></article></section><section className="two-col wrap"><div><p className="eyebrow">Payment process</p><h2>Transfer outside the website, then upload proof.</h2></div><div className="prose"><p>Teams will use the bank-transfer instructions shown in the registration system. The website does not collect payment or card details.</p><p>After transfer, the team leader uploads proof of payment. Finance verifies the proof manually before registration is confirmed.</p></div></section></>
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
  return <><PageIntro eyebrow="Event guide / Accommodation" title="Our home base in Bangkok." body="Mandarin Hotel Bangkok, managed by Centre Point, is the home base for IOL 2027 teams, jury, volunteers and staff." /><section className="hotel-feature wrap"><figure className="hotel-gallery"><div className="hotel-gallery-frame">{active > 0 && <button className="carousel-arrow carousel-arrow-left" type="button" onClick={() => setActive(active - 1)} aria-label="Previous hotel image"><ChevronLeft /></button>}<img key={image.src} src={image.src} alt={image.alt} />{active < hotelImages.length - 1 && <button className="carousel-arrow carousel-arrow-right" type="button" onClick={() => setActive(active + 1)} aria-label="Next hotel image"><ChevronRight /></button>}</div><figcaption><span>{image.caption} · Official Mandarin Hotel Bangkok image</span><span>{active + 1} / {hotelImages.length}</span></figcaption></figure><div><p className="eyebrow">Mandarin Hotel Bangkok</p><h2>662 Rama IV Road, Bang Rak, Bangkok 10500</h2><p>Located near MRT Sam Yan and within easy reach of Chulalongkorn University and central Bangkok.</p><div className="hotel-actions"><a className="pill" href="https://www.mandarin-bkk.com/" target="_blank" rel="noreferrer">Hotel website <span><ExternalLink size={16} /></span></a><a className="text-link" href="https://www.google.com/maps/search/?api=1&query=Mandarin+Hotel+Bangkok+662+Rama+IV+Road" target="_blank" rel="noreferrer"><MapPin size={16} /> Open in Google Maps</a></div></div></section><section className="hotel-map wrap"><iframe title="Mandarin Hotel Bangkok location" src="https://www.google.com/maps?q=Mandarin+Hotel+Bangkok+662+Rama+IV+Road&output=embed" loading="lazy" allowFullScreen referrerPolicy="no-referrer-when-downgrade" /></section></>
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
  return <><PageIntro eyebrow="People" title="Built by many kinds of minds." body="Committee, jury and volunteer information will be added when the approved names and roles are provided." /><SectionLinks links={[{ href: '/people/committee', label: 'Committee', detail: 'The full Thai-language roster of the organising committees and subcommittees.' }, { href: '/people/jury', label: 'Jury & Problem Committee', detail: 'Judges, problem writers, translators and markers.' }, { href: '/people/volunteers', label: 'Volunteers', detail: 'The people who welcome and guide every team.' }]} /></>
}

function CommitteeRoster() {
  const [active, setActive] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const committee = committees[active]
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }) }, [active])
  const total = committee.groups.reduce((sum, group) => sum + group.members.length, 0)
  return <section className="committee-roster wrap">
    <div className="committee-intro">
      <div><p className="eyebrow">Official roster</p><h2 className="thai">{committeeHeading.titleTh}</h2></div>
      <p className="thai committee-subtitle">{committeeHeading.subtitleTh}</p>
    </div>
    <article className="committee-patron"><span>{royalPatron.role}</span><strong className="thai">{royalPatron.name}</strong></article>
    <div className="committee-panel">
      <nav className="committee-tabs" aria-label="Committees and subcommittees">
        {committees.map((item, index) => <button key={item.number} type="button" className={index === active ? 'active' : undefined} aria-current={index === active ? 'true' : undefined} onClick={() => setActive(index)}>
          <span>{item.number.padStart(2, '0')}</span>
          <em className="thai">{item.nameTh}</em>
          <small>{item.nameEn}</small>
        </button>)}
      </nav>
      <div className="committee-box">
        <header><div><p className="eyebrow">{committee.nameEn}</p><h3 className="thai">{committee.nameTh}</h3></div><span>{total} รายชื่อ</span></header>
        <div className="committee-scroll" ref={scrollRef} tabIndex={0} role="group" aria-label={committee.nameTh}>
          {committee.groups.map((group) => <div className="committee-group" key={group.heading}>
            <h4 className="thai">{group.heading}</h4>
            <ul>{group.members.map((member, index) => <li key={`${member.name}-${index}`}><span className="thai">{member.name}</span><small className="thai">{member.role}</small></li>)}</ul>
          </div>)}
        </div>
      </div>
    </div>
    <p className="committee-note">Names and roles are published in Thai as approved in the official appointment document. English committee labels are provided for navigation only.</p>
  </section>
}

function PeopleSubpage({ kind }: { kind: 'committee' | 'jury' | 'volunteers' }) {
  const jury = kind === 'jury'
  const title = kind === 'committee' ? 'Committee' : jury ? 'Jury & Problem Committee' : 'Volunteers'
  const body = kind === 'committee' ? 'The approved committees and subcommittees appointed for IOL 2027, published in Thai exactly as they appear in the official appointment document.' : jury ? 'The main judges, problem writers, translators and markers will be introduced with photographs and approved biographies.' : 'The approved volunteer information and responsibilities will be published here.'
  return <><PageIntro eyebrow={`People / ${title}`} title={title} body={body} />{kind === 'committee' ? <CommitteeRoster /> : jury ? <section className="portrait-grid wrap">{Array.from({ length: 6 }, (_, index) => <article key={index}><div className="portrait-placeholder"><span>PHOTO</span></div><h2>Name to be confirmed</h2><p>Role and biography will be added after approval.</p></article>)}</section> : <section className="two-col wrap"><div><p className="eyebrow">Roster pending</p><h2>Information will be added when the organising team confirms it.</h2></div><div className="prose"><p>This page intentionally does not show photo placeholders. Names, responsibilities and public contact details will be published only after approval.</p></div></section>}</>
}

function Contact() {
  return <><PageIntro eyebrow="Contact" title="Let's keep the signal clear." body="For enquiries regarding IOL 2027, visa-related issues, sponsorship, programme information, future announcements, or any other issues, please contact the Local Organising Committee through email." /><section className="contact-panel wrap"><div><p className="eyebrow">Central contact</p><a className="contact-email" href="mailto:iol2027.th@gmail.com">iol2027.th@gmail.com</a></div><div className="prose"><p>Please include a clear subject line and the participant's country or team where relevant so the enquiry can reach the appropriate organising team.</p><a className="pill" href="mailto:iol2027.th@gmail.com?subject=IOL%202027%20enquiry">Send an enquiry <span><ArrowRight size={16} /></span></a></div></section></>
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
    '/registration': <Registration />, '/registration/how-to-register': <RegistrationHow />, '/registration/team-leader': <TeamLeaderAccount />, '/registration/check-in': <BadgeCheckIn />, '/registration/fees-deadlines': <RegistrationFees />, '/registration/payment': <RegistrationFees />, '/registration/visas': <Visas />, '/registration/accredited-countries': <Registration />, '/registration/working-languages': <Registration />,
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
