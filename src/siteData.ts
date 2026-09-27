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
  image?: string; imageAlt?: string
}

export const venues: Venue[] = [
  {
    index: '01', name: 'Mandarin Hotel Bangkok', role: 'Home base',
    detail: 'The official home base for teams, jury, volunteers and staff.',
    building: 'Managed by Centre Point', address: '662 Rama IV Road, Bang Rak, Bangkok 10500',
    image: '/assets/mandarin-hotel.jpg', imageAlt: 'Mandarin Hotel Bangkok exterior',
    mapQuery: 'Mandarin+Hotel+Bangkok+662+Rama+IV+Road',
    transit: 'Near MRT Sam Yan',
  },
  {
    index: '02', name: 'Kasetsart University', role: 'Opening stage',
    detail: 'The opening ceremony welcomes teams to Thailand on 22 July.',
    building: 'Faculty of Humanities, Bangkhen campus', address: '50 Ngamwongwan Road, Lat Yao, Chatuchak, Bangkok 10900',
    mapQuery: 'Faculty+of+Humanities+Kasetsart+University+Bangkhen',
    transit: 'Near BTS Kasetsart University',
  },
  {
    index: '03', name: 'Chulalongkorn University', role: 'Contest campus',
    detail: 'Individual and team contests, solution presentations, closing ceremony and cultural night.',
    building: 'Faculty of Arts', address: 'Phayathai Road, Pathum Wan, Bangkok 10330',
    mapQuery: 'Faculty+of+Arts+Chulalongkorn+University',
    transit: 'Near MRT Sam Yan and BTS Siam',
  },
]
