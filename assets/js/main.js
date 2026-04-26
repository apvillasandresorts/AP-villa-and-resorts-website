
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
  grid.innerHTML = g.images.map(src => `<img src="${src}" alt="${g.name} interior" loading="lazy">`).join('');
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

const WHATSAPP_LINK = 'https://wa.me/918999061598?text=Hi%20Apoorv%2C%20I%27d%20like%20to%20enquire%20about%20AP%20Villas.';

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
  { keys: ['hello','hi','hey','namaste','start'],
    answer: 'Namaste! 🙏 Welcome to AP Villas, Mahakal Collection. I can help with availability, prices, shuttle service, amenities, and Mahakal darshan tips. What would you like to know?',
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
  if (text.includes('whatsapp') || text.includes('open whatsapp') || text.includes('book on whatsapp') || text.includes('book now') || text.includes('book rudrangan')) {
    setTimeout(() => window.open(WHATSAPP_LINK, '_blank'), 800);
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
      addBotMsg('Namaste! 🙏 I\'m the AP Villas concierge. How can I help with your Ujjain stay?',
        ['Show villas', 'Price per night', 'Mahakal distance', 'Shuttle service']);
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
