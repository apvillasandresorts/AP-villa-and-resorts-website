// People & HR and CRM (docs/founder-os/FoPeople.gs) on the Apps Script mock: staff, salary → expense, reviews, emails, leads, message log.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from './gas-mock.mjs';

async function ready() { const env = makeEnv(); env.fo.foSetup(); return { env, token: await env.login() }; }

test('employees: add caretaker / sweeper / remote intern, edit, delete (founder only, kept in Deleted records)', async () => {
  const { env, token } = await ready();
  const a = env.api({ action: 'f.hr.emp.save', token, employee: { name: 'Mahesh Kumar', role: 'caretaker', property_ids: 'rudrangan-suites', phone: '+91 95224 87385', salary_amount: 12000, pay_day: 5 } });
  assert.equal(a.ok, true, a.error); assert.match(a.record.emp_id, /^EMP/);
  env.api({ action: 'f.hr.emp.save', token, employee: { name: 'Sunita', role: 'sweeper', salary_amount: 6000 } });
  const intern = env.api({ action: 'f.hr.emp.save', token, employee: { name: 'Riya', role: 'intern', work_mode: 'remote', email: 'riya@example.com', salary_cycle: 'stipend', salary_amount: 5000 } });
  assert.equal(intern.record.work_mode, 'remote');
  assert.match(env.api({ action: 'f.hr.emp.save', token, employee: { name: '' } }).error, /name/);
  assert.match(env.api({ action: 'f.hr.emp.save', token, employee: { name: 'X', email: 'not-an-email' } }).error, /email/);
  const ed = env.api({ action: 'f.hr.emp.save', token, employee: Object.assign({}, a.record, { salary_amount: 13000 }) });
  assert.equal(Number(ed.record.salary_amount), 13000);
  env.setUserRole('manager');
  assert.match(env.api({ action: 'f.hr.emp.delete', token, emp_id: a.record.emp_id }).error, /role/);
  env.setUserRole('founder');
  assert.equal(env.api({ action: 'f.hr.emp.delete', token, emp_id: a.record.emp_id, reason: 'left' }).ok, true);
  assert.equal(env.tab('Employees').length, 2);
  assert.equal(env.tab('DeletedRecords').filter(r => r.kind === 'employee').length, 1);
});

test('salary payment books the expense (Staff & caretakers) for the right villa; deleting it removes both', async () => {
  const { env, token } = await ready();
  const e = env.api({ action: 'f.hr.emp.save', token, employee: { name: 'Mahesh Kumar', role: 'caretaker', property_ids: 'rudrangan-suites', salary_amount: 12000 } }).record;
  const p = env.api({ action: 'f.hr.pay.save', token, payment: { emp_id: e.emp_id, amount: 12000, paid_on: '2026-10-05', period: '2026-10', mode: 'upi', ref: 'UPI123' } });
  assert.equal(p.ok, true, p.error);
  const ex = env.tab('Expenses'); assert.equal(ex.length, 1);
  assert.equal(ex[0].category, 'staff'); assert.equal(Number(ex[0].amount), 12000); assert.equal(ex[0].property_id, 'rudrangan-suites'); assert.equal(ex[0].vendor, 'Mahesh Kumar');
  assert.equal(p.record.expense_id, ex[0].expense_id); assert.equal(p.record.emp_name, 'Mahesh Kumar');
  assert.match(env.api({ action: 'f.hr.pay.save', token, payment: { emp_id: e.emp_id, amount: 0, paid_on: '2026-10-05' } }).error, /amount/);
  assert.match(env.api({ action: 'f.hr.pay.save', token, payment: { emp_id: 'nobody', amount: 10, paid_on: '2026-10-05' } }).error, /person/);
  assert.equal(env.api({ action: 'f.hr.pay.delete', token, pay_id: p.record.pay_id }).ok, true);
  assert.equal(env.tab('Expenses').length, 0); assert.equal(env.tab('SalaryPayments').length, 0);
});

test('reviews and feedback per employee; bundle carries staff, payments and reviews', async () => {
  const { env, token } = await ready();
  const e = env.api({ action: 'f.hr.emp.save', token, employee: { name: 'Sunita', role: 'sweeper' } }).record;
  assert.equal(env.api({ action: 'f.hr.review.save', token, review: { emp_id: e.emp_id, kind: 'appreciation', rating: 5, note: 'Guests praised the clean rooms' } }).ok, true);
  assert.match(env.api({ action: 'f.hr.review.save', token, review: { emp_id: e.emp_id } }).error, /feedback|rating/);
  const d = env.api({ action: 'f.data', token: await env.login() });
  assert.equal(d.employees.length, 1); assert.equal(d.employee_reviews.length, 1); assert.ok(Array.isArray(d.salary_payments));
});

test('CRM email: one email per person with their first name, every one logged; limits and validation', async () => {
  const { env, token } = await ready();
  const r = env.api({ action: 'f.crm.email', token, subject: 'Hello {name}', body: 'Dear {name}, your stay…', template: 'welcome',
    to: [{ email: 'riya@example.com', name: 'Riya Shah', contact_type: 'employee', contact_id: 'EMP1' }, { email: 'guest@example.com', name: 'Asha Rao', contact_type: 'guest' }, { email: 'bad', name: 'Nope' }] });
  assert.equal(r.ok, true, r.error); assert.deepEqual(r.result, { sent: 2, failed: 0 });
  const sent = env.mails.filter(m => /^Hello /.test(m.subject || ''));
  assert.deepEqual(sent.map(m => m.subject).sort(), ['Hello Asha', 'Hello Riya']); assert.match(sent[0].body, /^Dear (Riya|Asha)/);
  const log = env.tab('CrmMessages'); assert.equal(log.length, 2); assert.ok(log.every(x => x.channel === 'email' && x.status === 'sent'));
  assert.match(env.api({ action: 'f.crm.email', token, subject: 'x', body: 'y', to: [{ email: 'nope' }] }).error, /email address/);
});

test('CRM: WhatsApp/call logged, leads with stages and follow-ups, tasks and templates', async () => {
  const { env, token } = await ready();
  assert.equal(env.api({ action: 'f.crm.log', token, message: { channel: 'whatsapp', contact_type: 'lead', name: 'Vikram', to: '+919800000000', body: 'Quote for 2 nights', status: 'opened' } }).ok, true);
  const l = env.api({ action: 'f.crm.lead.save', token, lead: { name: 'Vikram', phone: '+91 98000 00000', source: 'Instagram', villa: 'AP Suite', checkin: '2026-11-08', nights: 2, guests: 4, stage: 'quoted', value_inr: 9000, next_followup: '2026-10-28' } });
  assert.equal(l.ok, true, l.error); assert.equal(l.record.stage, 'quoted');
  assert.match(env.api({ action: 'f.crm.lead.save', token, lead: {} }).error, /name, phone or email/);
  assert.equal(env.api({ action: 'f.crm.task.save', token, task: { title: 'Call Vikram back', due: '2026-10-28', contact_type: 'lead', contact_id: l.record.lead_id } }).ok, true);
  assert.equal(env.api({ action: 'f.crm.template.save', token, template: { name: 'Pre-arrival', channel: 'whatsapp', audience: 'guest', body: 'Namaste {name}, see you on {checkin}' } }).ok, true);
  const d = env.api({ action: 'f.data', token: await env.login() });
  assert.equal(d.crm_messages.length, 1); assert.equal(d.crm_leads.length, 1); assert.equal(d.crm_tasks.length, 1); assert.equal(d.crm_templates.length, 1);
  env.setUserRole('viewer');
  assert.match(env.api({ action: 'f.crm.lead.save', token, lead: { name: 'X' } }).error, /role/);
});
