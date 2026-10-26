/**
 * AP Villas Founder OS · People & HR and CRM (added to the e-check-in Apps Script project; routes in FoCore.gs).
 *
 * People & HR: employees of any kind (caretakers, sweepers, remote interns, …), salary terms, salary payments (each one also books an
 * expense in Finance, category "Staff & caretakers", so the P&L stays right), reviews and feedback, and emails to staff.
 * CRM: every message to guests, leads, staff and vendors in one log (emails sent from here are sent and logged automatically; WhatsApp
 * messages are opened on the owner's phone with wa.me and logged when opened), leads with stages and follow-ups, tasks, message templates.
 * Data lives only in the private Founder OS sheet. Emails go out from the owner's Google account (MailApp, ~100 a day on a free account).
 */
const FO_HR_ROLES = ['caretaker', 'sweeper', 'intern', 'manager', 'cook', 'driver', 'security', 'other'];
const FO_CRM_CHANNELS = ['email', 'whatsapp', 'call', 'sms', 'note'];
const FO_CRM_STAGES = ['new', 'contacted', 'quoted', 'won', 'lost'];

// ---------------------------------------------------------------- employees ----------------
function foHrEmpSave_(b, user) {
  const e = b.employee || {};
  const rec = { emp_id: e.emp_id || '', name: foClean_(e.name, 80).trim(), role: FO_HR_ROLES.indexOf(e.role) >= 0 ? e.role : 'other', role_title: foClean_(e.role_title, 60),
    work_mode: e.work_mode === 'remote' ? 'remote' : 'on-site', property_ids: String(e.property_ids || 'all').split(',').map(x => x.trim()).filter(Boolean).join(','),
    phone: foClean_(e.phone, 20).replace(/[^\d+ ]/g, ''), email: foClean_(e.email, 120).trim().toLowerCase(), joined: foDate_(e.joined) || '',
    salary_amount: foHasNum_(e.salary_amount) ? foNum_(e.salary_amount) : '', salary_cycle: ['monthly', 'weekly', 'daily', 'stipend', 'per-task'].indexOf(e.salary_cycle) >= 0 ? e.salary_cycle : 'monthly',
    pay_day: foHasNum_(e.pay_day) ? Math.max(1, Math.min(31, Math.round(foNum_(e.pay_day)))) : '', status: e.status === 'left' ? 'left' : 'active', notes: foClean_(e.notes, 500) };
  return foUpsert_('Employees', 'emp_id', 'EMP', rec, user, r => !r.name ? 'Type the name.' : (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) ? 'Check the email address.' :
    (r.salary_amount !== '' && !(r.salary_amount >= 0)) ? 'Check the salary.' : null);
}
/** Founder only. Payments and reviews stay (they carry the name), so salary history and the P&L are never rewritten. */
function foHrEmpDelete_(b, user) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const row = foRows_('Employees').find(r => r.emp_id === b.emp_id); if (!row) return { ok: false, error: 'Not found.' };
    foAppend_('DeletedRecords', { deleted_id: foId_('DEL'), deleted_at: foNow_(), deleted_by: user.email, kind: 'employee', record_id: row.emp_id, summary: row.name + ' · ' + row.role, reason: foClean_(b.reason, 200), data_json: JSON.stringify(Object.assign({}, row, { _row: undefined })) });
    foDeleteRow_('Employees', row._row); foAudit_(user.email, 'employee_delete', row.emp_id, 'ok'); foTouch_();
    return {};
  } finally { lock.releaseLock(); }
}

// ---------------------------------------------------------------- salary payments ----------------
/** A payment also books the expense (Staff & caretakers) for the villa(s) the person works at, so Finance never needs a second entry. */
function foHrPaySave_(b, user) {
  const x = b.payment || {}, emp = foRows_('Employees').find(r => r.emp_id === x.emp_id);
  if (!emp) return { ok: false, error: 'Choose the person.' };
  const amount = foNum_(x.amount), paidOn = foDate_(x.paid_on), period = /^\d{4}-\d{2}$/.test(String(x.period || '')) ? String(x.period) : (paidOn || '').slice(0, 7);
  if (!(amount > 0)) return { ok: false, error: 'Enter the amount paid.' };
  if (!paidOn) return { ok: false, error: 'Choose the date paid.' };
  const props = String(emp.property_ids || 'all').split(',').filter(Boolean), prop = props.length === 1 ? props[0] : 'all';
  const exp = foExpenseSave_({ expense: { date: paidOn, property_id: prop, category: 'staff', amount, vendor: emp.name, basis: 'actual', note: 'Salary ' + period + ' · ' + emp.role + (x.note ? ' · ' + x.note : '') } }, user);
  if (exp.ok === false) return exp;
  const rec = { pay_id: '', emp_id: emp.emp_id, emp_name: emp.name, period, amount, paid_on: paidOn, mode: ['cash', 'upi', 'bank', 'other'].indexOf(x.mode) >= 0 ? x.mode : 'cash',
    ref: foClean_(x.ref, 60), kind: ['salary', 'advance', 'bonus', 'deduction', 'stipend'].indexOf(x.kind) >= 0 ? x.kind : 'salary', note: foClean_(x.note, 300), expense_id: exp.record.expense_id };
  return foUpsert_('SalaryPayments', 'pay_id', 'PAY', rec, user, null);
}
function foHrPayDelete_(b, user) {
  const row = foRows_('SalaryPayments').find(r => r.pay_id === b.pay_id); if (!row) return { ok: false, error: 'Not found.' };
  if (row.expense_id) foDelete_('Expenses', 'expense_id', row.expense_id, user);
  return foDelete_('SalaryPayments', 'pay_id', row.pay_id, user);
}

// ---------------------------------------------------------------- reviews & feedback ----------------
function foHrReviewSave_(b, user) {
  const x = b.review || {};
  if (!foRows_('Employees').some(r => r.emp_id === x.emp_id)) return { ok: false, error: 'Choose the person.' };
  const rec = { review_id: x.review_id || '', emp_id: x.emp_id, date: foDate_(x.date) || foToday_(), kind: ['review', 'feedback', 'appreciation', 'warning', 'training'].indexOf(x.kind) >= 0 ? x.kind : 'feedback',
    rating: foHasNum_(x.rating) ? Math.max(1, Math.min(5, Math.round(foNum_(x.rating)))) : '', note: foClean_(x.note, 1000) };
  return foUpsert_('EmployeeReviews', 'review_id', 'REV', rec, user, r => !r.note && !r.rating ? 'Write the feedback or give a rating.' : null);
}

// ---------------------------------------------------------------- CRM: messages ----------------
/** Log any message (WhatsApp opened from the portal, a call, a note, or an email sent elsewhere). */
function foCrmLog_(b, user) {
  const x = b.message || {};
  const rec = { msg_id: '', at: foNow_(), channel: FO_CRM_CHANNELS.indexOf(x.channel) >= 0 ? x.channel : 'note', direction: x.direction === 'in' ? 'in' : 'out',
    contact_type: ['guest', 'lead', 'employee', 'vendor', 'ota', 'other'].indexOf(x.contact_type) >= 0 ? x.contact_type : 'other', contact_id: foClean_(x.contact_id, 40),
    name: foClean_(x.name, 80), to: foClean_(x.to, 120), subject: foClean_(x.subject, 160), body: foClean_(x.body, 1500), status: ['sent', 'opened', 'logged', 'failed'].indexOf(x.status) >= 0 ? x.status : 'logged',
    template: foClean_(x.template, 60), related: foClean_(x.related, 60), by: user.email };
  return foUpsert_('CrmMessages', 'msg_id', 'MSG', rec, user, null);
}
/** For other parts of the system (e-check-in welcome email, alerts) to record what they sent. Never throws. */
function foCrmLogMail_(m) {
  try { foAppend_('CrmMessages', Object.assign({ msg_id: foId_('MSG'), at: foNow_(), channel: 'email', direction: 'out', status: 'sent', by: 'system' }, m, { body: String(m.body || '').slice(0, 1500) })); } catch (e) {}
}
/**
 * Send one email to up to 30 people (guests, leads, staff). {name} in subject/body becomes each person's first name.
 * Each recipient gets their own email (no shared To/CC) and its own log row.
 */
function foCrmEmail_(b, user) {
  const list = (Array.isArray(b.to) ? b.to : []).slice(0, 30).map(t => ({ email: String(t.email || '').trim().toLowerCase(), name: foClean_(t.name, 80), contact_type: t.contact_type || 'other', contact_id: foClean_(t.contact_id, 40) }))
    .filter(t => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.email));
  const subject = foClean_(b.subject, 160).trim(), body = foClean_(b.body, 5000).trim();
  if (!list.length) return { ok: false, error: 'Nobody with an email address was chosen.' };
  if (!subject || !body) return { ok: false, error: 'Write a subject and a message.' };
  if (MailApp.getRemainingDailyQuota() < list.length) return { ok: false, error: 'Google allows only ' + MailApp.getRemainingDailyQuota() + ' more emails today from this account.' };
  if (foCounter_('FO_CRM_MAILS', 3600) > 60) return { ok: false, error: 'Too many emails this hour. Please wait a little.' };
  let sent = 0;
  list.forEach(t => {
    const first = (t.name || '').split(/\s+/)[0] || 'there', s = subject.replace(/\{name\}/g, first), m = body.replace(/\{name\}/g, first);
    let status = 'sent';
    try { MailApp.sendEmail({ to: t.email, subject: s, body: m + '\n\n— Apoorv, AP Villas & Resorts, Ujjain · WhatsApp +91 89990 61598 · www.apvillasandresorts.in', name: 'AP Villas & Resorts', replyTo: 'apvillasandresorts@gmail.com' }); sent++; }
    catch (e) { status = 'failed'; }
    foAppend_('CrmMessages', { msg_id: foId_('MSG'), at: foNow_(), channel: 'email', direction: 'out', contact_type: t.contact_type, contact_id: t.contact_id, name: t.name, to: t.email, subject: s, body: m.slice(0, 1500), status, template: foClean_(b.template, 60), related: foClean_(b.related, 60), by: user.email });
  });
  foAudit_(user.email, 'crm_email', sent + ' of ' + list.length, 'ok'); foTouch_();
  return { result: { sent, failed: list.length - sent } };
}

// ---------------------------------------------------------------- CRM: leads, tasks, templates ----------------
function foCrmLeadSave_(b, user) {
  const x = b.lead || {};
  const rec = { lead_id: x.lead_id || '', name: foClean_(x.name, 80).trim(), phone: foClean_(x.phone, 20).replace(/[^\d+ ]/g, ''), email: foClean_(x.email, 120).trim().toLowerCase(),
    source: foClean_(x.source, 40), villa: foClean_(x.villa, 60), checkin: foDate_(x.checkin) || '', nights: foHasNum_(x.nights) ? foNum_(x.nights) : '', guests: foHasNum_(x.guests) ? foNum_(x.guests) : '',
    stage: FO_CRM_STAGES.indexOf(x.stage) >= 0 ? x.stage : 'new', value_inr: foHasNum_(x.value_inr) ? foNum_(x.value_inr) : '', next_followup: foDate_(x.next_followup) || '', lost_reason: foClean_(x.lost_reason, 120), notes: foClean_(x.notes, 1000) };
  return foUpsert_('CrmLeads', 'lead_id', 'LEAD', rec, user, r => !r.name && !r.phone && !r.email ? 'Add a name, phone or email.' : null);
}
function foCrmTaskSave_(b, user) {
  const x = b.task || {};
  const rec = { task_id: x.task_id || '', title: foClean_(x.title, 160).trim(), due: foDate_(x.due) || '', contact_type: foClean_(x.contact_type, 20), contact_id: foClean_(x.contact_id, 40), done: x.done ? 'yes' : '', notes: foClean_(x.notes, 500) };
  return foUpsert_('CrmTasks', 'task_id', 'TASK', rec, user, r => !r.title ? 'Write the task.' : null);
}
function foCrmTemplateSave_(b, user) {
  const x = b.template || {};
  const rec = { template_id: x.template_id || '', name: foClean_(x.name, 60).trim(), channel: x.channel === 'whatsapp' ? 'whatsapp' : 'email', audience: ['guest', 'lead', 'employee', 'any'].indexOf(x.audience) >= 0 ? x.audience : 'any', subject: foClean_(x.subject, 160), body: foClean_(x.body, 3000) };
  return foUpsert_('CrmTemplates', 'template_id', 'TPL', rec, user, r => !r.name ? 'Name the template.' : !r.body ? 'Write the message.' : null);
}
