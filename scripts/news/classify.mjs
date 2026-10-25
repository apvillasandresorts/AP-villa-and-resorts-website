// News for AP Villas: is a story relevant to five villas near Mahakaleshwar, which kind, how big an impact, and which way demand moves.
// Pure functions (tested in tests/news.test.mjs). Keyword rules in English and Hindi; never invents facts, only labels headlines.

const PLACE = /\b(ujjain|mahakal|mahakaleshwar|mahakaal|simhastha|kshipra|shipra|omkareshwar|indore|dewas|madhya pradesh|\bmp\b)\b|उज्जैन|महाकाल|सिंहस्थ|क्षिप्रा|ओंकारेश्वर|इंदौर/i;
const CORE = /\b(ujjain|mahakal|mahakaleshwar|mahakaal|simhastha|kshipra|shipra)\b|उज्जैन|महाकाल|सिंहस्थ|क्षिप्रा/i;
const CATS = [
  ['temple', /\b(temple|darshan|bhasma aarti|bhasm|garbhagriha|sawari|savari|jyotirling|mahakal lok|pujari|priest|devotees?|pilgrims?|shravan|aarti|prasad)\b|मंदिर|दर्शन|भस्म आरती|सवारी|श्रद्धालु|गर्भगृह/i],
  ['festival', /\b(mahashivratri|shivratri|diwali|deepawali|navratri|holi|kartik|purnima|nag panchami|sawan|shravan|kumbh|simhastha|hari ?har|vaikunth|janmashtami|dussehra|new year|christmas)\b|महाशिवरात्रि|शिवरात्रि|दीपावली|नवरात्रि|पूर्णिमा|सिंहस्थ|कुंभ|सावन/i],
  ['travel', /\b(trains?|railways?|rail|vande bharat|flights?|airports?|airlines?|indigo|air india|bus|buses|highways?|roads?|expressways?|traffic|metro|ropeway|helicopters?|parking)\b|ट्रेन|रेल|उड़ान|एयरपोर्ट|हवाई|बस|सड़क|यातायात|पार्किंग/i],
  ['hospitality', /\b(hotel|hotels|homestay|home stay|dharamshala|resort|tourism|tourists?|tourist|occupancy|room|rooms|booking|bookings|guest ?house|airbnb|hospitality|stay)\b|होटल|धर्मशाला|पर्यटन|पर्यटक|बुकिंग/i],
  ['weather', /\b(rain|rainfall|monsoon|flood|heat|heatwave|cold wave|fog|storm|imd|weather|temperature)\b|बारिश|बाढ़|गर्मी|ठंड|कोहरा|मौसम/i],
  ['safety', /\b(stampede|curfew|ban|banned|closed|closure|restriction|restrictions|protest|strike|bandh|vip|security|police|accident|fire|clash|section 144|mock drill)\b|भगदड़|कर्फ्यू|प्रतिबंध|बंद|हड़ताल|सुरक्षा|पुलिस|हादसा/i],
  ['development', /\b(project|construction|crore|corridor|smart city|development|inaugurat|foundation stone|works?|widening|demolition|encroachment)\b|परियोजना|निर्माण|करोड़|लोकार्पण|भूमिपूजन/i],
];
const SCHEDULE = /\b(aarti|darshan|bhasma)\b[^.]{0,40}\b(tim(e|ing)s?|schedule|change[sd]?|new rules?|booking|online|ticket|dress code|ban)\b|आरती[^.]{0,30}समय|दर्शन व्यवस्था|दर्शन[^.]{0,20}(नियम|बुकिंग|टिकट)|आरतियों का समय/i;
const HIGH = /\b(stampede|curfew|closed|closure|shut|suspend(ed)?|cancel(l)?ed|ban(ned)?|restrict(ion|ed)|flood|record (crowd|footfall)|lakh devotees|crore devotees|bandh|section 144|no entry|darshan (stopped|halted|closed))\b|भगदड़|कर्फ्यू|बंद रहेगा|प्रतिबंध|लाख श्रद्धालु|रिकॉर्ड/i;
const UP = /\b(record|lakh|crore devotees|rush|crowd|surge|new (train|flight)s?|special trains?|extra (coaches|flights)|festival|celebrat|inaugurat|opens?|launch|boost|increase|rise)\b|लाख|भीड़|उमड़|विशेष ट्रेन|नई उड़ान|बढ़/i;
const DOWN = /\b(closed|closure|shut|suspend|cancel|ban|restrict|curfew|stampede|flood|heatwave|strike|bandh|diverted|blocked|delay|decline|drop|fall)\b|बंद|रद्द|प्रतिबंध|भगदड़|बाढ़|हड़ताल|डायवर्ट|गिरावट/i;

export function normTitle(t) { return String(t || '').toLowerCase().replace(/\s+-\s+[^-]+$/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
export function newsId(t) { let h = 2166136261; for (const ch of normTitle(t)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return 'N' + h.toString(36); }

/** → null when not relevant; otherwise { category, categories, impact, direction, score } */
export function classify(title, summary = '') {
  const t = String(title || '') + ' ' + String(summary || '');
  if (!PLACE.test(t)) return null;
  if (/\b(nashik|trimbak|trimbakeshwar|prayagraj|haridwar)\b|नाशिक|नासिक|त्र्यंबक|प्रयागराज|हरिद्वार/i.test(t) && !/\b(ujjain|mahakal)|उज्जैन|महाकाल/i.test(t)) return null;   // other Kumbh / Simhastha cities
  const core = CORE.test(t), cats = CATS.filter(([, re]) => re.test(t)).map(([c]) => c);
  // regional (Indore / MP) stories only matter for travel, festivals, weather and safety
  if (!core && !cats.some(c => ['travel', 'weather', 'safety', 'festival'].includes(c))) return null;
  if (!core && cats.length === 1 && cats[0] === 'safety') return null;   // routine Indore police news is not ours
  const high = (HIGH.test(t) && (core || cats.includes('travel') || cats.includes('weather'))) || (core && SCHEDULE.test(t));   // temple schedule changes: guests must know
  const up = UP.test(t), down = DOWN.test(t);
  const category = ['safety', 'temple', 'festival', 'travel', 'hospitality', 'weather', 'development'].find(c => cats.includes(c)) || 'general';
  const score = (core ? 50 : 20) + (high ? 30 : 0) + Math.min(20, cats.length * 5);
  return { category, categories: cats, impact: high ? 'high' : (core && cats.length) || cats.includes('travel') ? 'medium' : 'low', direction: down && !up ? 'down' : up && !down ? 'up' : 'neutral', score };
}

/** Minimal RSS 2.0 / Atom item reader (title, link, pubDate, source, description without markup). */
export function parseFeed(xml) {
  const items = [], text = String(xml || '');
  const strip = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();   // decode, then drop markup that was escaped
  for (const m of text.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/g)) {
    const b = m[0], tag = n => (b.match(new RegExp('<' + n + '\\b[^>]*>([\\s\\S]*?)</' + n + '>')) || [])[1];
    const link = strip(tag('link')) || (b.match(/<link[^>]+href="([^"]+)"/) || [])[1] || '';
    items.push({ title: strip(tag('title')), url: link, published: strip(tag('pubDate') || tag('published') || tag('updated') || tag('dc:date')), source: strip(tag('source')), summary: strip(tag('description') || tag('summary')).slice(0, 280) });
  }
  return items.filter(i => i.title && /^https?:\/\//.test(i.url));
}
