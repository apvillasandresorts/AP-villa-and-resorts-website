/**
 * AP Villas Founder OS · SEO & Marketing module.
 * Google search (Search Console), opportunities, keyword watchlist, blog topic requests (the blog pipeline takes them),
 * campaign links with UTM codes and their GA4 results, an SEO audit of the live site, and a growth checklist.
 * Read-only towards Google and the website: nothing here changes the live site or starts paid advertising.
 */
(function () {
  'use strict';
  var U = window.FoUI, C = U.C, S = U.S, M = U.M;
  var esc = U.esc, $ = U.$, $$ = U.$$, inr = U.inr, dmy = U.dmy, dm = U.dm, when = U.when, toast = U.toast, sel = U.sel;
  function today() { return U.today(); }
  function n0(v) { return Math.round(Number(v) || 0).toLocaleString('en-IN'); }
  function pc(v, d) { return (Math.round((Number(v) || 0) * Math.pow(10, 2 + (d == null ? 1 : d))) / Math.pow(10, d == null ? 1 : d)) + '%'; }
  function delta(now, before, lowerIsBetter) {
    if (!before) return '<span class="flat">no earlier data</span>';
    var ch = (now - before) / before, good = lowerIsBetter ? ch < 0 : ch > 0;
    return '<span class="' + (Math.abs(ch) < 0.005 ? 'flat' : good ? 'up' : 'down') + '">' + (ch > 0 ? '+' : '') + Math.round(ch * 100) + '% vs previous period</span>';
  }
  function kpi(label, value, cmp) { return '<div class="fo-card"><div class="fo-kpi__label">' + esc(label) + '</div><div class="fo-kpi__value">' + value + '</div><div class="fo-kpi__cmp">' + (cmp || '') + '</div></div>'; }
  function card(title, sub, body, tools) { return '<div class="fo-card"><h3>' + esc(title) + (sub ? ' <small>' + esc(sub) + '</small>' : '') + (tools ? '<span class="fo-card__tools">' + tools + '</span>' : '') + '</h3>' + body + '</div>'; }
  function table(head, rows, empty, numCols) {
    if (!rows.length) return '<div class="fo-empty">' + esc(empty || 'Nothing yet.') + '</div>';
    numCols = numCols || [];
    return '<div class="fo-tablewrap"><table class="fo-table"><thead><tr>' + head.map(function (h, i) { return '<th' + (numCols.indexOf(i) >= 0 ? ' class="num"' : '') + '>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return '<td' + (numCols.indexOf(i) >= 0 ? ' class="num"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  function canEdit() { return S.user && (S.user.role === 'founder' || S.user.role === 'manager'); }
  function save(action, body, msg) { return U.api(action, body).then(function (j) { if (!j.ok) { toast(j.error, true); return j; } if (msg) toast(msg); return U.load(true).then(function () { return j; }); }); }
  function pageLink(path) { return path ? '<a href="https://www.apvillasandresorts.in' + esc(path) + '" target="_blank" rel="noopener">' + esc(path) + '</a>' : '<span class="fo-hint">—</span>'; }
  function gscRange() { var n = S.gscDays || 28, to = M.addDays(today(), -1); return { from: M.addDays(to, -(n - 1)), to: to, n: n }; }
  function loading(msg) { return '<div class="fo-loading"><div class="fo-spin"></div><div>' + esc(msg) + '</div></div>'; }
  function notConnected(reason) {
    return '<div class="fo-card"><h3>Search Console is not connected yet</h3><p>' + esc(reason || '') + '</p><ol class="fo-hint" style="line-height:1.7">' +
      '<li>Your site is verified in Google Search Console (done).</li><li>In the Apps Script project, the "View Search Console data" permission must be approved once by the owner and a new version deployed (see Integrations &amp; Automation).</li><li>Then this page fills itself; figures are cached for 6 hours.</li></ol></div>';
  }
  function getGsc() {
    var r = gscRange(), key = r.from + r.to;
    if (S.gscKey === key && S.gsc) return Promise.resolve(S.gsc);
    return U.api('f.gsc', { from: r.from, to: r.to }).then(function (j) { if (!j.ok) throw new Error(j.error); S.gsc = j.gsc; S.gscKey = key; return j.gsc; });
  }

  // ============================================================ view ============================================================
  function viewSeo(page) {
    var T = U.tabs('seo', [['ujjain', 'Ujjain searches'], ['search', 'Google search'], ['opps', 'Opportunities'], ['keywords', 'Keywords'], ['content', 'Blog topics'], ['campaigns', 'Campaigns'], ['audit', 'Site audit'], ['plan', 'Growth checklist']]);
    page.innerHTML = U.hello('SEO & marketing', 'How people find AP Villas on Google, what to improve, what to write next, and which campaigns bring enquiries. Nothing here changes the website or spends money.') + T.html + '<div id="seo"></div>';
    U.wireTabs(page, 'seo');
    ({ ujjain: ujjain, search: search, opps: opps, keywords: keywords, content: content, campaigns: campaigns, audit: audit, plan: plan }[T.cur] || search)($('#seo'));
  }
  function rangeBar(body, redraw) {
    var r = gscRange();
    return '<div class="fo-toolbar">Period ' + sel('gsc-n', [['7', 'Last 7 days'], ['28', 'Last 28 days'], ['90', 'Last 90 days'], ['180', 'Last 6 months']], String(r.n)) + '<span class="fo-hint">' + esc(dmy(r.from)) + ' – ' + esc(dmy(r.to)) + ' · Google\'s figures for the last 2–3 days are still filling in</span></div>';
  }
  function wireRange(body, redraw) { var s = $('#gsc-n'); if (s) s.onchange = function () { S.gscDays = Number(this.value); redraw(body); }; }

  // ---------- Ujjain searches (whole market, not only us) ----------
  function spark(v) {
    if (!v || v.length < 2) return '<span class="fo-hint">—</span>';
    var mx = Math.max.apply(null, v) || 1, w = 90, h = 22, pts = v.map(function (x, i) { return (i / (v.length - 1) * w).toFixed(1) + ',' + (h - x / mx * (h - 2) - 1).toFixed(1); }).join(' ');
    return '<svg class="seo-spark" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
  }
  function ujjain(body) {
    var rows = S.data.search_keywords || [], extra = S.data.search_extra || [], dates = rows.map(function (r) { return String(r.date); }).filter(function (d, i, a) { return a.indexOf(d) === i; }).sort().reverse();
    if (!dates.length) { body.innerHTML = '<div class="fo-empty">No search report yet. The Search demand job runs at 06:15 and 18:15 IST (GitHub Actions → Search demand).</div>'; return; }
    var day = dates.indexOf(S.seoDay) >= 0 ? S.seoDay : dates[0], list = rows.filter(function (r) { return String(r.date) === day; });
    var vol = Number(S.data.settings && S.data.settings.seo_anchor_volume) || 0, anchor = (list[0] || {}).anchor || 'ujjain hotel', perDay = vol / 30;
    var est = function (v) { return vol && v !== '' && v != null ? '≈' + n0(Number(v) / 100 * perDay) : '<span class="fo-hint">—</span>'; };
    var curve = list.filter(function (r) { return r.avg7 !== ''; }).sort(function (a, b) { return Number(b.avg7) - Number(a.avg7); });
    var rising = list.filter(function (r) { return r.rising; }).sort(function (a, b) { return (b.rising === 'Breakout' ? 1e6 : parseInt(String(b.rising).replace(/\D/g, ''), 10) || 0) - (a.rising === 'Breakout' ? 1e6 : parseInt(String(a.rising).replace(/\D/g, ''), 10) || 0); });
    var wiki = extra.filter(function (x) { return x.kind === 'wiki'; }).map(function (x) { var s2 = []; try { s2 = JSON.parse(x.data); } catch (e) {} return { key: x.key, series: s2 }; }).filter(function (w) { return w.series.some(function (p) { return p[1] > 0; }); });
    var sugg = {}; extra.filter(function (x) { return x.kind === 'suggest'; }).forEach(function (x) { (sugg[x.key] = sugg[x.key] || []).push(x.data); });
    var wikiTot = function (i) { return wiki.reduce(function (a, w) { var p = w.series[w.series.length - 1 - i]; return a + (p ? Number(p[1]) : 0); }, 0); };
    var w7 = [0, 1, 2, 3, 4, 5, 6].reduce(function (a, i) { return a + wikiTot(i); }, 0) / 7, w30 = 0; for (var i = 7; i < 37; i++) w30 += wikiTot(i); w30 /= 30;
    var gU = list.filter(function (r) { return r.keyword === 'ujjain'; })[0], gH = list.filter(function (r) { return r.keyword === anchor; })[0];
    var tracked = (S.data.seo_keywords || []).map(function (k) { return k.keyword; }), ed = canEdit();
    body.innerHTML = '<div class="fo-toolbar">Report ' + sel('seo-day', dates.map(function (d) { return [d, dmy(d)]; }), day) + '<button class="btn btn--sm" id="seo-kcsv">Export CSV</button>' +
      '<span class="fo-hint">Whole-market Google searches in India around Ujjain (not only searches that showed our site). Source: Google Trends, Google Autocomplete, Wikipedia pageviews.</span></div>' +
      '<div class="fo-grid fo-grid--kpi">' +
      kpi('"ujjain" searches, last 7 days', gU && gU.change !== '' ? (gU.change > 0 ? '+' : '') + gU.change + '%' : '—', '<span class="flat">vs its 30-day average (Google Trends)</span>') +
      kpi('"' + anchor + '" searches', gH && gH.change !== '' ? (gH.change > 0 ? '+' : '') + gH.change + '%' : '—', '<span class="flat">stay intent, vs 30-day average</span>') +
      kpi('People reading about Ujjain', wiki.length ? n0(wikiTot(0)) : '—', '<span class="flat">' + (wiki.length ? 'exact Wikipedia readers, latest day · 7-day avg ' + n0(w7) + (w30 ? ' (' + (w7 >= w30 ? '+' : '') + Math.round((w7 / w30 - 1) * 100) + '% vs 30 days)' : '') : 'no data') + '</span>') +
      kpi('Rising searches', String(rising.length), '<span class="flat">new or fast-growing on Google</span>') + '</div>' +
      '<div class="fo-card" style="margin-top:14px"><h3>Most searched around Ujjain <small>daily interest on one scale: "' + esc(anchor) + '" average = 100</small></h3>' +
      table(['Search', 'Where', 'Latest day', '7-day avg', 'vs 30 days', '30 days', 'Est. searches / day', ''], curve.map(function (r) {
        var ser = []; try { ser = JSON.parse(r.series || '[]'); } catch (e) {}
        return ['<b>' + esc(r.keyword) + '</b>', '<small class="fo-hint">' + esc(r.kinds) + '</small>', esc(r.latest) + (r.latest_date ? ' <small class="fo-hint">' + dm(r.latest_date) + '</small>' : ''), '<b>' + esc(r.avg7) + '</b>',
          r.change === '' ? '—' : '<span class="' + (Number(r.change) > 2 ? 'up' : Number(r.change) < -2 ? 'down' : 'flat') + '">' + (r.change > 0 ? '+' : '') + esc(r.change) + '%</span>', spark(ser), est(r.avg7),
          ed && tracked.indexOf(r.keyword) < 0 ? '<button class="btn btn--sm" data-track="' + esc(r.keyword) + '">Track</button>' : tracked.indexOf(r.keyword) >= 0 ? '<span class="fo-badge">tracked</span>' : ''];
      }), 'No daily curves in this report.', [2, 3, 4, 6]) +
      '<p class="fo-hint">Google does not publish exact search counts for any keyword (not even to advertisers per day). Trends gives each search\'s daily interest relative to the others, so 200 means searched about twice as often as "' + esc(anchor) + '". ' +
      (vol ? 'Estimates use your Keyword Planner figure of ' + n0(vol) + ' searches a month for "' + esc(anchor) + '" (ESTIMATE).' : 'Add the monthly searches for "' + esc(anchor) + '" from Google Ads Keyword Planner below to see estimated searches per day.') + ' Track sends a keyword to the Keywords tab, where Search Console records your Google position for it daily.</p>' +
      (S.user && S.user.role === 'founder' ? '<div class="fo-toolbar"><label class="fo-hint">Keyword Planner monthly searches for "' + esc(anchor) + '" <input class="fo-input" id="seo-vol" type="number" min="0" step="10" value="' + (vol || '') + '" style="width:120px"></label><button class="btn btn--sm" id="seo-vol-save">Save</button></div>' : '') + '</div>' +
      '<div class="fo-grid fo-grid--2" style="margin-top:14px">' +
      card('Rising searches', 'growth vs the period before (Breakout = more than +5000%)', table(['Search', 'Growth', 'Seen in'], rising.slice(0, 30).map(function (r) { return ['<b>' + esc(r.keyword) + '</b>' + (ed && tracked.indexOf(r.keyword) < 0 ? ' <button class="btn btn--sm" data-track="' + esc(r.keyword) + '">Track</button>' : ''), '<b class="up">' + esc(r.rising) + '</b>', '<small class="fo-hint">' + esc(r.kinds) + '</small>']; }), 'Nothing rising in this report.')) +
      card('What people type into Google', 'Google Autocomplete, India', Object.keys(sugg).length ? Object.keys(sugg).map(function (k) { return '<p style="margin:6px 0 2px"><b>' + esc(k) + '…</b></p><div class="dk-ladder">' + sugg[k].map(function (p) { return '<span>' + esc(p) + '</span>'; }).join('') + '</div>'; }).join('') : '<div class="fo-empty">No phrases in this report.</div>') + '</div>' +
      (wiki.length ? '<div class="fo-card" style="margin-top:14px"><h3>People reading about Ujjain each day <small>exact Wikipedia pageviews (official Wikimedia API)</small></h3><div class="fo-chartbox" id="seo-wiki"></div></div>' : '');
    $('#seo-day').onchange = function () { S.seoDay = this.value; ujjain(body); };
    $$('[data-track]', body).forEach(function (b) { b.onclick = function () { save('f.seo.keyword.save', { record: { keyword: b.dataset.track, notes: 'from Ujjain searches ' + day } }, 'Now tracking "' + b.dataset.track + '"').then(function () { ujjain(body); }); }; });
    var vs = $('#seo-vol-save'); if (vs) vs.onclick = function () { save('f.settings.save', { settings: { seo_anchor_volume: $('#seo-vol').value } }, 'Saved').then(function () { ujjain(body); }); };
    $('#seo-kcsv').onclick = function () { U.csvDownload('ujjain-searches-' + day, ['keyword', 'where', 'latest_day', 'latest', 'avg7', 'change_vs_30d_pct', 'rising', 'est_searches_per_day'], list.map(function (r) { return [r.keyword, r.kinds, r.latest_date, r.latest, r.avg7, r.change, r.rising, vol && r.avg7 !== '' ? Math.round(Number(r.avg7) / 100 * perDay) : '']; })); };
    if (wiki.length) {
      var labels = wiki[0].series.slice(-60).map(function (p) { return dm(p[0]); }), cols = ['#2F7D4F', '#C9A227', '#7A5C99', '#C0604A', '#3C7DB0'];
      C.combo($('#seo-wiki'), { labels: labels, kind: 'n', series: wiki.map(function (w, i) { return { name: w.key.replace(/_/g, ' '), values: w.series.slice(-60).map(function (p) { return p[1]; }), color: cols[i % cols.length], type: 'line' }; }) });
    }
  }

  // ---------- Google search ----------
  function search(body) {
    body.innerHTML = rangeBar() + '<div id="gsc-b">' + loading('Asking Google Search Console…') + '</div>';
    wireRange(body, search);
    getGsc().then(function (g) {
      var b = $('#gsc-b'); if (!b) return;
      if (!g.connected) { b.innerHTML = notConnected(g.reason); return; }
      var t = g.totals, p = g.previous;
      b.innerHTML = '<div class="fo-grid fo-grid--kpi">' + kpi('Clicks from Google', n0(t.clicks), delta(t.clicks, p.clicks)) + kpi('Times shown in Google', n0(t.impressions), delta(t.impressions, p.impressions)) +
        kpi('Click-through rate', pc(t.ctr), delta(t.ctr, p.ctr)) + kpi('Average position', String(t.position || '—'), delta(t.position, p.position, true) + ' <small class="fo-hint">(lower is better)</small>') + kpi('Different searches', n0(g.query_count), '<span class="flat">queries that showed your site</span>') + '</div>' +
        '<div class="fo-grid fo-grid--2" style="margin-top:14px">' + card('Clicks and impressions per day', '', '<div class="fo-chartbox" id="gsc-d"></div>') + card('Devices', 'clicks', '<div class="fo-chartbox" id="gsc-dev"></div>') + '</div>' +
        '<div class="fo-grid fo-grid--2" style="margin-top:14px">' +
        card('Top searches', 'what people typed', table(['Search', 'Clicks', 'Shown', 'CTR', 'Position'], g.queries.slice(0, 40).map(function (q) { return [esc(q.query), n0(q.clicks), n0(q.impressions), pc(q.ctr), q.position]; }), 'No searches yet.', [1, 2, 3, 4]), '<button class="btn btn--sm" id="gsc-qcsv">CSV</button>') +
        card('Top pages', 'landing pages from Google', table(['Page', 'Clicks', 'Shown', 'CTR', 'Position'], g.pages.slice(0, 40).map(function (x) { return [pageLink(x.path), n0(x.clicks), n0(x.impressions), pc(x.ctr), x.position]; }), 'No pages yet.', [1, 2, 3, 4]), '<button class="btn btn--sm" id="gsc-pcsv">CSV</button>') + '</div>' +
        '<p class="fo-hint">Source: Google Search Console, property ' + esc(g.site) + '. Fetched ' + when(g.fetched_at) + ' (cached 6 hours). Search Console counts searches and clicks on Google; bookings are counted in your ledger.</p>';
      C.combo($('#gsc-d'), { labels: g.daily.map(function (d) { return dm(d.date); }), kind: 'n', series: [{ name: 'Impressions', values: g.daily.map(function (d) { return d.impressions; }), color: '#D9CBAA' }, { name: 'Clicks', values: g.daily.map(function (d) { return d.clicks; }), type: 'line', color: '#1F4D3A' }] });
      C.donut($('#gsc-dev'), g.devices.map(function (d) { return { label: d.device.toLowerCase(), value: d.clicks }; }), { kind: 'n', centerLabel: 'clicks' });
      $('#gsc-qcsv').onclick = function () { U.csvDownload('ap-villas-google-searches-' + g.from + '-' + g.to, ['query', 'clicks', 'impressions', 'ctr', 'position'], g.queries.map(function (q) { return [q.query, q.clicks, q.impressions, q.ctr, q.position]; })); };
      $('#gsc-pcsv').onclick = function () { U.csvDownload('ap-villas-google-pages-' + g.from + '-' + g.to, ['page', 'clicks', 'impressions', 'ctr', 'position'], g.pages.map(function (q) { return [q.path, q.clicks, q.impressions, q.ctr, q.position]; })); };
    }).catch(function (e) { var b = $('#gsc-b'); if (b && e.message !== 'signed out') b.innerHTML = '<div class="fo-empty">' + esc(e.message) + '</div>'; });
  }

  // ---------- opportunities ----------
  function opps(body) {
    body.innerHTML = rangeBar() + '<div id="gsc-b">' + loading('Finding opportunities…') + '</div>';
    wireRange(body, opps);
    getGsc().then(function (g) {
      var b = $('#gsc-b'); if (!b) return;
      if (!g.connected) { b.innerHTML = notConnected(g.reason); return; }
      var o = g.opportunities, ed = canEdit(), queued = (S.data.seo_topics || []).map(function (t) { return t.keyword; }), watched = (S.data.seo_keywords || []).map(function (k) { return k.keyword; });
      var acts = function (q) { return ed ? (queued.indexOf(q) >= 0 ? '<span class="fo-badge fo-badge--muted">topic queued</span>' : '<button class="btn btn--sm" data-topic="' + esc(q) + '">+ Blog topic</button>') + ' ' + (watched.indexOf(q) >= 0 ? '' : '<button class="btn btn--sm" data-watch="' + esc(q) + '">+ Watch</button>') : ''; };
      b.innerHTML = '<div class="fo-note" style="margin-bottom:14px"><b>How to use this:</b> these come from what Google already shows your site for. A query on page 1–2 with many impressions is the cheapest win: improve the page that ranks, or queue a focused blog post. Use “+ Blog topic” and the blog pipeline will write it next.</div>' +
        card('Almost there: searches where you rank 4–20', 'biggest first', table(['Search', 'Shown', 'Clicks', 'Position', 'Page Google shows', 'What to do', ''], o.striking.map(function (x) { return [esc(x.query), n0(x.impressions), n0(x.clicks), x.position, pageLink(x.page), '<small>' + esc(x.action) + '</small>', acts(x.query)]; }), 'No queries between positions 4 and 20 with enough impressions yet.', [1, 2, 3])) +
        '<div style="height:14px"></div>' + card('Shown but rarely clicked', 'rewrite title and description', table(['Page', 'Shown', 'Clicks', 'CTR', 'Typical CTR at this position', 'Position'], o.low_ctr.map(function (x) { return [pageLink(x.path), n0(x.impressions), n0(x.clicks), pc(x.ctr), pc(x.expected_ctr, 0), x.position]; }), 'No page stands out: titles and descriptions are earning normal clicks.', [1, 2, 3, 4, 5])) +
        '<div style="height:14px"></div>' + card('Questions people ask', 'answer them in FAQs and posts', table(['Question / search', 'Shown', 'Clicks', 'Position', ''], o.questions.map(function (x) { return [esc(x.query), n0(x.impressions), n0(x.clicks), x.position, acts(x.query)]; }), 'No question-style searches yet.', [1, 2, 3]));
      $$('[data-topic]', b).forEach(function (x) { x.onclick = function () { save('f.seo.topic.save', { record: { title: '', keyword: x.dataset.topic, source: 'search console', priority: 'high', notes: 'From Search Console opportunities on ' + today() } }, 'Topic queued for the blog'); }; });
      $$('[data-watch]', b).forEach(function (x) { x.onclick = function () { save('f.seo.keyword.save', { record: { keyword: x.dataset.watch } }, 'Added to the keyword watchlist'); }; });
    }).catch(function (e) { var b = $('#gsc-b'); if (b && e.message !== 'signed out') b.innerHTML = '<div class="fo-empty">' + esc(e.message) + '</div>'; });
  }

  // ---------- keyword watchlist ----------
  function keywords(body) {
    var kws = S.data.seo_keywords || [], ranks = S.data.seo_ranks || [], ed = canEdit();
    var last = function (k) { var r = ranks.filter(function (x) { return x.keyword === k; }); return r[r.length - 1]; };
    var first = function (k) { return ranks.filter(function (x) { return x.keyword === k && x.position !== ''; })[0]; };
    body.innerHTML = (ed ? '<div class="fo-toolbar"><input class="fo-input" id="kw-new" placeholder="Add a keyword, e.g. villa near mahakaleshwar" style="min-width:280px"><input class="fo-input" id="kw-page" placeholder="Target page (optional), e.g. /villas.html"><button class="btn btn--primary" id="kw-add">+ Watch keyword</button></div>' : '') +
      '<p class="fo-hint">Each morning the Founder OS records each keyword\'s average Google position over the last 7 days of Search Console data. A blank position means Google did not show your site for that exact search.</p>' +
      table(['Keyword', 'Target page', 'Position now', 'First recorded', 'Shown (7 days)', 'Clicks (7 days)', 'Checked', ''], kws.map(function (k) {
        var l = last(k.keyword), f = first(k.keyword);
        return ['<b>' + esc(k.keyword) + '</b>' + (k.status === 'paused' ? ' <span class="fo-badge fo-badge--muted">paused</span>' : ''), k.target_page ? pageLink(k.target_page) : '<span class="fo-hint">—</span>', l && l.position !== '' ? '<b>' + esc(l.position) + '</b>' : '<span class="fo-hint">not shown</span>', f ? esc(f.position) + ' <small class="fo-hint">' + dm(f.date) + '</small>' : '—', l ? n0(l.impressions) : '—', l ? n0(l.clicks) : '—', l ? dm(l.date) : '<span class="fo-hint">tomorrow</span>', ed ? '<button class="btn btn--sm btn--danger" data-del="' + esc(k.keyword_id) + '">✕</button>' : ''];
      }), 'No keywords yet. Add the searches you most want to win (e.g. “villa near mahakaleshwar”, “ujjain family stay”).', [2, 4, 5]) +
      '<div class="fo-card" style="margin-top:14px"><h3>Position over time <small>lower is better</small></h3><div class="fo-toolbar">' + sel('kw-pick', kws.map(function (k) { return [k.keyword, k.keyword]; }), S.kwPick || (kws[0] || {}).keyword || '') + '</div><div class="fo-chartbox" id="kw-chart"></div></div>';
    var pick = S.kwPick || (kws[0] || {}).keyword, rr = ranks.filter(function (x) { return x.keyword === pick && x.position !== ''; });
    C.combo($('#kw-chart'), { labels: rr.map(function (x) { return dm(x.date); }), kind: 'n', series: [{ name: 'Position', values: rr.map(function (x) { return Number(x.position); }), type: 'line', color: '#C0531A' }], empty: 'Positions appear here from the morning after you add a keyword.' });
    var kp = $('#kw-pick'); if (kp) kp.onchange = function () { S.kwPick = this.value; keywords(body); };
    if (!ed) return;
    $('#kw-add').onclick = function () { var v = $('#kw-new').value.trim(); if (!v) return toast('Type a keyword.', true); save('f.seo.keyword.save', { record: { keyword: v, target_page: $('#kw-page').value.trim() } }, 'Keyword added').then(function () { keywords(body); }); };
    $$('[data-del]', body).forEach(function (b) { b.onclick = function () { if (confirm('Stop watching this keyword?')) save('f.seo.keyword.delete', { id: b.dataset.del }, 'Removed').then(function () { keywords(body); }); }; });
  }

  // ---------- blog topic requests ----------
  var TOPIC_FIELDS = [['title', 'Topic or working title', 'text'], ['keyword', 'Main search phrase (keyword)', 'text'], ['intent', 'Kind of search', ['informational', 'commercial', 'local', 'festival']], ['priority', 'Priority', ['high', 'normal', 'low']], ['status', 'Status', ['queued', 'in_progress', 'published', 'skipped']], ['source', 'Came from', ['manual', 'search console', 'advisor', 'research']], ['notes', 'Notes for the writer (angle, facts to include)', 'area']];
  function content(body) {
    var list = (S.data.seo_topics || []).filter(function (t) { return t.status !== 'suggested'; }).sort(function (a, b) { var o = { approved: 0, queued: 0, in_progress: 1, written: 1, review: 1, failed: 1, published: 2, skipped: 3 }; return (o[a.status] - o[b.status]) || ({ high: 0, normal: 1, low: 2 }[a.priority] - { high: 0, normal: 1, low: 2 }[b.priority]) || (a.created_at < b.created_at ? -1 : 1); }), ed = canEdit();
    body.innerHTML = '<div class="fo-note" style="margin-bottom:14px"><b>How it works:</b> the blog pipeline (Mon, Wed, Fri at 6 AM, or “/new-post” in Claude Code) takes the first queued topic, high priority first, writes the post with sources and Hindi narration, checks it, and asks you before publishing. Topics are used once the automation key is set (Settings → Automation); until then the pipeline picks its own timely topic.</div>' +
      (ed ? '<div class="fo-toolbar"><button class="btn btn--primary" id="tp-add">+ Request a blog topic</button></div>' : '') +
      table(['Topic', 'Keyword', 'Kind', 'Priority', 'Status', 'From', 'Requested', ''], list.map(function (t) {
        return ['<b>' + esc(t.title || t.keyword) + '</b>' + (t.notes ? '<br><small class="fo-hint">' + esc(t.notes.slice(0, 120)) + '</small>' : ''), esc(t.keyword), esc(t.intent), '<span class="fo-badge' + (t.priority === 'high' ? '' : ' fo-badge--muted') + '">' + esc(t.priority) + '</span>',
          t.status === 'published' && t.slug ? '<a href="https://www.apvillasandresorts.in/blog/' + esc(t.slug) + '.html" target="_blank" rel="noopener">published ↗</a>' : esc(t.status.replace('_', ' ')), esc(t.source), dm(String(t.created_at).slice(0, 10)), ed ? '<button class="btn btn--sm" data-edit="' + esc(t.topic_id) + '">Edit</button> <button class="btn btn--sm btn--danger" data-del="' + esc(t.topic_id) + '">✕</button>' : ''];
      }), 'No topics requested yet. Add one, or use “+ Blog topic” on the Opportunities tab.');
    if (!ed) return;
    $('#tp-add').onclick = function () { form({ priority: 'normal', intent: 'informational', status: 'queued', source: 'manual' }); };
    $$('[data-edit]', body).forEach(function (b) { b.onclick = function () { form(list.filter(function (t) { return t.topic_id === b.dataset.edit; })[0]); }; });
    $$('[data-del]', body).forEach(function (b) { b.onclick = function () { if (confirm('Delete this topic request?')) save('f.seo.topic.delete', { id: b.dataset.del }, 'Deleted').then(function () { content(body); }); }; });
    function form(rec) {
      var p = U.drawer('<div class="fo-drawer__head"><h2 class="serif" style="font-size:24px">Blog topic</h2><button class="fo-iconbtn" data-close aria-label="Close">' + U.icon('x') + '</button></div><form class="fo-form" novalidate>' + fields(TOPIC_FIELDS, rec) + '<div class="full"><div class="fo-msg" id="tf-msg"></div><button class="btn btn--primary" type="submit">Save</button></div></form>');
      $('form', p).onsubmit = function (e) {
        e.preventDefault(); var o = collect(this); if (rec.topic_id) o.topic_id = rec.topic_id;
        U.api('f.seo.topic.save', { record: o }).then(function (j) { if (!j.ok) { $('#tf-msg', p).textContent = j.error; return; } p.parentNode.remove(); toast('Saved'); U.load(true).then(function () { content(body); }); });
      };
    }
  }
  function fields(list, rec) {
    return list.map(function (f) {
      var v = rec[f[0]] == null ? '' : rec[f[0]];
      if (Array.isArray(f[2])) return '<label class="fo-field">' + esc(f[1]) + '<select name="' + f[0] + '">' + f[2].map(function (o) { return '<option' + (String(v) === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select></label>';
      if (f[2] === 'area') return '<label class="fo-field full">' + esc(f[1]) + '<textarea name="' + f[0] + '" rows="3">' + esc(v) + '</textarea></label>';
      return '<label class="fo-field">' + esc(f[1]) + '<input name="' + f[0] + '" type="' + f[2] + '" value="' + esc(v) + '"></label>';
    }).join('');
  }
  function collect(fm) { var o = {}; $$('input,select,textarea', fm).forEach(function (el) { if (el.name) o[el.name] = el.value; }); return o; }

  // ---------- campaigns ----------
  var CH = [['whatsapp', 'WhatsApp'], ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['google_business', 'Google Business Profile'], ['google_ads', 'Google Ads (paid)'], ['email', 'Email / journal'], ['print', 'Print / QR code'], ['partner', 'Partner / referral'], ['other', 'Other']];
  var CAMP_FIELDS = [['name', 'Campaign name', 'text'], ['channel', 'Channel', CH.map(function (c) { return c[0]; })], ['landing_url', 'Landing page (on www.apvillasandresorts.in)', 'url'], ['utm_campaign', 'Campaign code (auto from the name)', 'text'], ['start', 'Start', 'date'], ['end', 'End', 'date'], ['budget', 'Budget ₹ (0 for free channels)', 'number'], ['spent', 'Spent so far ₹', 'number'], ['status', 'Status', ['planned', 'live', 'ended']], ['notes', 'Notes', 'area']];
  function utmUrl(c) { var u = c.landing_url || 'https://www.apvillasandresorts.in/'; return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'utm_source=' + encodeURIComponent(c.utm_source) + '&utm_medium=' + encodeURIComponent(c.utm_medium) + '&utm_campaign=' + encodeURIComponent(c.utm_campaign); }
  function campaigns(body) {
    var list = S.data.campaigns || [], ed = canEdit(), r = U.currentRange(), to = r.to > today() ? today() : r.to;
    body.innerHTML = '<div class="fo-note" style="margin-bottom:14px"><b>Tracked links:</b> create a campaign, then share its tracked link (WhatsApp status, Instagram bio, a QR code at the villa, an email). GA4 then shows the visits and enquiries each one brought. Paid ads are never started from here; a Google Ads budget needs your decision first.</div>' +
      (ed ? '<div class="fo-toolbar"><button class="btn btn--primary" id="cp-add">+ New campaign</button></div>' : '') +
      table(['Campaign', 'Channel', 'Dates', 'Budget / spent', 'Tracked link', 'Status', ''], list.map(function (c) {
        return ['<b>' + esc(c.name) + '</b><br><small class="fo-hint">' + esc(c.utm_campaign) + '</small>', esc((CH.filter(function (x) { return x[0] === c.channel; })[0] || [0, c.channel])[1]), (c.start ? dm(c.start) : '—') + ' → ' + (c.end ? dm(c.end) : '—'), (c.budget !== '' ? inr(Number(c.budget)) : '—') + ' / ' + (c.spent !== '' ? inr(Number(c.spent)) : '—'),
          '<input class="fo-input" readonly value="' + esc(utmUrl(c)) + '" style="min-width:220px;font-size:12px" data-copy> ', esc(c.status), ed ? '<button class="btn btn--sm" data-edit="' + esc(c.campaign_id) + '">Edit</button> <button class="btn btn--sm btn--danger" data-del="' + esc(c.campaign_id) + '">✕</button>' : ''];
      }), 'No campaigns yet. Start with free ones: a WhatsApp status link, your Instagram bio link and a QR card in each villa.') +
      '<div class="fo-card" style="margin-top:14px"><h3>Results from Google Analytics <small>' + esc(dmy(r.from)) + ' – ' + esc(dmy(to)) + ' (top date range)</small></h3><div id="cp-res">' + loading('Asking Google Analytics…') + '</div></div>';
    $$('[data-copy]', body).forEach(function (i) { i.onclick = function () { i.select(); try { navigator.clipboard.writeText(i.value).then(function () { toast('Link copied'); }); } catch (e) {} }; });
    if (ed) {
      $('#cp-add').onclick = function () { form({ channel: 'whatsapp', status: 'planned', landing_url: 'https://www.apvillasandresorts.in/', start: today() }); };
      $$('[data-edit]', body).forEach(function (b) { b.onclick = function () { form(list.filter(function (c) { return c.campaign_id === b.dataset.edit; })[0]); }; });
      $$('[data-del]', body).forEach(function (b) { b.onclick = function () { if (confirm('Delete this campaign? Its GA4 history stays in Google Analytics.')) save('f.campaign.delete', { id: b.dataset.del }, 'Deleted').then(function () { campaigns(body); }); }; });
    }
    if (r.from > today()) { $('#cp-res').innerHTML = '<div class="fo-empty">Choose a past date range at the top to see results.</div>'; return; }
    U.api('f.campaign.report', { from: r.from, to: to }).then(function (j) {
      var box = $('#cp-res'); if (!box) return;
      if (!j.ok) { box.innerHTML = '<div class="fo-empty">' + esc(j.error) + '</div>'; return; }
      var rep = j.report; if (!rep.connected) { box.innerHTML = '<div class="fo-empty">' + esc(rep.reason) + '</div>'; return; }
      var spend = {}; list.forEach(function (c) { spend[c.utm_campaign] = Number(c.spent) || 0; });
      box.innerHTML = table(['Campaign (GA4)', 'Source / medium', 'Visits', 'Engaged', 'Enquiries', 'WhatsApp clicks', 'Booking-intent actions', 'Cost per action'], rep.rows.map(function (x) {
        var s = spend[x.campaign] || 0; return [esc(x.campaign === '(not set)' ? '(no campaign: normal visits)' : x.campaign), '<small>' + esc(x.source_medium.slice(0, 3).join(', ')) + '</small>', n0(x.sessions), n0(x.engaged), n0(x.enquiries), n0(x.whatsapp), '<b>' + n0(x.intent) + '</b>', s && x.intent ? inr(Math.round(s / x.intent)) : '—'];
      }), 'No visits in this period.', [2, 3, 4, 5, 6, 7]) + '<p class="fo-hint">Booking-intent actions = enquiry forms sent + WhatsApp + call clicks. Bookings themselves are confirmed on WhatsApp, so they are in your ledger, not here.</p>';
    });
    function form(rec) {
      var p = U.drawer('<div class="fo-drawer__head"><h2 class="serif" style="font-size:24px">Campaign</h2><button class="fo-iconbtn" data-close aria-label="Close">' + U.icon('x') + '</button></div><form class="fo-form" novalidate>' + fields(CAMP_FIELDS, rec) + '<div class="full"><div class="fo-msg" id="cf-msg"></div><button class="btn btn--primary" type="submit">Save</button></div></form>');
      $('form', p).onsubmit = function (e) {
        e.preventDefault(); var o = collect(this); if (rec.campaign_id) o.campaign_id = rec.campaign_id;
        U.api('f.campaign.save', { record: o }).then(function (j) { if (!j.ok) { $('#cf-msg', p).textContent = j.error; return; } p.parentNode.remove(); toast('Saved'); U.load(true).then(function () { campaigns(body); }); });
      };
    }
  }

  // ---------- site audit ----------
  function audit(body, refresh) {
    body.innerHTML = '<div class="fo-toolbar">' + (canEdit() ? '<button class="btn btn--primary" id="au-run">Run the audit again</button>' : '') + '<span class="fo-hint">Checks every page in the sitemap of the live site: title, description, headings, canonical link, share image, structured data and image alt text.</span></div><div id="au-b">' + loading('Checking every page of the live site… (about 20 seconds)') + '</div>';
    var rb = $('#au-run'); if (rb) rb.onclick = function () { audit(body, true); };
    U.api('f.seo.audit', { refresh: !!refresh }).then(function (j) {
      var b = $('#au-b'); if (!b) return;
      if (!j.ok) { b.innerHTML = '<div class="fo-empty">' + esc(j.error) + '</div>'; return; }
      var a = j.audit, s = a.summary, sev = { high: 'fo-badge--warn', medium: '', low: 'fo-badge--muted' };
      var pages = a.pages.slice().sort(function (x, y) { var w = function (p) { return p.issues.reduce(function (n, i) { return n + ({ high: 100, medium: 10, low: 1 }[i[0]]); }, 0); }; return w(y) - w(x); });
      b.innerHTML = '<div class="fo-grid fo-grid--kpi">' + kpi('Pages checked', String(s.pages)) + kpi('Serious issues', String(s.high), '<span class="' + (s.high ? 'down' : 'up') + '">' + (s.high ? 'fix first' : 'none') + '</span>') + kpi('Medium', String(s.medium)) + kpi('Minor', String(s.low)) + kpi('Clean pages', String(s.clean)) +
        kpi('Sitemap & robots.txt', (a.sitemap_ok ? '✓' : '✕') + ' / ' + (a.robots_ok ? '✓' : '✕')) + '</div>' +
        '<div class="fo-card" style="margin-top:14px">' + table(['Page', 'Title', 'Words', 'Issues'], pages.map(function (p) {
          return [pageLink(p.path), '<small>' + esc(p.title || '—') + ' <span class="fo-hint">(' + p.title_len + ')</span></small>', String(p.words), p.issues.length ? p.issues.map(function (i) { return '<span class="fo-badge ' + sev[i[0]] + '">' + esc(i[0]) + '</span> ' + esc(i[1]); }).join('<br>') : '<span class="fo-badge">clean</span>'];
        }), 'No pages found in the sitemap.', [2]) + '<p class="fo-hint">Checked ' + when(a.at) + '. To fix pages, ask Claude Code (for example: “fix the SEO audit issues”); the website is changed only after you approve.</p></div>';
    });
  }

  // ---------- growth checklist ----------
  var PLAN = [
    ['Google Search Console connected and the sitemap submitted', 'Done 23 Oct 2026. Google reads the sitemap regularly.', 'done'],
    ['Google Business Profile for each villa (or one for AP Villas & Resorts)', 'The single biggest free source of local bookings: appears in Google Maps and “stay near Mahakal” searches. Correct the Rudrangan pin, add real photos, hours, WhatsApp link, and ask happy guests for reviews.', 'owner'],
    ['OTA listings say the same things as the website', 'Shuttle, breakfast, caretaker, Bhasma Aarti help and “within 2 km” in titles and first photos on Airbnb, Booking.com and MakeMyTrip.', 'owner'],
    ['Watch 10–15 keywords', 'Keywords tab: “villa near mahakaleshwar”, “ujjain family stay”, “stay near mahakal temple”, festival searches.', 'portal'],
    ['Queue blog topics from real searches', 'Opportunities tab → “+ Blog topic”. The pipeline writes three posts a week.', 'portal'],
    ['Fix the site audit issues', 'Site audit tab, then ask Claude Code to fix them.', 'claude'],
    ['Tracked links for every free channel', 'Campaigns tab: WhatsApp status, Instagram bio, QR cards in the villas, journal emails.', 'portal'],
    ['Decide on paid search (Google Ads)', 'Optional and paid: only after the free channels are running. Start small on festival dates with a fixed daily budget; track it here as a google_ads campaign.', 'decision'],
  ];
  function plan(body) {
    var who = { done: ['done', ''], owner: ['you', 'fo-badge--gold'], portal: ['here', ''], claude: ['Claude Code', 'fo-badge--muted'], decision: ['your decision', 'fo-badge--warn'] };
    body.innerHTML = '<div class="fo-card"><h3>SEO and marketing growth checklist <small>free first, paid only by decision</small></h3>' + table(['Step', 'Why / how', 'Who'], PLAN.map(function (p) { return ['<b>' + esc(p[0]) + '</b>', '<small>' + esc(p[1]) + '</small>', '<span class="fo-badge ' + who[p[2]][1] + '">' + esc(who[p[2]][0]) + '</span>']; }), '') +
      '<p class="fo-hint">Ask the Business Advisor (claude.ai project) for a monthly SEO plan; carry its decisions here with “/decision” in Claude Code.</p></div>';
  }

  U.VIEWS.seo = viewSeo;
})();
