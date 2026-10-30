/**
 * AP Villas Founder OS · People & HR and CRM (back end: docs/founder-os/FoPeople.gs).
 * People & HR: team (caretakers, sweepers, remote interns, any role), salary terms and payments (each payment also books the expense),
 * pay status this month, reviews and feedback, emails and WhatsApp to staff.
 * CRM: one log of every email and WhatsApp message, guest profiles built from bookings, leads with stages and follow-ups, tasks, templates.
 * WhatsApp opens on the owner's phone (wa.me) with the message filled in; it is logged when opened (nothing is sent automatically).
 */
(function () {
  'use strict';
  var U = window.FoUI, S = U.S, M = U.M;
  var esc = U.esc, $ = U.$, $$ = U.$$, inr = U.inr, dmy = U.dmy, dm = U.dm, when = U.when, toast = U.toast, sel = U.sel, num = M.num;
  var ROLES = [['caretaker', 'Caretaker'], ['sweeper', 'Sweeper / housekeeping'], ['intern', 'Intern'], ['manager', 'Manager'], ['cook', 'Cook'], ['driver', 'Driver'], ['security', 'Security'], ['other', 'Other']];
  var CYCLES = [['monthly', 'Monthly'], ['weekly', 'Weekly'], ['daily', 'Daily wage'], ['stipend', 'Stipend (monthly)'], ['per-task', 'Per task']];
  var STAGES = [['new', 'New'], ['contacted', 'Contacted'], ['quoted', 'Quoted'], ['won', 'Booked'], ['lost', 'Lost']];
  function D() { return S.data; }
  function today() { return U.today(); }
  function month() { return today().slice(0, 7); }
  function card(title, sub, body, tools) { return '<div class="fo-card"><h3>' + esc(title) + (sub ? ' <small>' + esc(sub) + '</small>' : '') + (tools ? '<span class="fo-card__tools">' + tools + '</span>' : '') + '</h3>' + body + '</div>'; }
  function kpi(label, value, note) { return '<div class="fo-card"><div class="fo-kpi__label">' + esc(label) + '</div><div class="fo-kpi__value">' + value + '</div>' + (note ? '<div class="fo-kpi__cmp"><span class="flat">' + note + '</span></div>' : '') + '</div>'; }
  function table(head, rows, empty, numCols) {
    numCols = numCols || [];
    if (!rows.length) return '<div class="fo-empty">' + esc(empty || 'Nothing yet.') + '</div>';
    return '<div class="fo-tablewrap"><table class="fo-table"><thead><tr>' + head.map(function (h, i) { return '<th' + (numCols.indexOf(i) >= 0 ? ' class="num"' : '') + '>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return '<td' + (numCols.indexOf(i) >= 0 ? ' class="num"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  function founder() { return S.user && S.user.role === 'founder'; }
  function editor() { return S.user && (S.user.role === 'founder' || S.user.role === 'manager'); }
  function save(action, body, msg) { return U.api(action, body).then(function (j) { if (!j.ok) { toast(j.error, true); return j; } if (msg) toast(msg); return U.load(true).then(function () { return j; }); }); }
  function head(title, sub) { return '<div class="fo-drawer__head"><div><h2 class="serif" style="font-size:24px">' + esc(title) + '</h2>' + (sub ? '<div class="fo-hint">' + sub + '</div>' : '') + '</div><button class="fo-iconbtn" data-close aria-label="Close">' + U.icon('x') + '</button></div>'; }
  function field(label, html, full) { return '<label class="fo-field' + (full ? ' full' : '') + '">' + esc(label) + html + '</label>'; }
  function input(id, v, type, extra) { return '<input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(v == null ? '' : v) + '"' + (extra || '') + '>'; }
  function val(p, id) { var e = $('#' + id, p); return e ? (e.type === 'checkbox' ? e.checked : e.value) : ''; }
  function propOpts(withAll) { return (withAll ? [['all', 'All villas / shared']] : []).concat((D().properties || []).map(function (p) { return [p.property_id, p.name]; })); }
  function waNum(phone) { var d = String(phone || '').replace(/\D/g, ''); if (d.length === 10) d = '91' + d; return d.length >= 11 ? d : ''; }
  function fill(t, ctx) { return String(t || '').replace(/\{(\w+)\}/g, function (m, k) { return ctx[k] != null && ctx[k] !== '' ? ctx[k] : m; }); }
  function first(name) { return String(name || '').trim().split(/\s+/)[0] || 'ji'; }
  function badge(t, cls) { return '<span class="fo-badge' + (cls ? ' ' + cls : '') + '">' + esc(t) + '</span>'; }
  function roleName(r) { var x = ROLES.filter(function (k) { return k[0] === r; })[0]; return x ? x[1] : r; }
  function ago2(ts) { return U.ago ? U.ago(ts) : when(ts); }

  // ============================================================ messaging (shared by HR and CRM) ============================================================
  /**
   * Compose to one or more people: email (sent and logged by the server) or WhatsApp (opens wa.me per person, logged when opened).
   * people: [{ name, email, phone, contact_type, contact_id, ctx }]
   */
  function compose(people, opts) {
    opts = opts || {};
    var tpls = (D().crm_templates || []).filter(function (t) { return !opts.audience || t.audience === 'any' || t.audience === opts.audience; });
    var p = U.drawer(head('Message ' + (people.length === 1 ? people[0].name : people.length + ' people'), people.map(function (x) { return esc(x.name) + (x.email ? ' · ' + esc(x.email) : '') + (x.phone ? ' · ' + esc(x.phone) : ''); }).join('<br>')) +
      '<div class="fo-toolbar">' + sel('cm-ch', [['whatsapp', 'WhatsApp'], ['email', 'Email']], opts.channel || 'whatsapp') + sel('cm-tpl', [['', 'No template']].concat(tpls.map(function (t) { return [t.template_id, t.name + ' (' + t.channel + ')']; })), '') + '</div>' +
      '<div class="fo-form">' + field('Subject (email)', input('cm-s', opts.subject || ''), true) + field('Message · {name} becomes each first name', '<textarea id="cm-b" rows="7">' + esc(opts.body || '') + '</textarea>', true) + '</div>' +
      '<div class="fo-toolbar"><button class="btn btn--primary" id="cm-go">Send</button><span class="fo-hint" id="cm-note"></span></div><div id="cm-wa"></div>');
    function note() { var ch = val(p, 'cm-ch'); $('#cm-note', p).textContent = ch === 'email' ? people.filter(function (x) { return x.email; }).length + ' of ' + people.length + ' have an email address. Sent from your Google account and logged in the CRM.' : 'Opens WhatsApp on this device with the message filled in, one person at a time. Logged in the CRM.'; }
    note(); $('#cm-ch', p).onchange = note;
    $('#cm-tpl', p).onchange = function () { var t = tpls.filter(function (x) { return x.template_id === this.value; }.bind(this))[0]; if (!t) return; $('#cm-ch', p).value = t.channel; $('#cm-s', p).value = t.subject || ''; $('#cm-b', p).value = t.body || ''; note(); };
    $('#cm-go', p).onclick = function () {
      var ch = val(p, 'cm-ch'), subject = val(p, 'cm-s'), body = val(p, 'cm-b'), tpl = val(p, 'cm-tpl');
      if (!body.trim()) return toast('Write the message.', true);
      if (ch === 'email') {
        var to = people.filter(function (x) { return x.email; }).map(function (x) { return { email: x.email, name: x.name, contact_type: x.contact_type, contact_id: x.contact_id }; });
        if (!to.length) return toast('Nobody here has an email address.', true);
        if (!subject.trim()) return toast('Write a subject.', true);
        this.disabled = true;
        save('f.crm.email', { to: to, subject: subject, body: body, template: tpl, related: opts.related || '' }).then(function (j) { if (j.ok) { toast('Sent ' + j.result.sent + ' email' + (j.result.sent === 1 ? '' : 's')); p.parentNode.remove(); } });
        return;
      }
      var box = $('#cm-wa', p), list = people.filter(function (x) { return waNum(x.phone); });
      if (!list.length) return toast('Nobody here has a mobile number.', true);
      box.innerHTML = '<p class="fo-hint">Tap each name to open WhatsApp with the message ready.</p><div class="dk-ladder">' + list.map(function (x, i) { return '<a class="btn btn--sm" target="_blank" rel="noopener" data-i="' + i + '" href="https://wa.me/' + waNum(x.phone) + '?text=' + encodeURIComponent(fill(body, Object.assign({ name: first(x.name) }, x.ctx || {}))) + '">' + esc(x.name) + '</a>'; }).join('') + '</div>';
      $$('[data-i]', box).forEach(function (a) { a.addEventListener('click', function () {
        var x = list[Number(a.dataset.i)]; a.classList.add('btn--primary');
        U.api('f.crm.log', { message: { channel: 'whatsapp', contact_type: x.contact_type, contact_id: x.contact_id, name: x.name, to: x.phone, body: fill(body, Object.assign({ name: first(x.name) }, x.ctx || {})), status: 'opened', template: tpl, related: opts.related || '' } });
      }); });
      if (list.length === 1) box.querySelector('a').click();
    };
  }

  // ============================================================ People & HR ============================================================
  function payStatus(e, pays) {
    if (e.status !== 'active') return { label: 'left', cls: 'fo-badge--muted' };
    if (!num(e.salary_amount) || ['per-task', 'daily'].indexOf(e.salary_cycle) >= 0) return { label: '—', cls: 'fo-badge--muted' };
    var paid = pays.filter(function (x) { return x.emp_id === e.emp_id && x.period === month() && ['salary', 'stipend'].indexOf(x.kind || 'salary') >= 0; }).reduce(function (a, x) { return a + num(x.amount); }, 0);
    if (paid >= num(e.salary_amount)) return { label: 'paid', cls: '' };
    var dueDay = num(e.pay_day) || 1, due = Number(today().slice(8, 10)) >= dueDay;
    return paid > 0 ? { label: 'part paid ' + inr(paid), cls: 'fo-badge--gold' } : due ? { label: 'due', cls: 'fo-badge--bad' } : { label: 'due ' + dueDay + dmy(today()).replace(/^\d+/, ''), cls: 'fo-badge--muted' };
  }
  function monthlyCost(e) { var a = num(e.salary_amount); return e.status !== 'active' ? 0 : e.salary_cycle === 'weekly' ? a * 52 / 12 : e.salary_cycle === 'daily' ? a * 26 : e.salary_cycle === 'per-task' ? 0 : a; }
  function viewHr(page) {
    var T = U.tabs('hr', [['team', 'Team'], ['salary', 'Salary'], ['reviews', 'Reviews & feedback'], ['messages', 'Messages']]);
    page.innerHTML = U.hello('People & HR', 'Your caretakers, housekeeping, remote interns and everyone else: pay, reviews and messages in one place. Salary payments are booked in Finance automatically.') + T.html + '<div id="hr"></div>';
    U.wireTabs(page, 'hr');
    ({ team: hrTeam, salary: hrSalary, reviews: hrReviews, messages: hrMessages }[T.cur] || hrTeam)($('#hr'));
  }
  function emps() { return (D().employees || []).slice().sort(function (a, b) { return (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || String(a.name).localeCompare(b.name); }); }
  function hrTeam(body) {
    var list = emps(), pays = D().salary_payments || [], act = list.filter(function (e) { return e.status === 'active'; });
    var payroll = act.reduce(function (a, e) { return a + monthlyCost(e); }, 0), paidM = pays.filter(function (x) { return x.period === month(); }).reduce(function (a, x) { return a + num(x.amount); }, 0);
    var due = act.filter(function (e) { return payStatus(e, pays).label === 'due'; });
    var byRole = {}; act.forEach(function (e) { byRole[e.role] = (byRole[e.role] || 0) + 1; });
    body.innerHTML = '<div class="fo-grid fo-grid--kpi">' + kpi('Active team', String(act.length), Object.keys(byRole).map(function (r) { return byRole[r] + ' ' + roleName(r).toLowerCase(); }).join(' · ') || 'add your first person') +
      kpi('Monthly payroll', inr(payroll), 'from salary terms (daily wage × 26 days)') + kpi('Paid this month', inr(paidM), dmy(month() + '-01').replace(/^\d+ /, '')) + kpi('Salary due now', String(due.length), due.map(function (e) { return e.name; }).join(', ') || 'nobody') + '</div>' +
      '<div class="fo-toolbar" style="margin-top:14px">' + (editor() ? '<button class="btn btn--primary" id="hr-add">+ Add person</button>' : '') + (due.length && editor() ? '<button class="btn" id="hr-paydue">Record pay for everyone due</button>' : '') + '<button class="btn" id="hr-msgall">Message the team</button><button class="btn" id="hr-csv">Export CSV</button></div>' +
      table(['Name', 'Role', 'Works', 'Villa', 'Contact', 'Salary', 'This month', ''], list.map(function (e) {
        var st = payStatus(e, pays), wa = waNum(e.phone);
        return ['<a href="#" data-emp="' + esc(e.emp_id) + '"><b>' + esc(e.name) + '</b></a>' + (e.role_title ? '<br><small class="fo-hint">' + esc(e.role_title) + '</small>' : ''), esc(roleName(e.role)), e.work_mode === 'remote' ? badge('remote', 'fo-badge--gold') : 'on-site',
          esc(String(e.property_ids || 'all').split(',').map(function (id) { return id === 'all' ? 'All' : U.propName(id); }).join(', ')),
          (e.phone ? esc(e.phone) + (wa ? ' <a href="https://wa.me/' + wa + '" target="_blank" rel="noopener" title="WhatsApp">💬</a>' : '') : '') + (e.email ? '<br><small>' + esc(e.email) + '</small>' : ''),
          e.salary_amount !== '' ? inr(num(e.salary_amount)) + ' <small class="fo-hint">' + esc((CYCLES.filter(function (c) { return c[0] === e.salary_cycle; })[0] || ['', e.salary_cycle])[1].toLowerCase()) + '</small>' : '—',
          badge(st.label, st.cls), editor() && e.status === 'active' ? '<button class="btn btn--sm" data-pay="' + esc(e.emp_id) + '">Pay</button>' : ''];
      }), 'No team members yet. Add your caretakers, housekeeping staff and interns.', [5]);
    var a = $('#hr-add'); if (a) a.onclick = function () { empDrawer(null); };
    var pd = $('#hr-paydue'); if (pd) pd.onclick = function () { payDrawer(due); };
    $('#hr-msgall').onclick = function () { compose(act.map(function (e) { return { name: e.name, email: e.email, phone: e.phone, contact_type: 'employee', contact_id: e.emp_id }; }), { audience: 'employee' }); };
    $('#hr-csv').onclick = function () { U.csvDownload('ap-villas-team-' + today(), ['name', 'role', 'work_mode', 'villas', 'phone', 'email', 'joined', 'salary', 'cycle', 'pay_day', 'status', 'this_month'], list.map(function (e) { return [e.name, e.role, e.work_mode, e.property_ids, e.phone, e.email, e.joined, e.salary_amount, e.salary_cycle, e.pay_day, e.status, payStatus(e, pays).label]; })); };
    $$('[data-emp]', body).forEach(function (x) { x.onclick = function (ev) { ev.preventDefault(); empProfile(x.dataset.emp); }; });
    $$('[data-pay]', body).forEach(function (x) { x.onclick = function () { payDrawer(list.filter(function (e) { return e.emp_id === x.dataset.pay; })); }; });
  }
  function empDrawer(e) {
    e = e || { role: 'caretaker', work_mode: 'on-site', salary_cycle: 'monthly', status: 'active', property_ids: 'all', joined: today() };
    var p = U.drawer(head(e.emp_id ? 'Edit ' + e.name : 'Add a person') + '<div class="fo-form">' +
      field('Full name', input('em-n', e.name)) + field('Role', sel('em-r', ROLES, e.role)) + field('Job title (optional)', input('em-t', e.role_title, 'text', ' placeholder="e.g. Head caretaker, Social media intern"')) +
      field('Works', sel('em-w', [['on-site', 'On site'], ['remote', 'Remotely (online)']], e.work_mode)) + field('Villa', sel('em-p', propOpts(true), String(e.property_ids || 'all').split(',')[0])) +
      field('Mobile (WhatsApp)', input('em-ph', e.phone, 'tel')) + field('Email', input('em-e', e.email, 'email')) + field('Joined on', input('em-j', e.joined, 'date')) +
      field('Pay', input('em-s', e.salary_amount, 'number', ' min="0" step="100"')) + field('Paid', sel('em-c', CYCLES, e.salary_cycle)) + field('Pay day of the month', input('em-d', e.pay_day, 'number', ' min="1" max="31"')) +
      field('Status', sel('em-st', [['active', 'Working'], ['left', 'Has left']], e.status)) + field('Notes', '<textarea id="em-no" rows="2">' + esc(e.notes || '') + '</textarea>', true) + '</div>' +
      '<div class="fo-toolbar"><button class="btn btn--primary" id="em-go">Save</button>' + (e.emp_id && founder() ? '<button class="btn btn--danger" id="em-del">Delete</button>' : '') + '</div>');
    $('#em-go', p).onclick = function () {
      save('f.hr.emp.save', { employee: { emp_id: e.emp_id || '', name: val(p, 'em-n'), role: val(p, 'em-r'), role_title: val(p, 'em-t'), work_mode: val(p, 'em-w'), property_ids: val(p, 'em-p'), phone: val(p, 'em-ph'), email: val(p, 'em-e'), joined: val(p, 'em-j'),
        salary_amount: val(p, 'em-s'), salary_cycle: val(p, 'em-c'), pay_day: val(p, 'em-d'), status: val(p, 'em-st'), notes: val(p, 'em-no') } }, 'Saved').then(function (j) { if (j.ok) p.parentNode.remove(); });
    };
    var d = $('#em-del', p); if (d) d.onclick = function () {
      var why = prompt('Delete ' + e.name + '? Their salary payments and reviews stay in the records. Reason (optional):', ''); if (why === null) return;
      save('f.hr.emp.delete', { emp_id: e.emp_id, reason: why }, 'Deleted').then(function (j) { if (j.ok) p.parentNode.remove(); });
    };
  }
  function empProfile(id) {
    var e = (D().employees || []).filter(function (x) { return x.emp_id === id; })[0]; if (!e) return;
    var pays = (D().salary_payments || []).filter(function (x) { return x.emp_id === id; }).sort(function (a, b) { return a.paid_on < b.paid_on ? 1 : -1; });
    var revs = (D().employee_reviews || []).filter(function (x) { return x.emp_id === id; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var msgs = (D().crm_messages || []).filter(function (x) { return x.contact_type === 'employee' && x.contact_id === id; }).slice(-15).reverse();
    var rating = revs.filter(function (r) { return r.rating !== ''; }), avg = rating.length ? rating.reduce(function (a, r) { return a + num(r.rating); }, 0) / rating.length : null;
    var p = U.drawer(head(e.name, esc(roleName(e.role)) + (e.role_title ? ' · ' + esc(e.role_title) : '') + ' · ' + (e.work_mode === 'remote' ? 'remote' : 'on site') + (e.joined ? ' · since ' + dmy(e.joined) : '') + (avg ? ' · ★ ' + avg.toFixed(1) : '')) +
      '<div class="fo-toolbar">' + (editor() ? '<button class="btn btn--primary" id="ep-pay">Record payment</button><button class="btn" id="ep-rev">Add feedback</button><button class="btn" id="ep-edit">Edit</button>' : '') + '<button class="btn" id="ep-msg">Message</button></div>' +
      U.kv('Pay', e.salary_amount !== '' ? inr(num(e.salary_amount)) + ' · ' + esc(e.salary_cycle) + (e.pay_day ? ' · day ' + esc(e.pay_day) : '') : 'not set') + U.kv('Contact', esc([e.phone, e.email].filter(Boolean).join(' · ') || '—')) + (e.notes ? U.kv('Notes', esc(e.notes)) : '') +
      '<h3 style="margin:16px 0 8px">Payments <small class="fo-hint">total ' + inr(pays.reduce(function (a, x) { return a + num(x.amount); }, 0)) + '</small></h3>' +
      table(['Paid on', 'For', 'Kind', 'Amount', 'Mode', ''], pays.map(function (x) { return [dmy(x.paid_on), esc(x.period), esc(x.kind || 'salary'), inr(num(x.amount)), esc(x.mode) + (x.ref ? ' <small>' + esc(x.ref) + '</small>' : ''), founder() ? '<button class="btn btn--sm btn--danger" data-delpay="' + esc(x.pay_id) + '">Delete</button>' : '']; }), 'No payments recorded yet.', [3]) +
      '<h3 style="margin:16px 0 8px">Reviews & feedback</h3>' + table(['Date', 'Kind', 'Rating', 'Note'], revs.map(function (r) { return [dmy(r.date), esc(r.kind), r.rating !== '' ? '★'.repeat(num(r.rating)) : '—', esc(r.note)]; }), 'No feedback yet.') +
      '<h3 style="margin:16px 0 8px">Messages</h3>' + table(['When', 'Channel', 'Message'], msgs.map(function (m) { return [when(m.at), esc(m.channel), esc((m.subject ? m.subject + ' · ' : '') + String(m.body).slice(0, 120))]; }), 'No messages yet.'));
    function close() { p.parentNode.remove(); }
    if (editor()) {
      $('#ep-pay', p).onclick = function () { close(); payDrawer([e]); };
      $('#ep-rev', p).onclick = function () { close(); reviewDrawer(e); };
      $('#ep-edit', p).onclick = function () { close(); empDrawer(e); };
    }
    $('#ep-msg', p).onclick = function () { close(); compose([{ name: e.name, email: e.email, phone: e.phone, contact_type: 'employee', contact_id: e.emp_id }], { audience: 'employee' }); };
    $$('[data-delpay]', p).forEach(function (b) { b.onclick = function () { if (!confirm('Delete this payment? Its expense entry in Finance is removed too.')) return; save('f.hr.pay.delete', { pay_id: b.dataset.delpay }, 'Payment deleted').then(function (j) { if (j.ok) close(); }); }; });
  }
  function payDrawer(people) {
    var p = U.drawer(head(people.length === 1 ? 'Pay ' + people[0].name : 'Record pay for ' + people.length + ' people', 'Each payment is also booked in Finance as an expense (Staff & caretakers).') +
      '<div class="fo-form">' + field('Date paid', input('py-d', today(), 'date')) + field('For month', input('py-m', month(), 'month')) + field('Kind', sel('py-k', [['salary', 'Salary'], ['stipend', 'Stipend'], ['advance', 'Advance'], ['bonus', 'Bonus'], ['deduction', 'Deduction']], people[0].salary_cycle === 'stipend' ? 'stipend' : 'salary')) +
      field('Paid by', sel('py-mo', [['upi', 'UPI'], ['cash', 'Cash'], ['bank', 'Bank transfer'], ['other', 'Other']], 'upi')) + '</div>' +
      table(['Person', 'Amount ₹', 'Reference'], people.map(function (e, i) { return [esc(e.name), '<input type="number" min="0" step="100" data-amt="' + i + '" value="' + esc(e.salary_amount) + '" style="width:110px">', '<input data-ref="' + i + '" placeholder="UPI ref (optional)" style="width:160px">']; }), '') +
      '<div class="fo-toolbar"><button class="btn btn--primary" id="py-go">Save payment' + (people.length > 1 ? 's' : '') + '</button></div>');
    $('#py-go', p).onclick = function () {
      var btn = this; btn.disabled = true;
      var jobs = people.map(function (e, i) { return { emp_id: e.emp_id, amount: $('[data-amt="' + i + '"]', p).value, ref: $('[data-ref="' + i + '"]', p).value, paid_on: val(p, 'py-d'), period: val(p, 'py-m'), kind: val(p, 'py-k'), mode: val(p, 'py-mo') }; }).filter(function (x) { return num(x.amount) > 0; });
      var chain = Promise.resolve(), ok = 0;
      jobs.forEach(function (x) { chain = chain.then(function () { return U.api('f.hr.pay.save', { payment: x }).then(function (j) { if (j.ok) ok++; else toast(j.error, true); }); }); });
      chain.then(function () { toast(ok + ' payment' + (ok === 1 ? '' : 's') + ' saved and booked in Finance'); p.parentNode.remove(); U.load(true); });
    };
  }
  function reviewDrawer(e) {
    var p = U.drawer(head('Feedback for ' + e.name) + '<div class="fo-form">' + field('Date', input('rv-d', today(), 'date')) + field('Kind', sel('rv-k', [['feedback', 'Feedback'], ['review', 'Review'], ['appreciation', 'Appreciation'], ['warning', 'Warning'], ['training', 'Training']], 'feedback')) +
      field('Rating', sel('rv-r', [['', 'No rating'], ['5', '★★★★★ Excellent'], ['4', '★★★★ Good'], ['3', '★★★ OK'], ['2', '★★ Needs work'], ['1', '★ Poor']], '')) + field('Note', '<textarea id="rv-n" rows="4" placeholder="What went well, what to improve, guest comments…"></textarea>', true) + '</div>' +
      '<div class="fo-toolbar"><button class="btn btn--primary" id="rv-go">Save</button></div>');
    $('#rv-go', p).onclick = function () { save('f.hr.review.save', { review: { emp_id: e.emp_id, date: val(p, 'rv-d'), kind: val(p, 'rv-k'), rating: val(p, 'rv-r'), note: val(p, 'rv-n') } }, 'Saved').then(function (j) { if (j.ok) p.parentNode.remove(); }); };
  }
  function hrSalary(body) {
    var pays = (D().salary_payments || []).slice().sort(function (a, b) { return a.paid_on < b.paid_on ? 1 : -1; }), months = {};
    pays.forEach(function (x) { months[x.period] = (months[x.period] || 0) + num(x.amount); });
    var ms = Object.keys(months).sort().slice(-12);
    body.innerHTML = '<div class="fo-grid fo-grid--2">' + card('Paid per month', 'last 12 months', '<div class="fo-chartbox" id="hr-m"></div>') + card('This month', dmy(month() + '-01').replace(/^\d+ /, ''), table(['Person', 'Salary', 'Paid', 'Status'], emps().filter(function (e) { return e.status === 'active'; }).map(function (e) {
      var paid = pays.filter(function (x) { return x.emp_id === e.emp_id && x.period === month(); }).reduce(function (a, x) { return a + num(x.amount); }, 0), st = payStatus(e, pays);
      return [esc(e.name), e.salary_amount !== '' ? inr(num(e.salary_amount)) : '—', inr(paid), badge(st.label, st.cls)];
    }), 'No team yet.', [1, 2])) + '</div>' +
      card('All payments', pays.length + ' recorded', table(['Paid on', 'Person', 'For', 'Kind', 'Amount', 'Mode', 'Reference'], pays.map(function (x) { return [dmy(x.paid_on), esc(x.emp_name), esc(x.period), esc(x.kind || 'salary'), inr(num(x.amount)), esc(x.mode), esc(x.ref || '')]; }), 'No payments yet.', [4]), '<button class="btn btn--sm" id="hr-pcsv">Export CSV</button>');
    U.C.combo($('#hr-m'), { labels: ms.map(function (m) { return m; }), kind: 'inr', empty: 'No payments yet.', series: [{ name: 'Paid', values: ms.map(function (m) { return months[m]; }) }] });
    $('#hr-pcsv').onclick = function () { U.csvDownload('ap-villas-salary-payments-' + today(), ['paid_on', 'person', 'for_month', 'kind', 'amount', 'mode', 'reference', 'expense_id'], pays.map(function (x) { return [x.paid_on, x.emp_name, x.period, x.kind, x.amount, x.mode, x.ref, x.expense_id]; })); };
  }
  function hrReviews(body) {
    var revs = (D().employee_reviews || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }), names = {}; (D().employees || []).forEach(function (e) { names[e.emp_id] = e; });
    body.innerHTML = (editor() ? '<div class="fo-toolbar">' + sel('rv-who', emps().filter(function (e) { return e.status === 'active'; }).map(function (e) { return [e.emp_id, e.name]; }), '') + '<button class="btn btn--primary" id="rv-add">Add feedback</button></div>' : '') +
      table(['Date', 'Person', 'Kind', 'Rating', 'Note', ''], revs.map(function (r) { return [dmy(r.date), esc((names[r.emp_id] || {}).name || 'former staff'), esc(r.kind), r.rating !== '' ? '★'.repeat(num(r.rating)) : '—', esc(r.note), founder() ? '<button class="btn btn--sm btn--danger" data-delrev="' + esc(r.review_id) + '">Delete</button>' : '']; }), 'No feedback yet. Reviews help with raises, training and guest complaints.');
    var a = $('#rv-add'); if (a) a.onclick = function () { var e = names[val(body, 'rv-who')]; if (e) reviewDrawer(e); };
    $$('[data-delrev]', body).forEach(function (b) { b.onclick = function () { if (confirm('Delete this feedback?')) save('f.hr.review.delete', { review_id: b.dataset.delrev }, 'Deleted'); }; });
  }
  function hrMessages(body) {
    var msgs = (D().crm_messages || []).filter(function (m) { return m.contact_type === 'employee'; }).slice().reverse();
    body.innerHTML = '<div class="fo-toolbar"><button class="btn btn--primary" id="hm-all">Message the whole team</button>' + sel('hm-role', [['', 'or a group…']].concat(ROLES), '') + '</div>' +
      table(['When', 'To', 'Channel', 'Message', 'Status'], msgs.map(function (m) { return [when(m.at), esc(m.name), esc(m.channel), esc((m.subject ? m.subject + ' · ' : '') + String(m.body).slice(0, 140)), badge(m.status, m.status === 'failed' ? 'fo-badge--bad' : '')]; }), 'No messages to staff yet.');
    var act = emps().filter(function (e) { return e.status === 'active'; }), to = function (list) { return list.map(function (e) { return { name: e.name, email: e.email, phone: e.phone, contact_type: 'employee', contact_id: e.emp_id }; }); };
    $('#hm-all').onclick = function () { compose(to(act), { audience: 'employee' }); };
    $('#hm-role').onchange = function () { var r = this.value; if (!r) return; var l = act.filter(function (e) { return e.role === r; }); if (!l.length) return toast('Nobody with that role yet.', true); compose(to(l), { audience: 'employee' }); this.value = ''; };
  }

  // ============================================================ CRM ============================================================
  function viewCrm(page) {
    var T = U.tabs('crm', [['inbox', 'Messages'], ['guests', 'Guests'], ['leads', 'Leads'], ['tasks', 'Follow-ups'], ['templates', 'Templates'], ['blog', 'Blog engine']]);
    page.innerHTML = U.hello('CRM', 'Every email and WhatsApp message, your guests\' history, new enquiries (leads) and follow-ups. Email sends from your Google account; WhatsApp opens on your phone with the message ready.') + T.html + '<div id="crm"></div>';
    U.wireTabs(page, 'crm');
    ({ inbox: crmInbox, guests: crmGuests, leads: crmLeads, tasks: crmTasks, templates: crmTemplates, blog: crmBlog }[T.cur] || crmInbox)($('#crm'));
  }
  function crmInbox(body) {
    var all = (D().crm_messages || []).slice().reverse(), f = S.crmF || { ch: '', who: '', q: '' };
    var list = all.filter(function (m) { return (!f.ch || m.channel === f.ch) && (!f.who || m.contact_type === f.who) && (!f.q || (m.name + ' ' + m.to + ' ' + m.subject + ' ' + m.body).toLowerCase().indexOf(f.q.toLowerCase()) >= 0); });
    var d30 = M.addDays(today(), -30), recent = all.filter(function (m) { return String(m.at).slice(0, 10) >= d30; }), by = function (ch) { return recent.filter(function (m) { return m.channel === ch; }).length; };
    body.innerHTML = '<div class="fo-grid fo-grid--kpi">' + kpi('Messages, 30 days', String(recent.length), '') + kpi('Emails', String(by('email')), recent.filter(function (m) { return m.channel === 'email' && m.status === 'failed'; }).length + ' failed') + kpi('WhatsApp', String(by('whatsapp')), 'opened from the portal') + kpi('Calls & notes', String(by('call') + by('note')), 'logged by hand') + '</div>' +
      '<div class="fo-toolbar" style="margin-top:14px">' + sel('ib-ch', [['', 'All channels'], ['email', 'Email'], ['whatsapp', 'WhatsApp'], ['call', 'Calls'], ['note', 'Notes']], f.ch) + sel('ib-who', [['', 'Everyone'], ['guest', 'Guests'], ['lead', 'Leads'], ['employee', 'Staff'], ['vendor', 'Vendors'], ['ota', 'OTAs'], ['other', 'Other']], f.who) +
      '<input class="fo-input" id="ib-q" placeholder="Search name, number, text" value="' + esc(f.q) + '">' + (editor() ? '<button class="btn" id="ib-log">+ Log a call / note</button>' : '') + '</div>' +
      table(['When', 'Who', 'Channel', 'Message', 'Status', 'By'], list.slice(0, 300).map(function (m) { return [when(m.at), '<b>' + esc(m.name || m.to) + '</b><br><small class="fo-hint">' + esc(m.contact_type) + (m.to ? ' · ' + esc(m.to) : '') + '</small>', esc(m.channel) + (m.direction === 'in' ? ' ↙' : ''), esc((m.subject ? m.subject + ' · ' : '') + String(m.body).slice(0, 160)), badge(m.status, m.status === 'failed' ? 'fo-badge--bad' : ''), '<small>' + esc(m.by === 'system' ? 'automatic' : String(m.by).split('@')[0]) + '</small>']; }), 'No messages yet. Emails and WhatsApp messages sent from the portal appear here.');
    function upd() { S.crmF = { ch: val(body, 'ib-ch'), who: val(body, 'ib-who'), q: val(body, 'ib-q') }; crmInbox(body); }
    $('#ib-ch', body).onchange = upd; $('#ib-who', body).onchange = upd; $('#ib-q', body).onchange = upd;
    var lg = $('#ib-log'); if (lg) lg.onclick = function () { logDrawer({}); };
  }
  function logDrawer(c) {
    var p = U.drawer(head('Log a conversation') + '<div class="fo-form">' + field('Channel', sel('lg-ch', [['call', 'Phone call'], ['whatsapp', 'WhatsApp'], ['email', 'Email'], ['sms', 'SMS'], ['note', 'Note']], 'call')) + field('Direction', sel('lg-d', [['out', 'I contacted them'], ['in', 'They contacted me']], 'out')) +
      field('Who', sel('lg-t', [['guest', 'Guest'], ['lead', 'Lead'], ['employee', 'Staff'], ['vendor', 'Vendor'], ['ota', 'OTA'], ['other', 'Other']], c.contact_type || 'guest')) + field('Name', input('lg-n', c.name)) + field('Phone / email', input('lg-to', c.to)) + field('What was said', '<textarea id="lg-b" rows="4"></textarea>', true) + '</div>' +
      '<div class="fo-toolbar"><button class="btn btn--primary" id="lg-go">Save</button></div>');
    $('#lg-go', p).onclick = function () { save('f.crm.log', { message: { channel: val(p, 'lg-ch'), direction: val(p, 'lg-d'), contact_type: val(p, 'lg-t'), contact_id: c.contact_id || '', name: val(p, 'lg-n'), to: val(p, 'lg-to'), body: val(p, 'lg-b'), status: 'logged' } }, 'Logged').then(function (j) { if (j.ok) p.parentNode.remove(); }); };
  }
  /** Guest profiles from the ledger: stays, nights, value, last and next stay. */
  function guestProfiles() {
    var g = {}, gs = D().guests || [], t = today();
    gs.forEach(function (x) { g[x.guest_id] = { id: x.guest_id, name: x.name, phone: x.phone, email: x.email, city: x.city, stays: 0, nights: 0, value: 0, last: '', next: '', villas: {} }; });
    (D().bookings || []).forEach(function (b) {
      if (['cancelled', 'void'].indexOf(b.status) >= 0) return;
      var x = g[b.guest_id] || (g[b.guest_id || ('n:' + b.guest_name)] = { id: b.guest_id || '', name: b.guest_name, phone: '', email: '', city: '', stays: 0, nights: 0, value: 0, last: '', next: '', villas: {} });
      x.stays++; x.nights += num(b.nights); x.value += num(b.gross_amount) - num(b.discount); x.villas[b.property_id] = 1;
      if (b.checkin < t && b.checkin > x.last) x.last = b.checkin;
      if (b.checkin >= t && (!x.next || b.checkin < x.next)) x.next = b.checkin;
    });
    return Object.keys(g).map(function (k) { return g[k]; }).filter(function (x) { return x.stays; }).sort(function (a, b) { return (b.next ? 1 : 0) - (a.next ? 1 : 0) || String(b.last).localeCompare(a.last); });
  }
  function crmGuests(body) {
    var all = guestProfiles(), seg = S.crmSeg || 'all', q = S.crmQ || '', t = today();
    var segs = { all: all, upcoming: all.filter(function (x) { return x.next; }), repeat: all.filter(function (x) { return x.stays >= 2; }), recent: all.filter(function (x) { return x.last >= M.addDays(t, -60); }), lapsed: all.filter(function (x) { return x.last && x.last < M.addDays(t, -180) && !x.next; }), noemail: all.filter(function (x) { return !x.email; }) };
    var list = segs[seg].filter(function (x) { return !q || (x.name + ' ' + x.phone + ' ' + x.email + ' ' + x.city).toLowerCase().indexOf(q.toLowerCase()) >= 0; });
    body.innerHTML = '<div class="fo-toolbar">' + sel('gu-seg', [['all', 'All guests (' + all.length + ')'], ['upcoming', 'Arriving soon (' + segs.upcoming.length + ')'], ['repeat', 'Repeat guests (' + segs.repeat.length + ')'], ['recent', 'Stayed in the last 60 days (' + segs.recent.length + ')'], ['lapsed', 'Not back in 6 months (' + segs.lapsed.length + ')'], ['noemail', 'No email on file (' + segs.noemail.length + ')']], seg) +
      '<input class="fo-input" id="gu-q" placeholder="Search guests" value="' + esc(q) + '"><button class="btn btn--primary" id="gu-msg">Message these ' + list.length + '</button></div>' +
      table(['Guest', 'Contact', 'Stays', 'Nights', 'Value', 'Last stay', 'Next stay', ''], list.slice(0, 300).map(function (x, i) {
        return ['<b>' + esc(x.name) + '</b>' + (x.city ? '<br><small class="fo-hint">' + esc(x.city) + '</small>' : '') + (x.stays >= 2 ? ' ' + badge('repeat', 'fo-badge--gold') : ''), esc(x.phone || '') + (x.email ? '<br><small>' + esc(x.email) + '</small>' : ''),
          String(x.stays), String(x.nights), inr(x.value), x.last ? dmy(x.last) : '—', x.next ? '<b>' + dmy(x.next) + '</b>' : '—', '<button class="btn btn--sm" data-g="' + i + '">Message</button> <button class="btn btn--sm" data-h="' + i + '">History</button>'];
      }), 'No guests in this group.', [2, 3, 4]);
    function to(xs) { return xs.map(function (x) { return { name: x.name, email: x.email, phone: x.phone, contact_type: 'guest', contact_id: x.id, ctx: { checkin: x.next ? dmy(x.next) : '' } }; }); }
    $('#gu-seg', body).onchange = function () { S.crmSeg = this.value; crmGuests(body); };
    $('#gu-q', body).onchange = function () { S.crmQ = this.value; crmGuests(body); };
    $('#gu-msg', body).onclick = function () { if (!list.length) return; compose(to(list), { audience: 'guest' }); };
    $$('[data-g]', body).forEach(function (b) { b.onclick = function () { compose(to([list[Number(b.dataset.g)]]), { audience: 'guest' }); }; });
    $$('[data-h]', body).forEach(function (b) { b.onclick = function () { guestHistory(list[Number(b.dataset.h)]); }; });
  }
  function guestHistory(x) {
    var bks = (D().bookings || []).filter(function (b) { return x.id ? b.guest_id === x.id : b.guest_name === x.name; }).sort(function (a, b) { return a.checkin < b.checkin ? 1 : -1; });
    var msgs = (D().crm_messages || []).filter(function (m) { return m.contact_type === 'guest' && ((x.id && m.contact_id === x.id) || (x.email && m.to === x.email) || (x.phone && String(m.to).replace(/\D/g, '').slice(-10) === String(x.phone).replace(/\D/g, '').slice(-10))); }).reverse();
    U.drawer(head(x.name, esc([x.phone, x.email, x.city].filter(Boolean).join(' · '))) + '<h3 style="margin:6px 0 8px">Stays</h3>' +
      table(['Check-in', 'Villa', 'Nights', 'Channel', 'Status', 'Value'], bks.map(function (b) { return ['<a href="#" onclick="return false" data-bk="' + esc(b.booking_id) + '">' + dmy(b.checkin) + '</a>', esc(U.propName(b.property_id)), esc(b.nights), esc(b.channel), esc(b.status), inr(num(b.gross_amount) - num(b.discount))]; }), 'No stays.', [2, 5]) +
      '<h3 style="margin:16px 0 8px">Messages</h3>' + table(['When', 'Channel', 'Message'], msgs.map(function (m) { return [when(m.at), esc(m.channel), esc((m.subject ? m.subject + ' · ' : '') + String(m.body).slice(0, 160))]; }), 'No messages logged yet.'));
    $$('[data-bk]').forEach(function (a) { a.onclick = function () { U.openBooking(a.dataset.bk); }; });
  }
  function crmLeads(body) {
    var leads = D().crm_leads || [], t = today();
    body.innerHTML = '<div class="fo-toolbar">' + (editor() ? '<button class="btn btn--primary" id="ld-add">+ New enquiry</button>' : '') + '<span class="fo-hint">' + leads.filter(function (l) { return l.next_followup && l.next_followup <= t && ['won', 'lost'].indexOf(l.stage) < 0; }).length + ' follow-ups due today or overdue</span></div>' +
      '<div class="crm-board">' + STAGES.map(function (s) {
        var ls = leads.filter(function (l) { return l.stage === s[0]; }).sort(function (a, b) { return String(a.next_followup || '9').localeCompare(String(b.next_followup || '9')); });
        return '<div class="crm-col"><h4>' + esc(s[1]) + ' <small>' + ls.length + (ls.length ? ' · ' + inr(ls.reduce(function (a, l) { return a + num(l.value_inr); }, 0)) : '') + '</small></h4>' + ls.map(function (l) {
          var late = l.next_followup && l.next_followup <= t && ['won', 'lost'].indexOf(l.stage) < 0;
          return '<button class="crm-lead' + (late ? ' is-late' : '') + '" data-lead="' + esc(l.lead_id) + '"><b>' + esc(l.name || l.phone) + '</b><span>' + esc([l.villa, l.checkin ? dm(l.checkin) : '', l.guests ? l.guests + ' guests' : ''].filter(Boolean).join(' · ')) + '</span>' +
            (l.value_inr !== '' ? '<span>' + inr(num(l.value_inr)) + '</span>' : '') + (l.next_followup ? '<em>follow up ' + dm(l.next_followup) + '</em>' : '') + (l.source ? '<small>' + esc(l.source) + '</small>' : '') + '</button>';
        }).join('') + '</div>';
      }).join('') + '</div>';
    var a = $('#ld-add'); if (a) a.onclick = function () { leadDrawer({}); };
    $$('[data-lead]', body).forEach(function (b) { b.onclick = function () { leadDrawer(leads.filter(function (l) { return l.lead_id === b.dataset.lead; })[0]); }; });
  }
  function leadDrawer(l) {
    var p = U.drawer(head(l.lead_id ? l.name || 'Enquiry' : 'New enquiry') + '<div class="fo-form">' + field('Name', input('ld-n', l.name)) + field('Mobile', input('ld-p', l.phone, 'tel')) + field('Email', input('ld-e', l.email, 'email')) +
      field('Came from', sel('ld-s', [['', '—'], ['WhatsApp', 'WhatsApp'], ['Phone call', 'Phone call'], ['Instagram', 'Instagram'], ['Facebook', 'Facebook'], ['Website', 'Website'], ['Google', 'Google'], ['Referral', 'Referral'], ['Walk-in', 'Walk-in'], ['OTA', 'OTA message']], l.source || '')) +
      field('Villa', sel('ld-v', [['', 'Not decided']].concat((D().properties || []).map(function (x) { return [x.name, x.name]; })), l.villa || '')) + field('Check-in', input('ld-c', l.checkin, 'date')) + field('Nights', input('ld-ni', l.nights, 'number', ' min="1"')) + field('Guests', input('ld-g', l.guests, 'number', ' min="1"')) +
      field('Stage', sel('ld-st', STAGES, l.stage || 'new')) + field('Quoted value ₹', input('ld-val', l.value_inr, 'number', ' min="0" step="100"')) + field('Next follow-up', input('ld-f', l.next_followup || M.addDays(today(), 1), 'date')) + field('If lost, why', input('ld-lr', l.lost_reason)) +
      field('Notes', '<textarea id="ld-no" rows="3">' + esc(l.notes || '') + '</textarea>', true) + '</div>' +
      '<div class="fo-toolbar"><button class="btn btn--primary" id="ld-go">Save</button>' + (l.lead_id ? '<button class="btn" id="ld-msg">Message</button><button class="btn" id="ld-log">Log call / note</button>' : '') + (l.lead_id && founder() ? '<button class="btn btn--danger" id="ld-del">Delete</button>' : '') + '</div>');
    $('#ld-go', p).onclick = function () {
      save('f.crm.lead.save', { lead: { lead_id: l.lead_id || '', name: val(p, 'ld-n'), phone: val(p, 'ld-p'), email: val(p, 'ld-e'), source: val(p, 'ld-s'), villa: val(p, 'ld-v'), checkin: val(p, 'ld-c'), nights: val(p, 'ld-ni'), guests: val(p, 'ld-g'),
        stage: val(p, 'ld-st'), value_inr: val(p, 'ld-val'), next_followup: val(p, 'ld-f'), lost_reason: val(p, 'ld-lr'), notes: val(p, 'ld-no') } }, 'Saved').then(function (j) { if (j.ok) p.parentNode.remove(); });
    };
    var m = $('#ld-msg', p); if (m) m.onclick = function () { p.parentNode.remove(); compose([{ name: l.name, email: l.email, phone: l.phone, contact_type: 'lead', contact_id: l.lead_id, ctx: { checkin: l.checkin ? dmy(l.checkin) : '', villa: l.villa } }], { audience: 'lead' }); };
    var g = $('#ld-log', p); if (g) g.onclick = function () { p.parentNode.remove(); logDrawer({ contact_type: 'lead', contact_id: l.lead_id, name: l.name, to: l.phone || l.email }); };
    var d = $('#ld-del', p); if (d) d.onclick = function () { if (confirm('Delete this enquiry?')) save('f.crm.lead.delete', { lead_id: l.lead_id }, 'Deleted').then(function (j) { if (j.ok) p.parentNode.remove(); }); };
  }
  function crmTasks(body) {
    var tasks = (D().crm_tasks || []).slice().sort(function (a, b) { return (a.done ? 1 : 0) - (b.done ? 1 : 0) || String(a.due || '9').localeCompare(String(b.due || '9')); }), t = today();
    var leadsDue = (D().crm_leads || []).filter(function (l) { return l.next_followup && l.next_followup <= M.addDays(t, 2) && ['won', 'lost'].indexOf(l.stage) < 0; });
    body.innerHTML = (editor() ? '<div class="fo-toolbar"><input class="fo-input" id="tk-t" placeholder="New follow-up, e.g. Send Diwali offer to repeat guests" style="min-width:300px"><input class="fo-input" id="tk-d" type="date" value="' + t + '"><button class="btn btn--primary" id="tk-add">Add</button></div>' : '') +
      '<div class="fo-grid fo-grid--2">' + card('To do', tasks.filter(function (x) { return !x.done; }).length + ' open', table(['Due', 'Task', ''], tasks.map(function (x) { return [x.due ? (x.due < t && !x.done ? '<b class="down">' + dmy(x.due) + '</b>' : dmy(x.due)) : '—', (x.done ? '<s>' : '') + esc(x.title) + (x.done ? '</s>' : ''), editor() ? '<button class="btn btn--sm" data-done="' + esc(x.task_id) + '">' + (x.done ? 'Reopen' : 'Done') + '</button> <button class="btn btn--sm btn--danger" data-deltk="' + esc(x.task_id) + '">×</button>' : '']; }), 'Nothing to do.')) +
      card('Enquiries to follow up', 'next 2 days', table(['Due', 'Enquiry', 'Stage'], leadsDue.map(function (l) { return [dmy(l.next_followup), esc(l.name || l.phone) + ' <small class="fo-hint">' + esc([l.villa, l.checkin ? dm(l.checkin) : ''].filter(Boolean).join(' · ')) + '</small>', esc(l.stage)]; }), 'No enquiries waiting.')) + '</div>';
    var a = $('#tk-add'); if (a) a.onclick = function () { var title = val(body, 'tk-t'); if (!title.trim()) return; save('f.crm.task.save', { task: { title: title, due: val(body, 'tk-d') } }, 'Added'); };
    $$('[data-done]', body).forEach(function (b) { b.onclick = function () { var x = tasks.filter(function (k) { return k.task_id === b.dataset.done; })[0]; save('f.crm.task.save', { task: Object.assign({}, x, { done: !x.done }) }); }; });
    $$('[data-deltk]', body).forEach(function (b) { b.onclick = function () { save('f.crm.task.delete', { task_id: b.dataset.deltk }, 'Deleted'); }; });
  }
  // ---------- blog engine: ideas from real demand → writer → photos → checks → live (back end: FoSearch.gs, .github/workflows/blog-queue.yml + blog.yml) ----------
  var BLOG_STEPS = [['approved', 'Accepted'], ['in_progress', 'Writing, choosing photos'], ['written', 'Checking facts'], ['published', 'Live']];
  function crmBlog(body) {
    var all = D().seo_topics || [], ideas = all.filter(function (t) { return t.status === 'suggested'; }).sort(function (a, b) { return num(b.score) - num(a.score); });
    var moving = all.filter(function (t) { return t.auto === 'yes' && t.status !== 'skipped'; }).sort(function (a, b) { return a.updated_at < b.updated_at ? 1 : -1; }).slice(0, 12);
    var stage = function (t) {
      if (t.status === 'failed') return '<span class="fo-badge" style="background:var(--bad,#B5121B);color:#fff">Could not be written</span> <small class="fo-hint">Nothing was published. You can try again.</small>';
      if (t.status === 'review') return '<span class="fo-badge">Needs your review</span> <small class="fo-hint">A check failed, so it was not published. The draft is waiting in GitHub.</small>';
      var at = BLOG_STEPS.map(function (x) { return x[0]; }).indexOf(t.status);
      return '<div class="bl-steps">' + BLOG_STEPS.map(function (x, i) { return '<span class="' + (i < at ? 'is-done' : i === at ? 'is-now' : '') + '">' + esc(x[1]) + '</span>'; }).join('') + '</div>';
    };
    body.innerHTML = '<div class="fo-note" style="margin-bottom:14px"><b>How it works:</b> every day the engine ranks what people search around Ujjain, where Google already shows your site, and the events ahead. Accept an idea and the agents write it, choose real photos, check every fact and publish it, usually within an hour. If any check fails it stays unpublished for your review.</div>' +
      '<div class="fo-toolbar">' + (editor() ? '<button class="btn btn--primary" id="bl-find">Find new ideas</button>' : '') + '<button class="btn" id="bl-ref">Refresh progress</button></div>' +
      (moving.length ? card('In progress and published', '', moving.map(function (t) { return '<div class="bl-row"><div><b>' + esc(t.title || t.keyword) + '</b>' + (t.status === 'published' && t.slug ? ' <a target="_blank" rel="noopener" href="https://www.apvillasandresorts.in/blog/' + esc(t.slug) + '.html">Open post ↗</a>' : '') + '</div>' + stage(t) + (['failed', 'review'].indexOf(t.status) >= 0 && founder() ? '<button class="btn btn--sm" data-bl-accept="' + esc(t.topic_id) + '">Try again</button>' : '') + '</div>'; }).join('')) : '') +
      card('Suggested topics', ideas.length + ' ideas · score compares ideas, it does not promise traffic', ideas.length ? ideas.map(function (t) {
        return '<div class="bl-idea"><div class="bl-score" title="Demand, timing, chance to rank and fit with your guests">' + esc(t.score) + '</div><div class="bl-body"><b>' + esc(t.title) + '</b><small>Keyword: ' + esc(t.keyword) + (t.target_date ? ' · for ' + dmy(t.target_date) : '') + '</small><p>' + esc(t.why) + '</p>' +
          (editor() ? '<div class="fo-toolbar" style="margin:6px 0 0">' + (founder() ? '<button class="btn btn--primary btn--sm" data-bl-accept="' + esc(t.topic_id) + '">Accept: write and publish</button>' : '') + '<button class="btn btn--sm" data-bl-skip="' + esc(t.topic_id) + '">Skip</button></div>' : '') + '</div></div>';
      }).join('') : '<div class="fo-empty">No ideas waiting. Press “Find new ideas”, or add festivals under Trends & Events so the engine can plan ahead.</div>');
    var again = function () { return U.load(true).then(function () { crmBlog(body); }); };
    $('#bl-ref', body).onclick = again;
    var f = $('#bl-find', body); if (f) f.onclick = function () { f.disabled = true; f.textContent = 'Looking…'; U.api('f.blog.suggest', {}).then(function (j) { if (!j.ok) toast(j.error, true); else toast(j.result.added ? j.result.added + ' new ideas' : 'No new ideas right now'); return again(); }); };
    $$('[data-bl-accept]', body).forEach(function (b) { b.onclick = function () { if (!confirm('Write this post and publish it on the website if every check passes?')) return; b.disabled = true; U.api('f.blog.accept', { topic_id: b.dataset.blAccept }).then(function (j) { if (!j.ok) toast(j.error, true); else toast('Accepted. The agents start within about 15 minutes.'); return again(); }); }; });
    $$('[data-bl-skip]', body).forEach(function (b) { b.onclick = function () { U.api('f.blog.skip', { topic_id: b.dataset.blSkip }).then(function (j) { if (!j.ok) toast(j.error, true); return again(); }); }; });
  }
  var STARTER = [
    { name: 'Booking confirmation', channel: 'whatsapp', audience: 'guest', body: 'Namaste {name} ji 🙏 Your stay at AP Villas is confirmed for {checkin}. Please complete your e-check-in before arrival: https://www.apvillasandresorts.in/checkin.html' },
    { name: 'Pre-arrival directions', channel: 'whatsapp', audience: 'guest', body: 'Namaste {name} ji, we look forward to welcoming you on {checkin}. Our caretaker will share the location pin and help with Mahakal darshan timings. Har Har Mahadev 🙏' },
    { name: 'Thank you + review', channel: 'whatsapp', audience: 'guest', body: 'Dhanyavaad {name} ji for staying with AP Villas 🙏 If you were happy with your stay, a short review would mean a lot to our family.' },
    { name: 'Come back offer', channel: 'email', audience: 'guest', subject: '{name}, a special offer for your next Ujjain visit', body: 'Namaste {name} ji,\n\nThank you for staying with us. For your next Mahakal darshan, reply to this email or WhatsApp us and we will offer you our returning-guest rate.\n\nHar Har Mahadev' },
    { name: 'Salary paid', channel: 'whatsapp', audience: 'employee', body: 'Namaste {name} ji, your salary for this month has been paid. Thank you for your hard work 🙏' },
    { name: 'Staff notice', channel: 'email', audience: 'employee', subject: 'AP Villas: update for the team', body: 'Namaste {name} ji,\n\n' },
  ];
  function crmTemplates(body) {
    var tpls = D().crm_templates || [];
    body.innerHTML = '<div class="fo-toolbar">' + (editor() ? '<button class="btn btn--primary" id="tp-add">+ New template</button>' + (!tpls.length ? '<button class="btn" id="tp-starter">Add 6 starter templates</button>' : '') : '') + '<span class="fo-hint">Use {name}, {checkin}, {villa} in a message; they are filled in for each person.</span></div>' +
      table(['Name', 'Channel', 'For', 'Message', ''], tpls.map(function (x) { return ['<b>' + esc(x.name) + '</b>', esc(x.channel), esc(x.audience), esc((x.subject ? x.subject + ' · ' : '') + String(x.body).slice(0, 140)), editor() ? '<button class="btn btn--sm" data-tp="' + esc(x.template_id) + '">Edit</button>' : '']; }), 'No templates yet.');
    var a = $('#tp-add'); if (a) a.onclick = function () { tplDrawer({}); };
    var st = $('#tp-starter'); if (st) st.onclick = function () { var chain = Promise.resolve(); STARTER.forEach(function (x) { chain = chain.then(function () { return U.api('f.crm.template.save', { template: x }); }); }); chain.then(function () { toast('Starter templates added'); U.load(true); }); };
    $$('[data-tp]', body).forEach(function (b) { b.onclick = function () { tplDrawer(tpls.filter(function (x) { return x.template_id === b.dataset.tp; })[0]); }; });
  }
  function tplDrawer(x) {
    var p = U.drawer(head(x.template_id ? 'Edit template' : 'New template') + '<div class="fo-form">' + field('Name', input('tp-n', x.name)) + field('Channel', sel('tp-c', [['whatsapp', 'WhatsApp'], ['email', 'Email']], x.channel || 'whatsapp')) +
      field('For', sel('tp-a', [['any', 'Anyone'], ['guest', 'Guests'], ['lead', 'Leads'], ['employee', 'Staff']], x.audience || 'any')) + field('Subject (email)', input('tp-s', x.subject), true) + field('Message', '<textarea id="tp-b" rows="6">' + esc(x.body || '') + '</textarea>', true) + '</div>' +
      '<div class="fo-toolbar"><button class="btn btn--primary" id="tp-go">Save</button>' + (x.template_id ? '<button class="btn btn--danger" id="tp-del">Delete</button>' : '') + '</div>');
    $('#tp-go', p).onclick = function () { save('f.crm.template.save', { template: { template_id: x.template_id || '', name: val(p, 'tp-n'), channel: val(p, 'tp-c'), audience: val(p, 'tp-a'), subject: val(p, 'tp-s'), body: val(p, 'tp-b') } }, 'Saved').then(function (j) { if (j.ok) p.parentNode.remove(); }); };
    var d = $('#tp-del', p); if (d) d.onclick = function () { save('f.crm.template.delete', { template_id: x.template_id }, 'Deleted').then(function (j) { if (j.ok) p.parentNode.remove(); }); };
  }

  U.VIEWS.hr = viewHr; U.VIEWS.crm = viewCrm;
  window.FoPeople = { compose: compose, guestProfiles: guestProfiles };
})();
