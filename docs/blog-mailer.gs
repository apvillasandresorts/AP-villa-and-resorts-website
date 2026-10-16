/**
 * AP Villas Journal email · add this as a NEW file in the same Apps Script project as the e-check-in script
 * (Apps Script editor → + next to Files → Script → name it "BlogMailer"), then run setupBlogMailer() once.
 *
 * Every 15 minutes it looks at www.apvillasandresorts.in/blog.html. When a new post appears at the top,
 * it emails that post to every guest who ticked "Email me new Ujjain travel guides" during e-check-in
 * (the "Email updates" column of the E-Check-in sheet). Each email has a one-click unsubscribe.
 * Sends from this Google account (free; MailApp allows about 100 emails a day on a normal Gmail account,
 * a bigger list continues automatically the next day). Log: the "Email updates" tab of the same Sheet.
 * Setup guide: docs/blog-mailer-setup.md
 */
const JOURNAL_URL = SITE + '/blog.html';
const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbzmtIwOzGohnjEOfp7RZ1cU8JtwkCb6mEZiHEa8j_gknh-zkVbHz4oEV1Mu5xTaNpo7/exec';   // this script's web app (same as checkin.html)
const MAILER_TAB = 'Email updates';
const MAILER_COLS = ['Time', 'Type', 'Email', 'Name', 'Post'];
const MAIL_LOGO = SITE + '/assets/brand/logo-full-720.png';
const KEEP_FOR_CHECKINS = 10;   // daily emails kept free for check-in welcome emails

/** Run once from the editor: grants permission, makes the log tab, remembers today's newest post, starts the 15-minute check. */
function setupBlogMailer() {
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('MAILER_SECRET')) p.setProperty('MAILER_SECRET', Utilities.getUuid() + Utilities.getUuid());
  const posts = journalPosts_();
  if (posts.length) p.setProperty('LAST_MAILED_POST', posts[0].url);   // only posts published from now on are emailed
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'checkNewBlogPost').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkNewBlogPost').timeBased().everyMinutes(15).create();
  mailerSheet_();
  Logger.log('Blog mailer is on. Newest post now: ' + (posts[0] ? posts[0].title : 'none found') + '. Subscribers: ' + subscribers_().length);
}

/** Run from the editor to email yourself the newest post exactly as guests will get it. */
function testBlogMail() {
  const posts = journalPosts_(); if (!posts.length) throw new Error('No posts found on ' + JOURNAL_URL);
  const me = Session.getEffectiveUser().getEmail();
  const m = journalEmail_(postDetails_(posts[0]), posts.slice(1, 3), { email: me, name: 'Apoorv' });
  MailApp.sendEmail({ to: me, subject: '[Test] ' + m.subject, htmlBody: m.html, body: m.text, name: 'AP Villas & Resorts', replyTo: 'apvillasandresorts@gmail.com' });
}

/** Turn the automation off (run from the editor). */
function stopBlogMailer() { ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'checkNewBlogPost').forEach(t => ScriptApp.deleteTrigger(t)); }

/** The 15-minute check (runs by itself after setupBlogMailer). */
function checkNewBlogPost() {
  const lock = LockService.getScriptLock(); if (!lock.tryLock(5000)) return;
  try {
    const p = PropertiesService.getScriptProperties();
    const queued = p.getProperty('MAIL_QUEUE');
    if (queued) { sendQueue_(JSON.parse(queued)); return; }   // finish a list that ran out of daily emails
    const posts = journalPosts_(); if (!posts.length) return;
    const last = p.getProperty('LAST_MAILED_POST');
    if (!last) { p.setProperty('LAST_MAILED_POST', posts[0].url); return; }
    if (posts[0].url === last) return;
    p.setProperty('LAST_MAILED_POST', posts[0].url);   // set first: a post is never emailed twice
    const to = subscribers_();
    mailerSheet_().appendRow([new Date(), 'New post found', '', to.length + ' subscriber(s)', posts[0].title]);
    if (to.length) sendQueue_({ post: postDetails_(posts[0]), more: posts.slice(1, 3), to, sent: 0 });
  } finally { lock.releaseLock(); }
}

function sendQueue_(q) {
  const p = PropertiesService.getScriptProperties(), log = mailerSheet_();
  while (q.sent < q.to.length) {
    if (MailApp.getRemainingDailyQuota() <= KEEP_FOR_CHECKINS) { p.setProperty('MAIL_QUEUE', JSON.stringify(q)); return; }   // continue tomorrow
    const r = q.to[q.sent];
    try {
      const m = journalEmail_(q.post, q.more, r);
      MailApp.sendEmail({ to: r.email, subject: m.subject, htmlBody: m.html, body: m.text, name: 'AP Villas & Resorts', replyTo: 'apvillasandresorts@gmail.com' });
      log.appendRow([new Date(), 'Sent', r.email, r.name, q.post.title]);
    } catch (err) { log.appendRow([new Date(), 'Failed: ' + String(err && err.message || err).slice(0, 80), r.email, r.name, q.post.title]); }
    q.sent++;
  }
  p.deleteProperty('MAIL_QUEUE');
}

// ---- who gets it: guests who ticked "Email updates" at check-in; their latest choice counts; an unsubscribe always wins ----
function subscribers_() {
  const data = sheet_().getDataRange().getValues(), head = data[0] || [];
  const ei = head.indexOf('Email'), ni = head.indexOf('Main guest'), oi = head.indexOf('Email updates');
  if (ei < 0 || oi < 0) return [];
  const list = new Map(), gone = unsubscribed_();
  for (let i = 1; i < data.length; i++) {
    const email = String(data[i][ei] || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    if (String(data[i][oi]).trim() === 'Yes') list.set(email, String(data[i][ni] || '').trim()); else list.delete(email);
  }
  return [...list].filter(([e]) => !gone.has(e)).map(([email, name]) => ({ email, name }));
}
function unsubscribed_() {
  const sh = mailerSheet_(), out = new Set(); if (sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach(r => { if (r[1] === 'Unsubscribed') out.add(String(r[2]).trim().toLowerCase()); });
  return out;
}
function mailerSheet_() {
  const ss = SpreadsheetApp.openById(SHEET_ID), sh = ss.getSheetByName(MAILER_TAB) || ss.insertSheet(MAILER_TAB);
  if (sh.getLastRow() === 0) { sh.appendRow(MAILER_COLS); sh.setFrozenRows(1); sh.getRange(1, 1, 1, MAILER_COLS.length).setFontWeight('bold').setBackground('#F3EEE3'); }
  return sh;
}

// ---- reading the Journal ----
function journalPosts_() {
  const html = UrlFetchApp.fetch(JOURNAL_URL + '?v=' + Date.now(), { muteHttpExceptions: true }).getContentText();
  const a = html.indexOf('POSTS:START'), b = html.indexOf('POSTS:END'); if (a < 0 || b < 0) return [];
  return html.slice(a, b).split(/<article\b/).slice(1).map(c => {
    const href = (c.match(/href="(blog\/[^"]+\.html)"/) || [])[1], title = strip_((c.match(/<h3>([\s\S]*?)<\/h3>/) || [])[1]);
    if (!href || !title) return null;
    return { url: SITE + '/' + href, slug: href.replace(/^blog\/|\.html$/g, ''), title, excerpt: strip_((c.match(/<p>([\s\S]*?)<\/p>/) || [])[1]), tag: strip_((c.match(/blog-card__tag">([\s\S]*?)</) || [])[1]) };
  }).filter(Boolean);
}
function postDetails_(post) {   // the post's cover photo and its caption/credit, read from the post itself
  const page = UrlFetchApp.fetch(post.url + '?v=' + Date.now(), { muteHttpExceptions: true }).getContentText();
  return Object.assign({}, post, {
    image: (page.match(/<meta property="og:image" content="([^"]+)"/) || [])[1] || '',
    credit: strip_((page.match(/<figcaption>([\s\S]*?)<\/figcaption>/) || [])[1] || ''),
    description: strip_((page.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '') || post.excerpt,
  });
}
function strip_(s) { return String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }

// ---- the email ----
function journalEmail_(post, more, r) {
  const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const utm = u => u + (u.includes('?') ? '&' : '?') + 'utm_source=journal-email&utm_medium=email&utm_campaign=' + encodeURIComponent(post.slug);
  const first = String(r.name || '').trim().split(/\s+/)[0];
  const hello = first ? `Namaste ${esc(first)} ji,` : 'Namaste,';
  const unsub = WEBAPP_URL + '?unsub=1&e=' + encodeURIComponent(r.email) + '&t=' + token_(r.email);
  const wa = 'https://wa.me/' + OWNER.wa + '?text=' + encodeURIComponent('Namaste Apoorv ji, I read "' + post.title + '" on your Journal and would like to plan a visit to Ujjain.');
  const serif = "Georgia,'Times New Roman',serif", sans = "'Helvetica Neue',Arial,sans-serif";
  const moreRows = (more || []).map(m => `
          <tr><td style="padding:12px 0;border-top:1px solid #EDE4D3">
            <a href="${esc(utm(m.url))}" style="font:600 16px/1.35 ${serif};color:#1F4D3A;text-decoration:none">${esc(m.title)}</a>
            <div style="font:13px/1.5 ${sans};color:#6B6458;margin-top:3px">${esc(m.excerpt)}</div>
          </td></tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(post.title)}</title></head>
<body style="margin:0;padding:0;background:#F3EEE3">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(post.description)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3EEE3"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:18px;overflow:hidden;border:1px solid #E6DCC8">
    <tr><td align="center" style="background:#FAF6EE;padding:22px 24px 16px;border-bottom:3px solid #B88A2C">
      <a href="${esc(utm(SITE))}"><img src="${MAIL_LOGO}" width="210" alt="AP Villas &amp; Resorts" style="display:block;width:210px;max-width:70%;height:auto;border:0"></a>
      <div style="font:600 11px/1 ${sans};letter-spacing:3px;color:#8C6512;margin-top:12px">THE AP VILLAS JOURNAL</div>
    </td></tr>
    <tr><td style="padding:26px 30px 6px">
      <div style="font:15px/1.6 ${sans};color:#1A1A1A">${hello}</div>
      <div style="font:15px/1.6 ${sans};color:#4A453D;margin-top:6px">A new guide is up on our Journal, written for pilgrim families planning their next visit to Mahakal.</div>
    </td></tr>
    ${post.image ? `<tr><td style="padding:16px 30px 0"><a href="${esc(utm(post.url))}"><img src="${esc(post.image)}" width="540" alt="${esc(post.credit || post.title)}" style="display:block;width:100%;max-width:540px;height:auto;border-radius:14px;border:0"></a>
      ${post.credit ? `<div style="font:11px/1.45 ${sans};color:#8A8275;margin-top:6px">${esc(post.credit)}</div>` : ''}</td></tr>` : ''}
    <tr><td style="padding:20px 30px 4px">
      ${post.tag ? `<div style="display:inline-block;font:700 10.5px/1 ${sans};letter-spacing:1.6px;text-transform:uppercase;color:#B5532A;background:#FBEDE4;border-radius:999px;padding:6px 11px">${esc(post.tag)}</div>` : ''}
      <h1 style="font:700 27px/1.25 ${serif};color:#1F4D3A;margin:12px 0 10px">${esc(post.title)}</h1>
      <div style="font:15.5px/1.65 ${sans};color:#3A362F">${esc(post.description)}</div>
    </td></tr>
    <tr><td style="padding:20px 30px 6px">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#B5532A;border-radius:999px">
        <a href="${esc(utm(post.url))}" style="display:inline-block;padding:14px 28px;font:700 15px/1 ${sans};color:#FFFFFF;text-decoration:none;letter-spacing:.3px">Read the guide &rarr;</a>
      </td></tr></table>
    </td></tr>
    <tr><td style="padding:18px 30px 4px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F6F2;border-radius:14px"><tr><td style="padding:16px 18px">
        <div style="font:600 15px/1.4 ${serif};color:#1F4D3A">Planning a darshan trip?</div>
        <div style="font:13.5px/1.55 ${sans};color:#4A453D;margin:4px 0 10px">Five private family villas within 2 km of Mahakaleshwar Jyotirlinga. Tell us your dates and we will help you plan.</div>
        <a href="${esc(wa)}" style="font:700 13.5px/1 ${sans};color:#177A40;text-decoration:none">WhatsApp Apoorv for dates &rarr;</a>
      </td></tr></table>
    </td></tr>
    ${moreRows ? `<tr><td style="padding:22px 30px 4px">
      <div style="font:600 11px/1 ${sans};letter-spacing:2.5px;color:#8C6512;margin-bottom:6px">MORE FROM THE JOURNAL</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${moreRows}</table>
    </td></tr>` : ''}
    <tr><td style="padding:22px 30px 26px">
      <div style="font:15px/1.6 ${sans};color:#1A1A1A">With Mahakal's blessings,<br><b>Apoorv</b><br><span style="color:#6B6458">AP Villas &amp; Resorts, Ujjain</span></div>
      <div style="font:italic 15px/1.4 ${serif};color:#B88A2C;margin-top:10px">Where devotion feels at home</div>
    </td></tr>
    <tr><td style="background:#FAF6EE;padding:16px 30px;border-top:1px solid #EDE4D3">
      <div style="font:11.5px/1.6 ${sans};color:#8A8275">You are receiving this because you ticked "Email me new Ujjain travel guides" during your e-check-in with AP Villas &amp; Resorts. We never share your email.<br>
      <a href="${esc(unsub)}" style="color:#8A8275">Unsubscribe</a> &middot; <a href="${esc(utm(SITE + '/blog.html'))}" style="color:#8A8275">All guides</a> &middot; <a href="${esc(utm(SITE))}" style="color:#8A8275">apvillasandresorts.in</a></div>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
  const text = `${first ? 'Namaste ' + first + ' ji,' : 'Namaste,'}\n\nA new guide is up on the AP Villas Journal:\n\n${post.title}\n${post.description}\n\nRead it: ${utm(post.url)}\n\n` +
    (more && more.length ? 'More from the Journal:\n' + more.map(m => '- ' + m.title + ': ' + utm(m.url)).join('\n') + '\n\n' : '') +
    `Planning a darshan trip? WhatsApp Apoorv: ${wa}\n\nWith Mahakal's blessings,\nApoorv · AP Villas & Resorts, Ujjain\n\nYou ticked "Email me new Ujjain travel guides" during e-check-in. Unsubscribe: ${unsub}`;
  return { subject: `New guide: ${post.title}`, html, text };
}

// ---- unsubscribe (two steps, so link scanners in email apps can never unsubscribe anyone by accident) ----
function token_(email) {
  const secret = PropertiesService.getScriptProperties().getProperty('MAILER_SECRET') || '';
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(String(email).trim().toLowerCase(), secret)).replace(/=+$/, '').slice(0, 24);
}
function unsubscribe_(q) {
  const email = String(q.e || '').trim().toLowerCase(), valid = !!email && q.t === token_(email);
  const page = (title, msg, button) => HtmlService.createHtmlOutput(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<div style="max-width:460px;margin:60px auto;padding:30px 26px;font:16px/1.6 Arial,sans-serif;color:#1A1A1A;text-align:center;border:1px solid #E6DCC8;border-radius:16px;background:#FAF6EE">
<img src="${MAIL_LOGO}" width="180" alt="AP Villas &amp; Resorts" style="max-width:60%;height:auto"><h2 style="font-family:Georgia,serif;color:#1F4D3A;margin:16px 0 8px">${title}</h2><p>${msg}</p>${button || ''}</div>`).setTitle('AP Villas Journal').addMetaTag('viewport', 'width=device-width, initial-scale=1');
  if (!valid) return page('This link has expired', 'Please reply to any of our emails with "unsubscribe" and we will remove you right away.');
  if (q.c !== '1') {
    const url = WEBAPP_URL + '?unsub=1&c=1&e=' + encodeURIComponent(email) + '&t=' + encodeURIComponent(q.t);
    return page('Stop Journal emails?', `We will stop emailing new guides to <b>${email.replace(/[<>&"]/g, '')}</b>.`, `<a href="${url}" target="_top" style="display:inline-block;margin-top:6px;background:#B5532A;color:#fff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:999px">Yes, unsubscribe me</a>`);
  }
  if (!unsubscribed_().has(email)) mailerSheet_().appendRow([new Date(), 'Unsubscribed', email, '', '']);
  return page('You are unsubscribed', 'You will not get any more Journal emails from us. Har Har Mahadev, and we hope to host your family again.');
}
