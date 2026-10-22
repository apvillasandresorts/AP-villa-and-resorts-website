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
    const st = q('payment_status').value;
    const paid = !!st && !st.startsWith('Pay on arrival');
    const on = { ota: isOta(), direct: isDirect(), foreign: isForeign(), paid, directpaid: isDirect() && paid };
    $$('[data-show]').forEach(el => {
      const show = on[el.dataset.show];
      el.hidden = !show;
      el.querySelectorAll('input, select').forEach(i => { i.disabled = !show; });
      if (el.matches('input, select')) el.disabled = !show;
    });
    q('booking_id').required = on.ota;
    ['amount_paid', 'payment_timing', 'payment_mode'].forEach(n => { q(n).required = on.paid; });
    q('payment_proof').required = on.directpaid;   // direct bookings: proof of payment is mandatory
    if (on.paid && isOta() && !q('payment_mode').value && st === 'Fully paid') q('payment_mode').value = q('payment_mode').options[1].value;
    balance();
    ['country', 'passport_no', 'visa_no', 'visa_expiry', 'passport_page', 'visa_page'].forEach(n => { q(n).required = on.foreign; });
  }
  form.addEventListener('change', e => { if (['booking_source', 'nationality', 'payment_status'].includes(e.target.name)) applyShow(); });
  // balance due = total − paid (shown live; also saved)
  function balance() {
    const total = +q('total_amount').value || 0, paid = q('amount_paid').disabled ? 0 : (+q('amount_paid').value || 0);
    const el = document.getElementById('ci-balance'); const inr = n => '₹' + n.toLocaleString('en-IN');
    if (!total && !paid) { el.textContent = ''; return ''; }
    if (!total) { el.innerHTML = `Paid so far: <b>${inr(paid)}</b>`; return ''; }
    const due = Math.max(0, total - paid);
    el.innerHTML = due ? `Paid ${inr(paid)} of ${inr(total)} · Balance due: <b>${inr(due)}</b>` : `Fully paid: <b>${inr(total)}</b>`;
    return String(due);
  }
  form.addEventListener('input', e => { if (e.target.name === 'total_amount' || e.target.name === 'amount_paid') balance(); });

  // ---- other members: one row per extra person ----
  const membersBox = document.getElementById('ci-members');
  function renderMembers() {
    const adults = Math.max(1, +q('adults').value || 1), kids = Math.max(0, +q('children').value || 0);
    const total = adults + kids - 1;
    const old = $$('.ci-member').map(r => ({ name: r.querySelector('[data-k="name"]').value, age: r.querySelector('[data-k="age"]').value, gender: r.querySelector('[data-k="gender"]').value, relation: r.querySelector('[data-k="relation"]').value }));
    document.getElementById('ci-members-count').textContent = total > 0 ? `(${total} more)` : '(none)';
    membersBox.innerHTML = Array.from({ length: Math.min(total, 39) }, (_, i) => {
      const o = old[i] || {}, kid = i >= adults - 1;
      const esc = v => (v || '').replace(/"/g, '&quot;'), n = i + 2;
      return `<div class="ci-member"><div class="ci-member__head"><span class="ci-member__n">${n}</span>Guest ${n} <small>${kid ? 'child' : 'adult'}</small></div>
        <label class="ci-m-name"><span class="ci-l">Full name <b>*</b></span><input data-k="name" type="text" maxlength="80" placeholder="As on ID" value="${esc(o.name)}" required aria-label="Guest ${n} name"></label>
        <label class="ci-m-age"><span class="ci-l">Age <b>*</b></span><span class="ci-age"><input data-k="age" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" placeholder="${kid ? 'e.g. 8' : 'e.g. 32'}" value="${esc(o.age)}" required data-age="any" aria-label="Guest ${n} age"><i aria-hidden="true">yrs</i></span><small class="ci-fieldmsg" aria-live="polite"></small></label>
        <label class="ci-m-gender"><span class="ci-l">Gender <b>*</b></span><select data-k="gender" required aria-label="Guest ${n} gender"><option value="">Choose</option>${['Male', 'Female', 'Other'].map(g => `<option${o.gender === g ? ' selected' : ''}>${g}</option>`).join('')}</select></label>
        <label class="ci-m-rel"><span class="ci-l">Relation <small>(optional)</small></span><input data-k="relation" type="text" maxlength="30" placeholder="e.g. wife, son, mother" value="${esc(o.relation)}" aria-label="Guest ${n} relation"></label></div>`;
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

  // ---- age: accept Hindi/Indian-script digits, "25 yrs", "1.5" (a plain number box silently dropped these and the guest got stuck) ----
  const ZEROS = [0x660, 0x6F0, 0x966, 0x9E6, 0xA66, 0xAE6, 0xB66, 0xBE6, 0xC66, 0xCE6, 0xD66, 0xFF10];
  const toAscii = str => str.replace(/[^\x00-\x7F]/g, ch => { const c = ch.codePointAt(0), z = ZEROS.find(z => c >= z && c <= z + 9); return z !== undefined ? String(c - z) : ch; });
  const readAge = el => (toAscii(el.value).replace(/,/g, '.').match(/\d+(\.\d+)?/) || [''])[0];
  function checkAge(el) {   // returns an error message, or '' when fine (and writes the clean number back)
    const a = readAge(el), n = parseFloat(a), adult = el.dataset.age === 'adult';
    if (!a) return el.value.trim() ? 'Please type the age in numbers, e.g. 35.' : '';
    el.value = a;
    if (n > 110) return 'Please check the age: it looks too high.';
    if (adult && n < 18) return 'The main guest must be 18 or older. If you are under 18, please ask an adult in your group to fill in this form as the main guest.';
    return '';
  }
  const ageMsgEl = el => el.closest('label')?.querySelector('.ci-fieldmsg');
  form.addEventListener('input', e => {
    const el = e.target; if (!el.dataset || !el.dataset.age) return;
    const clean = toAscii(el.value);
    if (clean !== el.value) el.value = clean;   // Hindi / other-script digits become 0-9 as you type
    el.classList.remove('is-bad'); const m = ageMsgEl(el); if (m) m.textContent = '';
  });
  form.addEventListener('focusout', e => {
    const el = e.target; if (!el.dataset || !el.dataset.age || !el.value.trim()) return;
    const msg = checkAge(el), m = ageMsgEl(el);
    el.classList.toggle('is-bad', !!msg); if (m) m.textContent = msg;
  });
  function validate(i) {
    err.textContent = '';
    const fields = [...steps[i].querySelectorAll('input, select, textarea')].filter(el => !el.disabled && el.type !== 'hidden' && !el.classList.contains('ci-hp'));
    for (const el of fields) {
      el.classList.remove('is-bad');
      if ((el.type === 'tel' || el.inputMode === 'numeric') && !el.dataset.age && /[^\x00-\x7F]/.test(el.value)) el.value = toAscii(el.value);   // Hindi digits in phone / PIN
      let ok = el.checkValidity(), ageMsg = '';
      if (el.dataset.age && el.value.trim()) { ageMsg = checkAge(el); ok = !ageMsg; }
      if (ok && el.name === 'phone') ok = /^\+?\d[\d\s-]{8,14}$/.test(el.value.trim());
      if (ok && el.name === 'id_last4') ok = /^[A-Za-z0-9]{4}$/.test(el.value.trim());
      if (!ok) {
        el.classList.add('is-bad'); el.focus({ preventScroll: true });
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        const label = (el.getAttribute('aria-label') || el.closest('label')?.querySelector('.ci-l')?.textContent || el.closest('label')?.childNodes[0]?.textContent || el.placeholder || 'This field').trim().replace(/\s*\*$/, '');
        if (el.dataset.age) { const m = ageMsgEl(el); if (m) m.textContent = ageMsg || (el.value.trim() ? 'Please type the age in numbers, e.g. 35.' : 'Please enter the age in years.'); }
        err.textContent = ageMsg ? (el.dataset.age === 'any' ? `${label}: ${ageMsg}` : ageMsg) : el.name === 'phone' ? 'Please enter a valid mobile number.' : el.value && el.type !== 'file' && el.type !== 'checkbox' && el.tagName !== 'SELECT' ? `Please check: ${label}.` : el.type === 'checkbox' ? 'Please tick the required declarations.' : el.name === 'phone' ? 'Please enter a valid mobile number.' : el.type === 'file' ? `Please upload: ${label}.` : `Please fill: ${label}.`;
        return false;
      }
    }
    if (i === 0 && syncDates() <= 0) { err.textContent = 'Check-out must be after check-in.'; return false; }
    return true;
  }
  function go(i, quiet) {
    step = i;
    steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
    dots.forEach((d, k) => { d.classList.toggle('is-active', k === i); d.classList.toggle('is-done', k < i); });
    document.getElementById('ci-back').hidden = i === 0;
    document.getElementById('ci-next').hidden = i === steps.length - 1;
    document.getElementById('ci-submit').hidden = i !== steps.length - 1;
    const names = dots.map(d => d.textContent.replace(/^\s*\d+\s*/, '').trim());
    document.getElementById('ci-progress').textContent = `Step ${i + 1} of ${steps.length}${names[i] ? ' · ' + names[i] : ''}`;
    err.textContent = '';
    if (i === 1) renderMembers();
    if (!quiet) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  document.getElementById('ci-next').addEventListener('click', () => { if (validate(step)) { go(step + 1); saveDraft(); } });
  form.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
    e.preventDefault();
    const fields = [...steps[step].querySelectorAll('input, select, textarea')].filter(el => !el.disabled && el.type !== 'hidden' && el.type !== 'file' && el.type !== 'checkbox' && !el.classList.contains('ci-hp') && el.offsetParent);
    const nextEl = fields[fields.indexOf(e.target) + 1];
    if (nextEl) nextEl.focus();
    else { e.target.blur(); document.getElementById(step === steps.length - 1 ? 'ci-submit' : 'ci-next').click(); }
  });
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
      payment_status: v('payment_status'), total_amount: v('total_amount'), amount_paid: v('amount_paid'), balance_due: balance(),
      payment_timing: v('payment_timing'), payment_mode: v('payment_mode'), payment_ref: v('payment_ref'), payment_date: v('payment_date'),
      payment_proof: q('payment_proof').disabled ? '' : (q('payment_proof').files.length ? q('payment_proof').files.length + ' file(s) uploaded' : ''),
      booking_voucher: q('booking_voucher').disabled ? '' : (q('booking_voucher').files.length ? q('booking_voucher').files.length + ' file(s) uploaded' : ''),
      purpose: v('purpose'), heard_from: v('heard_from'), first_visit: v('first_visit'), requests: v('requests'),
      consent_data: q('consent_data').checked ? 'Yes' : 'No', consent_offers: q('consent_offers').checked ? 'Yes' : 'No', consent_email: q('consent_email').checked ? 'Yes' : 'No', signature: v('signature'),
    };
    return fields;
  }
  const ref = () => { const d = new Date(), A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return 'ECI-' + iso(d).slice(2).replace(/-/g, '') + '-' + Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); };
  const nice = s => s ? new Date(s + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  // ---- submit ----
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (step < steps.length - 1) { if (validate(step)) go(step + 1); return; }   // never submit from an earlier step
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
        await add('payment_proof', 'Payment-screenshot'); await add('booking_voucher', 'Booking-voucher');
        btn.textContent = 'Sending securely…';
        const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ref: r, submitted_at: new Date().toISOString(), page: location.href, fields: f, files, website: '' }) });
        const out = await res.json().catch(() => ({}));
        if (!out.ok) throw new Error(out.error || 'Upload failed');
        done(f, r, waText, true);
      } else {
        // Not connected to Google yet: hand the details over on WhatsApp, IDs to be sent in the chat
        waText.push(`🪪 ID: ${f.id_type} ending ${f.id_last4} (I'll send the photo here)`, `🏠 ${f.address}, ${f.city}, ${f.state} ${f.pincode}`, `👥 ${f.members || 'No other guests'}`);
        if (f.booking_source.startsWith('Direct') && f.amount_paid) waText.push('🧾 I will attach the payment screenshot here.');
        waText.push(`💰 ${f.payment_status}${f.amount_paid ? ` · paid ₹${f.amount_paid}` : ''}${f.total_amount ? ` of ₹${f.total_amount}` : ''}${f.balance_due ? ` · balance ₹${f.balance_due}` : ''}${f.payment_timing ? ` · ${f.payment_timing}` : ''}${f.payment_mode ? ` · ${f.payment_mode}` : ''}${f.payment_ref ? ' ' + f.payment_ref : ''}`);
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
    form.hidden = true; clearDraft();
    const box = document.getElementById('ci-done'); box.hidden = false;
    document.getElementById('ci-done-name').textContent = f.guest_name.split(' ')[0];
    document.getElementById('ci-done-ref').textContent = r;
    if (!uploaded) document.getElementById('ci-done-note').textContent = 'Last step: tap the button below to send these details to us on WhatsApp, then attach a photo of each adult\'s ID in the same chat.';
    const wa = document.getElementById('ci-done-wa');
    wa.href = 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(waText.join('\n'));
    wa.textContent = uploaded ? 'Tell us on WhatsApp (optional)' : 'Send on WhatsApp';
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ---- draft: keep what the guest typed if the page reloads (phones often reload the tab after taking an ID photo) ----
  const DRAFT = 'ap-echeckin-draft';
  function saveDraft() {
    try {
      const d = { step, at: Date.now(), f: {}, m: $$('.ci-member').map(r => ['name', 'age', 'gender', 'relation'].map(k => r.querySelector(`[data-k="${k}"]`).value)) };
      for (const el of form.elements) if (el.name && el.type !== 'file' && el.name !== 'website') d.f[el.name] = el.type === 'checkbox' ? el.checked : el.value;
      localStorage.setItem(DRAFT, JSON.stringify(d));
    } catch (x) {}
  }
  let saveT; form.addEventListener('input', () => { clearTimeout(saveT); saveT = setTimeout(saveDraft, 600); });
  form.addEventListener('change', () => { clearTimeout(saveT); saveT = setTimeout(saveDraft, 300); });
  function restoreDraft() {
    let d; try { d = JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch (x) { return; }
    if (!d || Date.now() - d.at > 3 * 864e5) return;
    for (const [n, v] of Object.entries(d.f || {})) { const el = q(n); if (!el || el.type === 'file' || el instanceof RadioNodeList) continue; if (el.type === 'checkbox') el.checked = !!v; else el.value = v; }
    applyShow(); syncDates(); renderMembers();
    $$('.ci-member').forEach((r, i) => (d.m || [])[i] && ['name', 'age', 'gender', 'relation'].forEach((k, j) => { r.querySelector(`[data-k="${k}"]`).value = d.m[i][j]; }));
    const note = document.getElementById('ci-draft'); note.hidden = false; form.insertBefore(note, form.firstElementChild);
    note.innerHTML = 'We kept what you had typed on this phone. ID photos need to be chosen again. <button type="button" id="ci-clear">Start over</button>';
    document.getElementById('ci-clear').onclick = () => { try { localStorage.removeItem(DRAFT); } catch (x) {} location.reload(); };
    return Math.min(d.step || 0, steps.length - 1);
  }
  const clearDraft = () => { try { localStorage.removeItem(DRAFT); } catch (x) {} };

  // prefill from a link like checkin.html?villa=Rudrangan%20Suites&source=Booking.com&id=12345
  const p = new URLSearchParams(location.search);
  if (p.get('villa')) q('villa').value = p.get('villa');
  if (p.get('source')) [...q('booking_source').options].forEach(o => { if (o.text.toLowerCase().startsWith(p.get('source').toLowerCase())) q('booking_source').value = o.text; });
  if (p.get('id')) q('booking_id').value = p.get('id');
  applyShow(); syncDates();
  const back = p.toString() ? 0 : restoreDraft();   // a booking link starts fresh
  go(back || 0, true);
})();
