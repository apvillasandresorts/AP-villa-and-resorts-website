
// ====== Sticky Nav ======
const nav = document.getElementById('nav');
if (nav) {
  window.addEventListener('scroll', () => {
    if (window.scrollY > 60) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
  });
}

// ====== Reveal-on-scroll ======
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale').forEach(el => io.observe(el));

// ====== Cursor Spotlight (mouse-follow radial gradient) ======
const isTouch = window.matchMedia('(hover: none)').matches;

if (!isTouch) {
  const cursorDot = document.createElement('div');
  cursorDot.className = 'cursor-dot';
  document.body.appendChild(cursorDot);
  const cursorRing = document.createElement('div');
  cursorRing.className = 'cursor-ring';
  document.body.appendChild(cursorRing);

  let mx = window.innerWidth / 2, my = window.innerHeight / 2;
  let rx = mx, ry = my;
  document.addEventListener('mousemove', (e) => {
    mx = e.clientX; my = e.clientY;
    cursorDot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
    document.documentElement.style.setProperty('--mouse-x', mx + 'px');
    document.documentElement.style.setProperty('--mouse-y', my + 'px');
  });
  // Smooth ring follow
  function loop() {
    rx += (mx - rx) * 0.18;
    ry += (my - ry) * 0.18;
    cursorRing.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
    requestAnimationFrame(loop);
  }
  loop();
  // Hover state
  document.querySelectorAll('a, button, .villa-card, .blog-card, .review-card, .cat-card, .amenity, .car-card, .stat-card, .contact-card, .nav__menu a, .fab, .chatbot-toggle').forEach(el => {
    el.addEventListener('mouseenter', () => cursorRing.classList.add('hover'));
    el.addEventListener('mouseleave', () => cursorRing.classList.remove('hover'));
  });
}

// ====== Frame border scroll-reactive glow ======
window.addEventListener('scroll', () => {
  const max = document.body.scrollHeight - window.innerHeight;
  const pct = Math.min(1, window.scrollY / Math.max(1, max));
  document.documentElement.style.setProperty('--scroll-glow', (pct * 50) + 'px');
  document.documentElement.style.setProperty('--scroll-glow-opacity', (pct * 0.15));
});

// ====== Card mouse-pos for amenity hover gradient ======
document.querySelectorAll('.amenity').forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 100;
    const my = ((e.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty('--mx', mx + '%');
    card.style.setProperty('--my', my + '%');
  });
});

// ====== Animated counters ======
function animateCounter(el) {
  const target = parseFloat(el.dataset.target);
  const dur = parseInt(el.dataset.duration || '2000');
  const decimals = parseInt(el.dataset.decimals || '0');
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    const v = target * eased;
    el.textContent = decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString('en-IN');
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      animateCounter(e.target);
      counterObserver.unobserve(e.target);
    }
  });
}, { threshold: 0.5 });
document.querySelectorAll('[data-counter]').forEach(el => counterObserver.observe(el));

// ====== Galleries data (filled per page) ======
const GALLERIES = window.GALLERIES_DATA || {};
function openGallery(key) {
  const g = GALLERIES[key];
  if (!g) return;
  const modal = document.getElementById('gallery-modal');
  if (!modal) return;
  document.getElementById('gallery-modal-title').textContent = g.name + ' — ' + g.images.length + ' Photos';
  const grid = document.getElementById('gallery-modal-grid');
  // WebP copies made by scripts/responsive-images.mjs (fall back to the original if a copy is missing)
  grid.innerHTML = g.images.map(src => `<img src="${src.replace(/\.(jpe?g|png)$/i, '-960.webp')}" onerror="this.onerror=null;this.src='${src}'" alt="${g.name} interior" loading="lazy" decoding="async">`).join('');
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}
window.openGallery = openGallery;
const galleryClose = document.getElementById('gallery-modal-close');
if (galleryClose) {
  galleryClose.addEventListener('click', () => {
    document.getElementById('gallery-modal').classList.remove('open');
    document.body.style.overflow = '';
  });
}
const galleryModal = document.getElementById('gallery-modal');
if (galleryModal) {
  galleryModal.addEventListener('click', (e) => {
    if (e.target.id === 'gallery-modal') {
      galleryModal.classList.remove('open');
      document.body.style.overflow = '';
    }
  });
}

// ====== Chatbot ======
const chatbot = document.getElementById('chatbot');
const chatbotToggle = document.getElementById('chatbot-toggle');
const chatbotClose = document.getElementById('chatbot-close');
const chatBody = document.getElementById('chatbot-body');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');

const WHATSAPP_LINK = 'https://wa.me/918999061598?text=Hi%20Apoorv%2C%20I%27d%20like%20to%20enquire%20about%20AP%20Villas.'; // rewritten to the structured message by waLink() below

function addBotMsg(text, quickReplies) {
  if (!chatBody) return;
  const div = document.createElement('div');
  div.className = 'chat-msg bot';
  div.innerHTML = text;
  chatBody.appendChild(div);
  if (quickReplies && quickReplies.length) {
    const qrDiv = document.createElement('div');
    qrDiv.className = 'chat-quick';
    quickReplies.forEach(q => {
      const btn = document.createElement('button');
      btn.textContent = q;
      btn.onclick = () => { addUserMsg(q); handleQuery(q); };
      qrDiv.appendChild(btn);
    });
    chatBody.appendChild(qrDiv);
  }
  chatBody.scrollTop = chatBody.scrollHeight;
}
function addUserMsg(text) {
  if (!chatBody) return;
  const div = document.createElement('div');
  div.className = 'chat-msg user';
  div.textContent = text;
  chatBody.appendChild(div);
  chatBody.scrollTop = chatBody.scrollHeight;
}
const KB = [
  { keys: ['check dates','availability','available'],
    answer: 'Opening WhatsApp with a short message — just fill in your dates and number of guests and we will reply with availability and the exact price.',
    quick: ['Show villas'] },
  { keys: ['check-in','check in','checkin','check-out','check out','checkout','arrival time','departure'],
    answer: '<b>Check-in is 10:30 AM</b> and <b>check-out is 9:30 AM</b>. We keep one hour in between to clean the villa properly for the next family. Need a later check-out? Ask us — we extend it whenever the villa is free.',
    quick: ['Check dates','Show villas'] },
  { keys: ['pet','pets','dog','puppy'],
    answer: 'Yes, <b>pets are welcome</b> at AP Villas. Please mention your pet when you enquire so we can prepare the villa.',
    quick: ['Check dates','Show villas'] },
  { keys: ['elder','senior','wheelchair','lift','elevator','parents','grandparent','old age','stairs'],
    answer: 'Our villas are <b>wheelchair friendly</b> with a <b>lift</b>, power backup, AC and geysers, so elders can rest comfortably between darshans. Tell us who is travelling and we will suggest the best villa.',
    quick: ['Check dates','Show villas'] },
  { keys: ['hello','hi','hey','namaste','start'],
    answer: 'Namaste! 🙏 Welcome to AP Villas & Resorts. I can help with availability, prices, shuttle service, amenities, and Mahakal darshan tips. What would you like to know?',
    quick: ['Show villas','Price per night','Mahakal distance','Shuttle service','Book now'] },
  { keys: ['villa','show villa','room','property','accommodation'],
    answer: 'We have <b>5 curated villas</b> in Ujjain:<br>◆ <b>Divinestay</b> — 3BR · sleeps 8 · from ₹5,500/night<br>◆ <b>AP Suite</b> — 2BR · sleeps 4 · from ₹4,200/night<br>◆ <b>Om Shanti Stay</b> — 2BR · sleeps 6 · from ₹4,500/night<br>◆ <b>Villa Aranya</b> — 3BR · sleeps 8 · from ₹5,800/night<br>◆ <b>Rudrangan Suites</b> (NEW) — 3BR · sleeps 6 · from ₹5,200/night<br><br>All include kitchen, shuttle, and 24-hour caretaker.',
    quick: ['Check availability','Book on WhatsApp'] },
  { keys: ['rudrangan','new villa','newest'],
    answer: '<b>Rudrangan Suites</b> is our newest property — three thoughtfully designed suites, garden seating, designer finishes, sleeps 6. From ₹5,200/night. Walking distance to Mahakaleshwar.',
    quick: ['Book Rudrangan','See all villas'] },
  { keys: ['price','cost','rate','tariff','charge','how much','per night'],
    answer: 'Rates start at <b>₹4,200/night</b> for AP Suite and go up to <b>₹14,000+</b> on peak dates like Mahashivratri. For an exact quote on your dates, share them on WhatsApp — usually replied within 5 minutes.',
    quick: ['Book on WhatsApp'] },
  { keys: ['mahakal','mahakaleshwar','jyotirlinga','temple','distance'],
    answer: '<b>2 km from Mahakaleshwar Jyotirlinga</b> · 6 minutes drive · 12 minutes walk. We offer a <b>complimentary shuttle</b> service. Mahakal Lok corridor is 2.2 km away.',
    quick: ['Bhasma Aarti booking','Shuttle timings'] },
  { keys: ['shuttle','transport','car','pick up','airport','drop','indore'],
    answer: 'We provide a <b>free Mahakal shuttle</b> for in-house guests. For longer transfers:<br>◆ Indore Airport (sedan): ₹2,500<br>◆ SUV Ertiga: ₹3,500<br>◆ Innova Crysta: ₹4,500<br>◆ Tempo Traveller: ₹6,500<br>◆ Omkareshwar day trip: ₹5,500',
    quick: ['Book shuttle','Sightseeing rates'] },
  { keys: ['amenity','amenities','facilities','what is included','include'],
    answer: 'Every villa includes:<br>✦ Full modular kitchen + microwave + kettle<br>✦ Mini fridge<br>✦ Premium mattresses & linens<br>✦ 40" HD smart TV<br>✦ 24×7 security cameras<br>✦ Private parking<br>✦ 24-hour caretaker<br>✦ High-speed WiFi<br>✦ Welcome tea + Mahakal prasad',
    quick: ['Show villas','Price per night'] },
  { keys: ['bhasma','aarti','darshan'],
    answer: 'The famous <b>Bhasma Aarti at Mahakaleshwar starts at 4 AM</b>. Tickets must be booked at the temple counter the previous evening (or online via mahakaleshwar.nic.in). Our caretaker will guide you on dress code and timings; our shuttle drops at 3:30 AM.',
    quick: ['Shuttle service','Book on WhatsApp'] },
  { keys: ['caretaker','staff','service','help'],
    answer: 'Each villa has a <b>24-hour dedicated caretaker</b> — check-in, daily housekeeping, kitchen support, transport coordination. Trained, vetted, and accountable.',
    quick: ['Show villas'] },
  { keys: ['kitchen','cook','food','breakfast','meal'],
    answer: 'Yes — every villa has a <b>full modular kitchen</b> with microwave, induction cooktop, fridge, kettle, and basic utensils. We can also arrange a local cook on request.',
    quick: ['Show villas','Catering options'] },
  { keys: ['family','children','kids','elderly','parent'],
    answer: 'AP Villas is built for <b>multi-generational pilgrim families</b>. Privacy, ground-floor bedrooms, kid-friendly inflatable pool at Om Shanti Stay, and a caretaker who understands elderly needs.',
    quick: ['Show villas','Book on WhatsApp'] },
  { keys: ['kumbh','simhastha','2028'],
    answer: '<b>Simhastha Kumbh 2028</b> runs 27 March – 27 May 2028 with 140 million expected pilgrims. We open early-bird booking from <b>Q3 2027</b>. Premium families are encouraged to register interest now via WhatsApp for our priority list.',
    quick: ['Register interest','Book on WhatsApp'] },
  { keys: ['cancel','cancellation','refund','policy'],
    answer: 'Cancellation depends on date and platform. <b>Free cancellation</b> typically up to 7 days before arrival on standard dates. Festival dates are usually <b>non-refundable</b>. Share dates on WhatsApp for the exact policy.',
    quick: ['Book on WhatsApp'] },
  { keys: ['available','availability','date','book'],
    answer: 'Availability changes by the hour during peak season. The fastest way to confirm dates is to <b>WhatsApp us</b> with check-in/out dates and number of guests. We usually reply within 5 minutes.',
    quick: ['Open WhatsApp','Show villas'] },
  { keys: ['discount','offer','deal','promotion','cheap'],
    answer: 'We offer <b>10% off for repeat guests</b> and <b>8% off on first-time direct bookings</b> (weekday only). Peak dates we maintain pricing — but value-adds (shuttle, welcome basket) are always included.',
    quick: ['Book on WhatsApp'] },
  { keys: ['gallery','photo','image'],
    answer: 'You can see photos of all our villas on our <a href="villas.html">Villas page</a>, and beautiful Ujjain temples on our <a href="gallery.html">Gallery page</a>.',
    quick: ['Show villas','Open gallery'] },
  { keys: ['blog','article','journal','guide'],
    answer: 'We publish guides on Mahakaleshwar, Ujjain attractions, history, and Omkareshwar. Visit our <a href="blog.html">Journal</a> for the full list.',
    quick: ['Open journal','Show villas'] },
  { keys: ['founder','about','apoorv','owner'],
    answer: 'AP Villas is founded and operated by <b>Apoorv</b>, in business for 3 years and serving 600+ pilgrim families across 50+ cities and 8+ ethnicities. Read more on our <a href="about.html">About page</a>.',
    quick: ['Read about','Show villas'] },
  { keys: ['payment','pay','upi','card','razorpay'],
    answer: 'We accept UPI, bank transfer, Razorpay (cards), and platform payments via Airbnb / Booking.com / MakeMyTrip. <b>50% to confirm</b>, balance on arrival (standard dates). 100% advance for festival dates.',
    quick: ['Book on WhatsApp'] },
];
function handleQuery(q) {
  const text = q.toLowerCase();
  let match = null;
  for (const item of KB) {
    if (item.keys.some(k => text.includes(k))) { match = item; break; }
  }
  if (match) {
    setTimeout(() => addBotMsg(match.answer, match.quick), 500);
  } else {
    setTimeout(() => addBotMsg(
      "I'm not sure I have a perfect answer for that. For the fastest reply, would you like to chat with Apoorv on WhatsApp?",
      ['Open WhatsApp', 'Show villas', 'Mahakal distance']
    ), 500);
  }
  if (text.includes('whatsapp') || text.includes('open whatsapp') || text.includes('book on whatsapp') || text.includes('book now') || text.includes('book rudrangan') || text.includes('check dates')) {
    setTimeout(() => window.open(waLink({ villa: text.includes('rudrangan') ? 'Rudrangan Suites' : '', place: 'chat' }), '_blank'), 800);
  }
  if (text.includes('open gallery') || text.includes('open journal') || text.includes('read about')) {
    const map = { 'open gallery': 'gallery.html', 'open journal': 'blog.html', 'read about': 'about.html' };
    for (const k in map) {
      if (text.includes(k)) { setTimeout(() => window.location.href = map[k], 800); break; }
    }
  }
}

if (chatbotToggle) {
  chatbotToggle.addEventListener('click', () => {
    chatbot.classList.toggle('open');
    if (chatbot.classList.contains('open') && chatBody.children.length === 0) {
      addBotMsg('Namaste! 🙏 Quick answers about your Ujjain stay. For your exact dates and price, WhatsApp us.',
        ['Show villas', 'Price per night', 'Check-in time', 'Travelling with elders', 'Check dates']);
    }
  });
}
if (chatbotClose) chatbotClose.addEventListener('click', () => chatbot.classList.remove('open'));
if (chatSend) chatSend.addEventListener('click', () => {
  const v = chatInput.value.trim();
  if (!v) return;
  addUserMsg(v); handleQuery(v); chatInput.value = '';
});
if (chatInput) chatInput.addEventListener('keypress', e => {
  if (e.key === 'Enter') chatSend.click();
});

// ====== Logo shine: wrap brand logos so CSS can sweep a light across them ======
document.querySelectorAll('.nav__logo-full, .footer__logo-full').forEach(img => {
  if (img.parentElement.classList.contains('logo-shine')) return;
  const wrap = document.createElement('span');
  wrap.className = 'logo-shine' + (img.classList.contains('footer__logo-full') ? ' logo-shine--footer' : '');
  img.parentNode.insertBefore(wrap, img);
  wrap.appendChild(img);
});

// ====== Smart WhatsApp enquiries ======
// Every generic "enquire" link becomes a short structured message (villa, dates, guests)
// plus a reference code, so chats start with the facts and we can see which page produced them.
const WA_NUMBER = '918999061598';
const VILLA_CODES = { 'Divinestay': 'DIV', 'AP Suite': 'APS', 'Om Shanti Stay': 'OMS', 'Villa Aranya': 'ARA', 'Rudrangan Suites': 'RUD' };
function pageCode() {
  const p = location.pathname.replace(/\/$/, '/index.html');
  if (p.includes('/blog/')) return 'BLOG-' + p.split('/').pop().replace('.html', '').slice(0, 24).toUpperCase();
  const name = (p.split('/').pop() || 'index.html').replace('.html', '');
  return ({ index: 'HOME', villas: 'VILLAS', contact: 'CONTACT', about: 'ABOUT', blog: 'JOURNAL', gallery: 'GALLERY', menu: 'DINING', travel: 'TRAVEL', 'mahakal-game': 'GAME' })[name] || name.toUpperCase();
}
function waLink({ villa = '', checkin = '', nights = '', adults = '', children = '', elders = false, place = '' } = {}) {
  const ref = 'WEB-' + pageCode() + (villa && VILLA_CODES[villa] ? '-' + VILLA_CODES[villa] : '') + (place ? '-' + place.toUpperCase() : '');
  const lines = [
    "Namaste! I'd like to check availability.",
    'Villa: ' + (villa || 'Please suggest one for us'),
    'Check-in date: ' + (checkin || ''),
    'Nights: ' + (nights || ''),
    'Guests: ' + (adults ? adults + ' adults' : '') + (children ? ', ' + children + ' children' : '') + (adults ? '' : '(adults / children)'),
  ];
  if (elders) lines.push('Travelling with elders: yes (lift / easy access please)');
  lines.push('Ref: ' + ref);
  return 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(lines.join('\n'));
}
window.waLink = waLink;

function ctaPlace(a) {
  if (a.closest('.hero')) return 'hero';
  if (a.closest('.nav')) return 'nav';
  if (a.closest('.villa-card')) return 'card';
  if (a.closest('.m-bar')) return 'bar';
  if (a.closest('.fab, .book-bar')) return 'float';
  if (a.closest('.article')) return 'post';
  if (a.closest('.footer, .contact-card, .contact-bg')) return 'contact';
  return '';
}
document.querySelectorAll('a[href*="wa.me/918999061598"]').forEach(a => {
  let msg = '';
  try { msg = decodeURIComponent((a.href.split('text=')[1] || '').replace(/\+/g, ' ')); } catch (e) {}
  const m = msg.match(/^Hi Apoorv, I'd like to enquire about (.+?)\.?$/);
  if (!m) return; // keep special messages (food orders, travel services, game)
  const villa = VILLA_CODES[m[1]] ? m[1] : '';
  a.href = waLink({ villa, place: ctaPlace(a) });
  a.dataset.villa = villa;
});

// ====== Analytics events (sent only when Google Analytics is installed) ======
function track(name, params) { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); }
window.track = track;
document.addEventListener('click', e => {
  const a = e.target.closest('a[href*="wa.me/"], a[href^="tel:"]');
  if (!a) return;
  const params = { page_path: location.pathname, cta_location: ctaPlace(a) || 'other', villa: a.dataset.villa || '' };
  track(a.href.startsWith('tel:') ? 'phone_click' : 'whatsapp_click', params);
}, true);

// ====== "Check dates" mini form → opens WhatsApp with the details filled in ======
document.querySelectorAll('[data-enquiry]').forEach((host, i) => {
  const id = 'enq' + i;
  const preset = host.dataset.villa || '';
  const today = new Date().toISOString().slice(0, 10);
  host.innerHTML = `
  <form class="enquiry" id="${id}" novalidate>
    <div class="enquiry__head">
      <h3>Check dates &amp; price</h3>
      <p>Tell us your plan. WhatsApp opens with everything filled in — we reply with availability and the exact price.</p>
    </div>
    <div class="enquiry__grid">
      <label for="${id}-villa">Villa
        <select id="${id}-villa" name="villa">
          <option value="">Help me choose</option>
          ${Object.keys(VILLA_CODES).map(v => `<option${v === preset ? ' selected' : ''}>${v}</option>`).join('')}
        </select></label>
      <label for="${id}-in">Check-in date
        <input id="${id}-in" name="checkin" type="date" min="${today}"></label>
      <label for="${id}-nights">Nights
        <select id="${id}-nights" name="nights">${[1,2,3,4,5,6,7].map(n => `<option>${n}</option>`).join('')}<option value="8+">8 or more</option></select></label>
      <label for="${id}-adults">Adults
        <select id="${id}-adults" name="adults">${[1,2,3,4,5,6,7,8,9,10].map(n => `<option${n === 4 ? ' selected' : ''}>${n}</option>`).join('')}<option value="10+">More than 10</option></select></label>
      <label for="${id}-kids">Children
        <select id="${id}-kids" name="children">${[0,1,2,3,4,5,6].map(n => `<option>${n}</option>`).join('')}</select></label>
      <label class="enquiry__check" for="${id}-elders"><input id="${id}-elders" name="elders" type="checkbox"> Travelling with elders (need lift / easy access)</label>
    </div>
    <button type="submit" class="btn btn--primary enquiry__submit">Check dates on WhatsApp</button>
    <p class="enquiry__note">No payment now. Check-in 10:30 AM · check-out 9:30 AM.</p>
  </form>`;
  host.querySelector('form').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    const d = f.checkin.value ? new Date(f.checkin.value + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    const villa = f.villa.value;
    track('enquiry_form_submit', { page_path: location.pathname, villa, nights: f.nights.value, adults: f.adults.value });
    window.open(waLink({ villa, checkin: d, nights: f.nights.value, adults: f.adults.value, children: f.children.value !== '0' ? f.children.value : '', elders: f.elders.checked, place: 'form' }), '_blank', 'noopener');
  });
});

// ====== Phones: one bottom bar (WhatsApp · Call · Quick answers) instead of floating circles ======
(function () {
  const bar = document.createElement('nav');
  bar.className = 'm-bar';
  bar.setAttribute('aria-label', 'Contact AP Villas');
  const villaOnPage = document.querySelector('[data-enquiry]')?.dataset.villa || '';
  bar.innerHTML = `
    <a class="m-bar__wa" href="${waLink({ villa: villaOnPage, place: 'bar' })}" target="_blank" rel="noopener" data-villa="${villaOnPage}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.05 2a9.9 9.9 0 0 0-8.5 14.96L2 22l5.2-1.53A9.9 9.9 0 1 0 12.05 2Zm5.8 13.9c-.25.7-1.43 1.33-2 1.4-.51.07-1.16.1-1.87-.12-.43-.14-.98-.32-1.69-.62-2.98-1.29-4.92-4.29-5.07-4.49-.15-.2-1.21-1.61-1.21-3.07s.77-2.18 1.04-2.48c.27-.3.6-.37.79-.37h.57c.18 0 .43-.07.67.51.25.6.84 2.06.92 2.21.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.17-.31.39-.45.52-.15.15-.3.31-.13.6.17.3.77 1.27 1.65 2.06 1.13 1.01 2.09 1.32 2.39 1.47.3.15.47.12.64-.07.17-.2.74-.87.94-1.16.2-.3.4-.25.67-.15.27.1 1.73.82 2.03.97.3.15.5.22.57.35.07.12.07.71-.18 1.41Z"/></svg>
      <span>Check dates</span></a>
    <a class="m-bar__call" href="tel:+918999061598">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z"/></svg>
      <span>Call</span></a>
    <button type="button" class="m-bar__ask" aria-controls="chatbot">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M9.5 9.5a2.5 2.5 0 0 1 4.8.9c0 1.6-2.3 2.1-2.3 3.1M12 16.5h.01"/></svg>
      <span>Quick answers</span></button>`;
  document.body.appendChild(bar);
  document.body.classList.add('has-m-bar');
  bar.querySelector('.m-bar__ask').addEventListener('click', () => {
    const t = document.getElementById('chatbot-toggle');
    if (t) t.click();
  });
})();
