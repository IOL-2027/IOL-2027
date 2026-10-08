export const event = {
  name: 'The 24th International Linguistics Olympiad',
  shortName: 'IOL 2027',
  dates: '21-28 July 2027',
  city: 'Bangkok, Thailand',
  openingDate: '2027-07-21T00:00:00+07:00',
}

export const schedule = [
  { date: '21 JUL', day: 'Day 01', title: 'Arrivals', detail: 'Teams arrive, check in and gather at the official home base.' },
  { date: '22 JUL', day: 'Day 02', title: 'Opening ceremony', detail: 'The Olympiad opens at Kasetsart University, followed by the kick-off session and first activity.' },
  { date: '23 JUL', day: 'Day 03', title: 'Individual contest', detail: 'Five language puzzles and six hours of concentrated work at Chulalongkorn University.' },
  { date: '24 JUL', day: 'Day 04', title: 'Excursion', detail: 'A hosted day to encounter Thailand through place, culture and conversation.' },
  { date: '25 JUL', day: 'Day 05', title: 'Bangkok city programme', detail: 'A hosted city experience and time for teams to connect.' },
  { date: '26 JUL', day: 'Day 06', title: 'Team contest', detail: 'Teams of four solve one extended problem together at Chulalongkorn University.' },
  { date: '27 JUL', day: 'Day 07', title: 'Solutions and closing', detail: 'Solution presentations, the closing ceremony and cultural night.' },
  { date: '28 JUL', day: 'Day 08', title: 'Departures', detail: 'Farewells and official transfers on the departure day.' },
]

export type Venue = {
  index: string; name: string; role: string; detail: string
  building: string; address: string; mapQuery: string; transit: string
  image: string; imageAlt: string; imagePosition: string
  imageCredit: string; imageCreditUrl: string
}

// Campus photographs come from Wikimedia Commons under CC BY-SA 4.0, which requires
// the author, licence and source to be shown wherever the image is used.
export const venues: Venue[] = [
  {
    index: '01', name: 'Mandarin Hotel Bangkok', role: 'Home base',
    detail: 'The official home base for teams, jury, volunteers and staff.',
    building: 'Managed by Centre Point', address: '662 Rama IV Road, Bang Rak, Bangkok 10500',
    mapQuery: 'Mandarin+Hotel+Bangkok+662+Rama+IV+Road',
    transit: 'Near MRT Sam Yan',
    image: '/assets/mandarin-hotel.jpg', imageAlt: 'Lobby atrium of Mandarin Hotel Bangkok with crystal chandeliers', imagePosition: 'center 28%',
    imageCredit: 'Lobby atrium · Photo: Mandarin Hotel Bangkok', imageCreditUrl: 'https://www.mandarin-bkk.com/',
  },
  {
    index: '02', name: 'Kasetsart University', role: 'Opening stage',
    detail: 'The opening ceremony welcomes teams to Thailand on 22 July.',
    building: 'Faculty of Humanities, Bangkhen campus', address: '50 Ngamwongwan Road, Lat Yao, Chatuchak, Bangkok 10900',
    mapQuery: 'Faculty+of+Humanities+Kasetsart+University+Bangkhen',
    transit: 'Near BTS Kasetsart University',
    image: '/assets/venues/kasetsart-main-auditorium.jpg', imageAlt: 'Main Auditorium of Kasetsart University, Bangkhen campus', imagePosition: 'center 48%',
    imageCredit: 'Main Auditorium · Photo: David Supervid, CC BY-SA 4.0', imageCreditUrl: 'https://commons.wikimedia.org/wiki/File:Kasetsart_University_Auditorium.jpg',
  },
  {
    index: '03', name: 'Chulalongkorn University', role: 'Contest campus',
    detail: 'Individual and team contests, solution presentations, closing ceremony and cultural night.',
    building: 'Faculty of Arts', address: 'Phayathai Road, Pathum Wan, Bangkok 10330',
    mapQuery: 'Faculty+of+Arts+Chulalongkorn+University',
    transit: 'Near MRT Sam Yan and BTS Siam',
    image: '/assets/venues/chula-mahavajiravudh.jpg', imageAlt: 'Maha Vajiravudh Building, Faculty of Arts, Chulalongkorn University', imagePosition: 'center 42%',
    imageCredit: 'Maha Vajiravudh Building · Photo: BunBn, CC BY-SA 4.0', imageCreditUrl: 'https://commons.wikimedia.org/wiki/File:Mahavajiravudh_Building,_Chulalongkorn_University.jpg',
  },
]

// Walking route from the home base to the contest faculty. The embed URL needs no API key;
// the directions URL opens the Google Maps app on phones that have it installed.
export const homeBaseRoute = {
  from: 'Mandarin Hotel Bangkok',
  to: 'Faculty of Arts, Chulalongkorn University',
  embed: 'https://maps.google.com/maps?saddr=Mandarin+Hotel+Bangkok,+662+Rama+IV+Road&daddr=Faculty+of+Arts,+Chulalongkorn+University&dirflg=w&output=embed',
  walking: 'https://www.google.com/maps/dir/?api=1&origin=Mandarin+Hotel+Bangkok,+662+Rama+IV+Road&destination=Faculty+of+Arts,+Chulalongkorn+University&travelmode=walking',
  driving: 'https://www.google.com/maps/dir/?api=1&origin=Mandarin+Hotel+Bangkok,+662+Rama+IV+Road&destination=Faculty+of+Arts,+Chulalongkorn+University&travelmode=driving',
}
