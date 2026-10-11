// ====== E-Check-in ======
// A 4-step guest registration form. On submit, the answers and ID files go to the owner's Google Sheet and
// a private Google Drive folder through a Google Apps Script web app (see docs/echeckin-setup.md).
// Until that web app URL is set below, the form falls back to sending the details on WhatsApp.
(function () {
  const ENDPOINT = window.ECHECKIN_ENDPOINT || '';
  const WA_NUMBER = '918999061598';
  const form = document.getElementById('ci-form');
  if (!form) return;
  const $ = s => form.querySelector(s), $$ = s => [...form.querySelectorAll(s)];
  const q = n => form.elements[n];
  const steps = $$('.ci-step'), dots = $$('.ci-steps li');
  const err = document.getElementById('ci-error');
  let step = 0;

  // ---- date defaults ----
  const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const today = new Date();
  q('checkin_date').min = iso(new Date(today.getTime() - 3 * 864e5));   // allow filling on arrival or a day late
  const syncDates = () => {
    const ci = q('checkin_date').value;
    if (ci) {
      const n = new Date(ci + 'T00:00'); n.setDate(n.getDate() + 1);
      q('checkout_date').min = iso(n);
      if (!q('checkout_date').value || q('checkout_date').value <= ci) q('checkout_date').value = iso(n);
    }
    const co = q('checkout_date').value;
    const nights = ci && co ? Math.round((new Date(co + 'T00:00') - new Date(ci + 'T00:00')) / 864e5) : 0;
    document.getElementById('ci-nights').textContent = nights > 0 ? `${nights} night${nights > 1 ? 's' : ''} · check-in from 10:30 AM, check-out by 9:30 AM` : '';
    return nights;
  };
  q('checkin_date').addEventListener('change', syncDates);
  q('checkout_date').addEventListener('change', syncDates);

  // ---- conditional sections ----
  const isOta = () => q('booking_source').value && !q('booking_source').value.startsWith('Direct');
  const isDirect = () => q('booking_source').value.startsWith('Direct');
  const isForeign = () => q('nationality').value.startsWith('Other');
  function applyShow() {
    const on = { ota: isOta(), direct: isDirect(), foreign: isForeign(), advance: q('advance_paid').value === 'Yes' };
    $$('[data-show]').forEach(el => {
      const show = on[el.dataset.show];
      el.hidden = !show;
      el.querySelectorAll('input, select').forEach(i => { i.disabled = !show; });
      if (el.matches('input, select')) el.disabled = !show;
    });
    q('booking_id').required = on.ota;
    q('advance_paid').required = on.direct;
    ['country', 'passport_no', 'visa_no', 'visa_expiry', 'passport_page', 'visa_page'].forEach(n => { q(n).required = on.foreign; });
  }
  form.addEventListener('change', e => { if (['booking_source', 'nationality', 'advance_paid'].includes(e.target.name)) applyShow(); });

  // ---- other members: one row per extra person ----
  const membersBox = document.getElementById('ci-members');
  function renderMembers() {
    const adults = Math.max(1, +q('adults').value || 1), kids = Math.max(0, +q('children').value || 0);
    const total = adults + kids - 1;
    const old = $$('.ci-member').map(r => ({ name: r.querySelector('[data-k="name"]').value, age: r.querySelector('[data-k="age"]').value, gender: r.querySelector('[data-k="gender"]').value, relation: r.querySelector('[data-k="relation"]').value }));
    document.getElementById('ci-members-count').textContent = total > 0 ? `(${total} more)` : '(none)';
    membersBox.innerHTML = Array.from({ length: Math.min(total, 39) }, (_, i) => {
      const o = old[i] || {}, kid = i >= adults - 1;
      return `<div class="ci-member"><span class="ci-member__n">${i + 2}</span>
        <input data-k="name" type="text" maxlength="80" placeholder="Full name${kid ? ' (child)' : ''}" value="${(o.name || '').replace(/"/g, '&quot;')}" required aria-label="Guest ${i + 2} name">
        <input data-k="age" type="number" min="0" max="110" placeholder="Age" value="${o.age || ''}" required inputmode="numeric" aria-label="Guest ${i + 2} age">
        <select data-k="gender" required aria-label="Guest ${i + 2} gender"><option value="">Gender</option>${['Male', 'Female', 'Other'].map(g => `<option${o.gender === g ? ' selected' : ''}>${g}</option>`).join('')}</select>
        <input data-k="relation" type="text" maxlength="30" placeholder="Relation (e.g. wife, son)" value="${(o.relation || '').replace(/"/g, '&quot;')}" aria-label="Guest ${i + 2} relation"></div>`;
    }).join('') || '<p class="ci-hint">Just you. Change the number of adults or children in step 1 if more people are coming.</p>';
  }
  q('adults').addEventListener('change', renderMembers);
  q('children').addEventListener('change', renderMembers);

  // ---- file pickers: show chosen names ----
  form.addEventListener('change', e => {
    if (e.target.type !== 'file') return;
    const files = [...e.target.files], name = e.target.closest('.ci-drop').querySelector('.ci-drop__name');
    const tooBig = files.find(f => f.type === 'application/pdf' && f.size > 4e6);
    if (tooBig) { e.target.value = ''; name.textContent = 'That PDF is over 4 MB. Please upload a photo instead.'; return; }
    name.textContent = files.length ? files.map(f => f.name).join(', ') : '';
    e.target.closest('.ci-drop').classList.toggle('has-file', files.length > 0);
  });

  // ---- step navigation with validation ----
  function validate(i) {
    err.textContent = '';
    const fields = [...steps[i].querySelectorAll('input, select, textarea')].filter(el => !el.disabled && el.type !== 'hidden' && !el.classList.contains('ci-hp'));
    for (const el of fields) {
      el.classList.remove('is-bad');
      let ok = el.checkValidity();
      if (ok && el.name === 'phone') ok = /^\+?\d[\d\s-]{8,14}$/.test(el.value.trim());
      if (ok && el.name === 'id_last4') ok = /^[A-Za-z0-9]{4}$/.test(el.value.trim());
      if (!ok) {
        el.classList.add('is-bad'); el.focus({ preventScroll: true });
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        const label = (el.closest('label')?.childNodes[0]?.textContent || el.getAttribute('aria-label') || el.placeholder || 'This field').trim().replace(/\s+\*$/, '');
        err.textContent = el.type === 'checkbox' ? 'Please tick the required declarations.' : el.name === 'phone' ? 'Please enter a valid mobile number.' : el.type === 'file' ? `Please upload: ${label}.` : `Please fill: ${label}.`;
        return false;
      }
    }
    if (i === 0 && syncDates() <= 0) { err.textContent = 'Check-out must be after check-in.'; return false; }
    return true;
  }
  function go(i) {
    step = i;
    steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
    dots.forEach((d, k) => { d.classList.toggle('is-active', k === i); d.classList.toggle('is-done', k < i); });
    document.getElementById('ci-back').hidden = i === 0;
    document.getElementById('ci-next').hidden = i === steps.length - 1;
    document.getElementById('ci-submit').hidden = i !== steps.length - 1;
    if (i === 1) renderMembers();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  document.getElementById('ci-next').addEventListener('click', () => { if (validate(step)) go(step + 1); });
  document.getElementById('ci-back').addEventListener('click', () => go(step - 1));
  dots.forEach((d, k) => d.addEventListener('click', () => { if (k < step) go(k); }));

  // ---- files → compressed base64 ----
  function readAsDataURL(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }); }
  async function packFile(file, label) {
    if (file.type === 'application/pdf') { const d = await readAsDataURL(file); return { label, name: file.name, type: file.type, data: d.split(',')[1] }; }
    const url = await readAsDataURL(file);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const max = 1600, k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const d = c.toDataURL('image/jpeg', 0.78);
    return { label, name: file.name.replace(/\.[^.]+$/, '') + '.jpg', type: 'image/jpeg', data: d.split(',')[1] };
  }

  // ---- collect ----
  function collect() {
    const v = n => (q(n) && !q(n).disabled ? String(q(n).value || '').trim() : '');
    const members = $$('.ci-member').map(r => ['name', 'age', 'gender', 'relation'].map(k => r.querySelector(`[data-k="${k}"]`).value.trim()));
    const fields = {
      booking_source: v('booking_source'), booking_id: v('booking_id'), villa: v('villa'),
      checkin_date: v('checkin_date'), arrival_time: v('arrival_time'), checkout_date: v('checkout_date'), nights: String(syncDates()),
      adults: v('adults'), children: v('children'), arrival_mode: v('arrival_mode'), vehicle_number: v('vehicle_number').toUpperCase(),
      guest_name: v('guest_name'), phone: v('phone'), email: v('email'), age: v('age'), gender: v('gender'),
      address: v('address'), city: v('city'), state: v('state'), pincode: v('pincode'), nationality: v('nationality'),
      country: v('country'), passport_no: v('passport_no'), visa_no: v('visa_no'), visa_expiry: v('visa_expiry'),
      india_arrival: v('india_arrival'), coming_from: v('coming_from'), next_destination: v('next_destination'),
      members: members.map(m => `${m[0]} (${m[1]}, ${m[2]}${m[3] ? ', ' + m[3] : ''})`).join('; '),
      id_type: v('id_type'), id_last4: v('id_last4'),
      advance_paid: v('advance_paid'), advance_amount: v('advance_amount'), payment_mode: v('payment_mode'), payment_ref: v('payment_ref'), payment_date: v('payment_date'),
      total_amount: v('total_amount'), ota_payment: v('ota_payment'),
      purpose: v('purpose'), heard_from: v('heard_from'), first_visit: v('first_visit'), requests: v('requests'),
      consent_data: q('consent_data').checked ? 'Yes' : 'No', consent_offers: q('consent_offers').checked ? 'Yes' : 'No', signature: v('signature'),
    };
    return fields;
  }
  const ref = () => { const d = new Date(), A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return 'ECI-' + iso(d).slice(2).replace(/-/g, '') + '-' + Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); };
  const nice = s => s ? new Date(s + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  // ---- submit ----
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!validate(step)) return;
    if (q('website').value) return;   // bots fill the hidden field
    const btn = document.getElementById('ci-submit');
    const f = collect(), r = ref();
    const waText = [
      'Namaste Apoorv ji 🙏', `I have completed e-check-in. Ref: ${r}`, '',
      `👤 ${f.guest_name} · ${f.phone}`, `🏡 ${f.villa}`, `📅 ${nice(f.checkin_date)} → ${nice(f.checkout_date)} (${f.nights} night${f.nights === '1' ? '' : 's'})`,
      `👨‍👩‍👧 ${f.adults} adult(s), ${f.children || 0} child(ren)`, `🧾 ${f.booking_source}${f.booking_id ? ' · ' + f.booking_id : ''}`,
    ];
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      if (ENDPOINT) {
        const files = [];
        const add = async (name, label) => { for (const file of q(name) && !q(name).disabled ? q(name).files : []) files.push(await packFile(file, label)); };
        btn.textContent = 'Preparing your ID photos…';
        await add('id_front', 'ID-front'); await add('id_back', 'ID-back'); await add('other_ids', 'Other-adult-ID');
        await add('passport_page', 'Passport'); await add('visa_page', 'Visa');
        btn.textContent = 'Sending securely…';
        const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ref: r, submitted_at: new Date().toISOString(), page: location.href, fields: f, files, website: '' }) });
        const out = await res.json().catch(() => ({}));
        if (!out.ok) throw new Error(out.error || 'Upload failed');
        done(f, r, waText, true);
      } else {
        // Not connected to Google yet: hand the details over on WhatsApp, IDs to be sent in the chat
        waText.push(`🪪 ID: ${f.id_type} ending ${f.id_last4} (I'll send the photo here)`, `🏠 ${f.address}, ${f.city}, ${f.state} ${f.pincode}`, `👥 ${f.members || 'No other guests'}`);
        if (f.advance_paid === 'Yes') waText.push(`💰 Advance ₹${f.advance_amount} by ${f.payment_mode} ${f.payment_ref}`);
        if (f.requests) waText.push(`📝 ${f.requests}`);
        done(f, r, waText, false);
      }
      if (typeof window.track === 'function') window.track('echeckin_submit', { booking_source: f.booking_source, villa: f.villa, nights: f.nights, adults: f.adults, connected: !!ENDPOINT });
    } catch (x) {
      err.textContent = 'Sorry, that did not go through. Please check your internet and try again, or send the details on WhatsApp.';
      btn.disabled = false; btn.textContent = 'Submit e-check-in';
    }
  });
  function done(f, r, waText, uploaded) {
    form.hidden = true;
    const box = document.getElementById('ci-done'); box.hidden = false;
    document.getElementById('ci-done-name').textContent = f.guest_name.split(' ')[0];
    document.getElementById('ci-done-ref').textContent = r;
    if (!uploaded) document.getElementById('ci-done-note').textContent = 'Last step: tap the button below to send these details to us on WhatsApp, then attach a photo of each adult\'s ID in the same chat.';
    const wa = document.getElementById('ci-done-wa');
    wa.href = 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(waText.join('\n'));
    wa.textContent = uploaded ? 'Tell us on WhatsApp (optional)' : 'Send on WhatsApp';
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // prefill from a link like checkin.html?villa=Rudrangan%20Suites&source=Booking.com&id=12345
  const p = new URLSearchParams(location.search);
  if (p.get('villa')) q('villa').value = p.get('villa');
  if (p.get('source')) [...q('booking_source').options].forEach(o => { if (o.text.toLowerCase().startsWith(p.get('source').toLowerCase())) q('booking_source').value = o.text; });
  if (p.get('id')) q('booking_id').value = p.get('id');
  applyShow(); syncDates(); go(0);
})();
