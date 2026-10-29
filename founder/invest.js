/**
 * AP Villas Founder OS · Investments (Founder OS Markets, free build). Founder-only.
 * Dashboard · My portfolio (real holdings, valued in this browser) · Rankings · Asset · Gold & silver · IPOs · Paper trading ·
 * Investing options (risk profile, model portfolios, goal planner) · Model health · Academy · Settings.
 * Data: the daily snapshot from the private ap-markets engine (NSE, IBJA, AMFI, FRED) + your own entries. Paper only, no live orders.
 */
(function () {
  'use strict';
  var U = window.FoUI, S = U.S, C = U.C, K = window.FoInvCalc, A = window.FoInvAcademy;
  var esc = U.esc, $ = U.$, $$ = U.$$, inr = U.inr, toast = U.toast, sel = U.sel, pct = K.pct, sg = K.signed;
  var I = { data: null, loading: false, asset: null, acct: null, filter: { q: '', sector: 'all', min: 0, sort: 'rank' }, quiz: null };
  var KIND = { stock: 'Stock', etf: 'ETF', mf: 'Mutual fund', gold: 'Physical gold', silver: 'Physical silver', sgb: 'Sovereign Gold Bond', fd: 'Fixed deposit', rd: 'Recurring deposit', ppf: 'PPF', epf: 'EPF / VPF', nps: 'NPS', bond: 'Bond / RBI bond', cash: 'Cash / savings', property: 'Property', other: 'Other' };
  var CLS = { equity: 'Equity', debt: 'Debt', gold: 'Gold', silver: 'Silver', cash: 'Cash', property: 'Property', other: 'Other', midcap: 'Midcap' };
  var METHODS = { strategic_tilt: 'Strategic + tactical tilt', min_variance: 'Minimum variance', max_sharpe: 'Max Sharpe', black_litterman: 'Black-Litterman', risk_parity: 'Risk parity', hrp: 'Hierarchical risk parity' };
  function D() { return I.data || {}; }
  function N() { return D().snapshot || null; }
  function today() { return new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10); }
  function n2(x, d) { return x == null || !isFinite(x) ? '–' : Number(x).toLocaleString('en-IN', { maximumFractionDigits: d == null ? 2 : d }); }
  function card(title, sub, body, tools) { return '<div class="fo-card"><h3>' + esc(title) + (sub ? ' <small>' + esc(sub) + '</small>' : '') + (tools ? '<span class="fo-card__tools">' + tools + '</span>' : '') + '</h3>' + body + '</div>'; }
  function kpi(label, value, note, cls) { return '<div class="fo-card"><div class="fo-kpi__label">' + esc(label) + '</div><div class="fo-kpi__value' + (cls ? ' ' + cls : '') + '">' + value + '</div>' + (note ? '<div class="fo-kpi__cmp"><span class="flat">' + note + '</span></div>' : '') + '</div>'; }
  function badge(t, cls) { return '<span class="fo-badge' + (cls ? ' ' + cls : '') + '">' + esc(t) + '</span>'; }
  function dir(x) { return x == null ? '' : x > 0 ? 'inv-up' : x < 0 ? 'inv-down' : ''; }
  function chg(x, d) { return '<span class="' + dir(x) + '">' + sg(x, d) + '</span>'; }
  function table(head, rows, empty, numCols, cls) {
    numCols = numCols || [];
    if (!rows.length) return '<div class="fo-empty">' + esc(empty || 'Nothing yet.') + '</div>';
    return '<div class="fo-tablewrap"><table class="fo-table' + (cls ? ' ' + cls : '') + '"><thead><tr>' + head.map(function (h, i) { return '<th' + (numCols.indexOf(i) >= 0 ? ' class="num"' : '') + '>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { var attrs = r.attrs || ''; var cells = r.cells || r; return '<tr' + attrs + '>' + cells.map(function (c, i) { return '<td' + (numCols.indexOf(i) >= 0 ? ' class="num"' : '') + '>' + (c == null ? '–' : c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  function head(title, sub) { return '<div class="fo-drawer__head"><div><h2 class="serif" style="font-size:24px">' + esc(title) + '</h2>' + (sub ? '<div class="fo-hint">' + sub + '</div>' : '') + '</div><button class="fo-iconbtn" data-close aria-label="Close">' + U.icon('x') + '</button></div>'; }
  function field(label, html, full) { return '<label class="fo-field' + (full ? ' full' : '') + '">' + esc(label) + html + '</label>'; }
  function input(id, v, type, extra) { return '<input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(v == null ? '' : v) + '"' + (extra || '') + '>'; }
  function val(p, id) { var e = $('#' + id, p); return e ? (e.type === 'checkbox' ? e.checked : e.value) : ''; }
  function disclaimer() { return '<div class="inv-foot">' + esc(D().disclaimer || 'Educational model output for paper trading. Not investment advice.') + ' Data: NSE archives, IBJA, AMFI, FRED (free, personal use). Model scores are probabilities, not promises.</div>'; }
  function load(force) {
    if (I.loading) return; I.loading = true;
    return U.api('f.inv.bundle').then(function (j) { I.loading = false; if (!j.ok) { toast(j.error, true); return; } I.data = j; U.renderPage(); }, function (e) { I.loading = false; toast('Could not load investments: ' + e.message, true); });
  }
  function save(action, body, msg) { return U.api(action, body).then(function (j) { if (!j.ok) { toast(j.error, true); return j; } if (msg) toast(j.note || msg); return load(true).then(function () { return j; }); }); }
  function lightBadge(l) { return badge(l === 'green' ? '● Healthy' : l === 'amber' ? '● Watch' : l === 'red' ? '● Problem' : '● No data', l === 'green' ? 'fo-badge--ok' : l === 'amber' ? 'fo-badge--warn' : l === 'red' ? 'fo-badge--bad' : 'fo-badge--muted'); }
  function regimeBadge(r) { return badge(r || 'Neutral', r === 'Risk-on' ? 'fo-badge--ok' : r === 'Risk-off' ? 'fo-badge--bad' : 'fo-badge--gold'); }
  function noEngine(body) {
    body.innerHTML = card('The markets engine has not reported yet', '', '<p>Rankings, prices, gold rates and paper fills come from your private engine (repo <b>ap-markets</b>), which runs free on GitHub every trading evening. ' +
      'Connect it once in <a href="#/investments/settings">Settings</a>: create the markets key and paste it into the repo\'s secrets. Until then you can already record your real holdings, IPOs, your risk profile and goals.</p>') + disclaimer();
  }
  function asOf() { var s = N(); return s ? 'as of ' + s.asof + (s.dq && !s.dq.ok ? ' · data check failed' : '') : 'engine not connected'; }

  function view(page) {
    var T = U.tabs('investments', [['dash', 'Dashboard'], ['mine', 'My portfolio'], ['rank', 'Rankings'], ['asset', 'Asset'], ['bullion', 'Gold & silver'], ['ipo', 'IPOs'], ['paper', 'Paper trading'], ['options', 'Investing options'], ['model', 'Model health'], ['academy', 'Academy'], ['settings', 'Settings']]);
    page.innerHTML = U.hello('Investments', 'Your personal quant desk: what looks strongest today and why, your real portfolio, paper trading with real Indian costs, IPOs, gold and silver, and a model that grades itself. ' + esc(asOf()) + '.') + T.html + '<div id="inv"></div>';
    U.wireTabs(page, 'investments');
    var body = $('#inv');
    if (!I.data) { body.innerHTML = '<div class="fo-loading"><div class="fo-spin"></div><div>Loading your investments…</div></div>'; load(); return; }
    ({ dash: dash, mine: mine, rank: rankings, asset: asset, bullion: bullion, ipo: ipos, paper: paperView, options: options, model: model, academy: academy, settings: settings }[T.cur] || dash)(body);
  }

  // ------------------------------------------------------------ Dashboard ------------------------------------------------------------
  function dash(body) {
    var s = N(); if (!s) return noEngine(body);
    var r = s.regime || {}, b = s.bullion || {}, g = b.today && b.today.gold999, auto = (s.paper || {})['PA-AUTOPILOT'], st = auto && auto.stats || {};
    var pf = K.portfolio(D().holdings, s, D().txns, today(), null, D().bullion_live);
    var ipoOpen = (D().ipos || []).filter(function (i) { return i.status === 'open' || i.status === 'upcoming'; });
    var h = '';
    if (s.dq && !s.dq.ok) h += '<div class="fo-alert fo-alert--bad">Data check failed for ' + esc(s.asof) + ': ' + esc((s.dq.issues || []).join(' ')) + ' Scores are held back until the data is clean.</div>';
    h += '<div class="inv-regime inv-regime--' + esc(String(r.label || 'Neutral').toLowerCase()) + '"><div><b>' + esc(r.label || 'Neutral') + '</b> market</div><div>Nifty 50 ' + n2(r.nifty, 0) + (r.ema200 ? (r.nifty > r.ema200 ? ' above' : ' below') + ' its 200-day average (' + n2(r.ema200, 0) + ')' : '') + '</div><div>Breadth ' + n2(r.breadth, 0) + '% of stocks above their 50-day average</div><div>India VIX ' + n2(r.vix, 1) + (r.vix_pct != null ? ' (' + n2(r.vix_pct, 0) + 'th percentile)' : '') + '</div><div class="fo-hint">' + (r.label === 'Risk-off' ? 'Risk-off: paper position sizes halve and gross exposure is capped at 60%.' : 'Regime feeds position sizing and the models.') + '</div></div>';
    h += '<div class="fo-grid fo-grid--4">' +
      kpi('My portfolio', pf.total ? inr(pf.total) : '—', pf.total ? 'XIRR ' + pct(pf.xirr) + ' · gain ' + inr(pf.gain) : '<a href="#/investments/mine">Add your holdings</a>') +
      kpi('Model Autopilot (paper)', auto && auto.equity ? inr(auto.equity) : '—', auto ? 'return ' + sg(st.total_return) + (st.excess_vs_bench != null ? ' · vs Nifty 500 ' + sg(st.excess_vs_bench) + ' a year' : '') + ' · max DD ' + pct(st.max_drawdown) : 'starts with the first run') +
      kpi('Gold 24K (IBJA, 10 g)', g ? inr(g * 10) : '—', b.gold999 ? '1 month ' + sg(b.gold999.chg1m) + ' · excl. GST' : '') +
      kpi('Model health', lightBadge(s.model && s.model.light), esc(s.model && s.model.note || '')) + '</div>';
    var top = (s.top || []).slice(0, 20);
    h += card('Top-ranked stocks', 'composite model score 0–100 · Nifty 200 · ' + s.asof, table(['#', 'Stock', 'Score', 'Δ rank', 'P(top 20%)', '20-day view', 'Why', 'Close', '1 day'], top.map(function (t) {
      return { attrs: ' data-sym="' + esc(t.symbol) + '" class="inv-click"', cells: [t.rank, '<b>' + esc(t.symbol) + '</b><br><small class="fo-hint">' + esc(t.sector || '') + '</small>', '<b>' + n2(t.composite, 0) + '</b>', t.rank_change ? chg(t.rank_change / 100, 0).replace('%', '') : '–', pct(t.ml_prob, 0), t.pred != null ? sg(t.pred) + ' <small class="fo-hint">(' + sg(t.p10, 0) + ' to ' + sg(t.p90, 0) + ')</small>' : '–', esc((t.reasons || []).map(function (x) { return x.text; }).join('; ')), n2(t.close), chg(t.chg1d)] };
    }), 'No rankings yet.', [0, 2, 3, 4, 7, 8]), '<a class="btn btn--sm" href="#/investments/rank">All rankings</a>');
    var mv = s.movers || {};
    h += '<div class="fo-grid fo-grid--2">' + card('Biggest rank risers', 'score, not price', table(['Stock', 'Rank'], (mv.up || []).slice(0, 8).map(function (m) { return [esc(m.symbol), m.from + ' → <b>' + m.to + '</b>']; }), 'Needs two days of scores.')) +
      card('Biggest rank fallers', '', table(['Stock', 'Rank'], (mv.down || []).slice(0, 8).map(function (m) { return [esc(m.symbol), m.from + ' → <b>' + m.to + '</b>']; }), 'Needs two days of scores.')) + '</div>';
    h += card('Sector heatmap', 'returns of Nifty sector indices; RS = 3-month return minus Nifty 50', table(['Sector', '1 day', '1 week', '1 month', '3 months', 'RS'], (s.sectors || []).map(function (x) {
      return [esc(x.name), heat(x.r1d), heat(x.r1w), heat(x.r1m), heat(x.r3m), heat(x.rs)];
    }), 'No sector data yet.', [1, 2, 3, 4, 5], 'inv-heat'));
    h += '<div class="fo-grid fo-grid--2">' + card('Asset classes', 'ETF proxies · outlook = 60-day expected move with an 80% band', table(['Class', '1M', '3M', '12M', 'Volatility', '60-day outlook'], (s.scoreboard || []).map(function (x) {
      return [esc(CLS[x.class] || x.class) + ' <small class="fo-hint">' + esc(x.symbol) + '</small>', chg(x.r1m), chg(x.r3m), chg(x.r12m), pct(x.vol), x.outlook60 != null ? sg(x.outlook60) + ' <small class="fo-hint">(' + sg(x.band60 && x.band60[0], 0) + ' to ' + sg(x.band60 && x.band60[1], 0) + ')</small>' : '–'];
    }), 'Needs 60+ days of history.', [1, 2, 3, 4, 5])) + card('Macro strip', 'FRED daily series', macroStrip(s)) + '</div>';
    h += '<div class="fo-grid fo-grid--2">' + card('IPO strip', 'your IPO board', ipoOpen.length ? table(['IPO', 'Status', 'GMP range', 'Paper verdict'], ipoOpen.map(function (i) { var v = K.ipoVerdict(i); return [esc(i.name) + (i.type === 'sme' ? ' ' + badge('SME', 'fo-badge--warn') : ''), esc(i.status), gmpText(v.gmp), verdictBadge(v.verdict)]; })) : '<div class="fo-empty">No open or upcoming IPOs on your board. <a href="#/investments/ipo">Add one</a>.</div>') +
      card('Signal events today', 'each with its live track record in Indian markets', table(['Stock', 'Event', 'Hit rate (20 days)', 'Avg excess'], ((s.events || {}).today || []).slice(0, 12).map(function (e) { var tr = (s.events.track || {})[e.event] || {}; return [esc(e.symbol), esc(e.label), tr.n ? pct(tr.hit_rate, 0) + ' <small class="fo-hint">n=' + tr.n + '</small>' : 'new', sg(tr.avg_ex20)]; }), 'No events fired on the last trading day.')) + '</div>';
    if (s.valuation && s.valuation.pe) h += card('Is the market cheap or expensive?', 'Nifty 50 valuation since ' + s.valuation.since, '<div class="fo-grid fo-grid--4">' + kpi('P/E', n2(s.valuation.pe), 'higher than ' + n2(s.valuation.pe_pct, 0) + '% of days') + kpi('Earnings yield', n2(s.valuation.earnings_yield) + '%', 'compare with FD / G-sec yields') + kpi('P/B', n2(s.valuation.pb)) + kpi('Dividend yield', n2(s.valuation.div_yield) + '%') + '</div>');
    body.innerHTML = h + disclaimer();
    $$('[data-sym]', body).forEach(function (tr) { tr.onclick = function () { openAsset(tr.dataset.sym); }; });
  }
  function heat(x) { if (x == null) return '–'; var a = Math.min(Math.abs(x) / 0.08, 1), c = x >= 0 ? 'rgba(31,122,82,' + (0.12 + a * 0.55) + ')' : 'rgba(180,58,40,' + (0.12 + a * 0.55) + ')'; return '<span class="inv-cell" style="background:' + c + '">' + sg(x) + '</span>'; }
  function macroStrip(s) {
    var m = s.macro || {}, L = { usdinr: ['USD/INR', 2], brent: ['Brent ($/bbl)', 1], us10y: ['US 10Y yield (%)', 2], usd_broad: ['Dollar index (broad)', 1] };
    var rows = Object.keys(L).filter(function (k) { return m[k]; }).map(function (k) { return [L[k][0], '<b>' + n2(m[k].value, L[k][1]) + '</b>', chg(m[k].chg1m), '<small class="fo-hint">' + esc(m[k].date) + '</small>']; });
    return table(['Series', 'Latest', '1 month', 'Date'], rows, 'No macro data yet.', [1, 2]) + '<div class="fo-hint">India 10-year G-sec: no free official daily feed; the gilt ETF (GILT5YBEES) stands in for debt.</div>';
  }
  function gmpText(g) { return g ? '₹' + n2(g.median, 0) + ' <small class="fo-hint">(' + n2(g.min, 0) + '–' + n2(g.max, 0) + ', ' + g.sources + ' source' + (g.sources > 1 ? 's' : '') + (g.pct != null ? ', ' + pct(g.pct, 0) + ' of band' : '') + ')</small>' : '–'; }
  function verdictBadge(v) { return badge(v, /^Apply — listing and/.test(v) ? 'fo-badge--ok' : /^Apply/.test(v) ? 'fo-badge--gold' : v === 'Avoid' ? 'fo-badge--bad' : 'fo-badge--muted'); }

  // ------------------------------------------------------------ My portfolio ------------------------------------------------------------
  function mine(body) {
    var s = N(), prof = D().profile, target = prof && (prof.allocation || K.ALLOC[prof.profile]);
    var pf = K.portfolio(D().holdings, s, D().txns, today(), target, D().bullion_live);
    var scores = {}; ((s && s.screener) || []).forEach(function (x) { scores[x.symbol] = x; });
    var h = '<div class="fo-grid fo-grid--4">' + kpi('Current value', inr(pf.total), (D().holdings || []).length + ' holdings') + kpi('Invested', inr(pf.invested)) + kpi('Gain', '<span class="' + dir(pf.gain) + '">' + inr(pf.gain) + '</span>', pf.invested ? sg(pf.gain / pf.invested) + ' overall' : '') + kpi('XIRR', pct(pf.xirr), 'money-weighted, all holdings') + '</div>';
    h += '<div class="fo-grid fo-grid--2">' + card('Allocation', target ? 'vs your ' + (prof.profile || '') + ' profile' : 'set a risk profile in Investing options', '<div class="fo-chartbox" id="inv-alloc"></div>' +
      table(['Class', 'Value', 'Now', 'Target'], pf.alloc.map(function (a) { return [esc(CLS[a.cls] || a.cls), inr(a.value), pct(a.pct, 0), target ? pct(target[a.cls] || 0, 0) : '–']; }), '', [1, 2, 3])) +
      card('Rebalancing', 'threshold rule: act when a class drifts 5+ points from target', target ? (pf.gaps.length ? table(['Class', 'Now → target', 'Move'], pf.gaps.map(function (g) { return [esc(CLS[g.cls] || g.cls), pct(g.have, 0) + ' → ' + pct(g.want, 0), (g.amount > 0 ? 'add ' : 'trim ') + inr(Math.abs(g.amount))]; }), '', [2]) + '<div class="fo-hint">Prefer adding new money to under-weight classes over selling (no tax, no costs). Check tax lots before trimming.</div>' : '<div class="fo-empty">Within 5 points of your target everywhere. Nothing to do.</div>') : '<div class="fo-empty">Answer the 10 questions in <a href="#/investments/options">Investing options</a> to get a target mix.</div>') + '</div>';
    h += card('Holdings', 'valued with NSE closes, AMFI NAVs and IBJA rates · stays private in Google', table(['Name', 'Kind', 'Units', 'Value', 'Gain', 'XIRR', 'Model score', 'Basis', ''], pf.rows.map(function (r) {
      var x = r.h, v = r.v, sc = x.symbol && scores[x.symbol];
      return [esc(x.name) + (x.symbol ? ' <small class="fo-hint">' + esc(x.symbol) + '</small>' : ''), esc(KIND[x.kind] || x.kind), x.units ? n2(x.units, 4) : '–', inr(v.value), v.gain != null ? '<span class="' + dir(v.gain) + '">' + inr(v.gain) + '</span>' : '–', pct(v.xirr), sc ? '<b>' + n2(sc.composite, 0) + '</b> <small class="fo-hint">#' + sc.rank + '</small>' : '–', '<small class="fo-hint">' + esc(v.basis) + '</small>',
        '<button class="btn btn--sm" data-edit="' + esc(x.holding_id) + '">Edit</button> <button class="btn btn--sm" data-tx="' + esc(x.holding_id) + '">Transactions</button>'];
    }), 'No holdings yet. Add your stocks, funds, gold, FDs, PPF, EPF, NPS and cash to see one number for everything.', [2, 3, 4, 5, 6]), '<button class="btn btn--sm btn--primary" id="h-add">Add holding</button>');
    h += card('Watchlist', 'priced from the next daily run', '<div class="fo-toolbar"><input class="fo-input" id="w-sym" placeholder="NSE symbol (e.g. HDFCBANK) or AMFI code"><select id="w-kind"><option value="symbol">Stock / ETF</option><option value="mf">Mutual fund (AMFI code)</option></select><button class="btn" id="w-add">Add</button></div>' +
      table(['Symbol', 'Close', '1 day', 'Model score', ''], (D().watch || []).map(function (w) { var p = s && s.prices && s.prices[w.symbol], nv = s && s.nav && s.nav[w.symbol], sc = scores[w.symbol]; return [esc(w.symbol) + (nv ? ' <small class="fo-hint">' + esc(nv.name) + '</small>' : ''), p ? n2(p.close) : nv ? n2(nv.nav, 4) : 'next run', p ? chg(p.chg1d) : '–', sc ? n2(sc.composite, 0) + ' (#' + sc.rank + ')' : '–', '<button class="btn btn--sm" data-unw="' + esc(w.symbol) + '">Remove</button>']; }), 'Nothing on your watchlist.'));
    body.innerHTML = h + disclaimer();
    if (pf.alloc.length) C.donut($('#inv-alloc'), pf.alloc.map(function (a) { return { label: CLS[a.cls] || a.cls, value: Math.round(a.value) }; }), { kind: 'inr', centerLabel: 'total' });
    $('#h-add').onclick = function () { holdingDrawer({}); };
    $$('[data-edit]', body).forEach(function (b) { b.onclick = function () { holdingDrawer((D().holdings || []).filter(function (x) { return x.holding_id === b.dataset.edit; })[0]); }; });
    $$('[data-tx]', body).forEach(function (b) { b.onclick = function () { txnDrawer(b.dataset.tx); }; });
    $('#w-add').onclick = function () { save('f.inv.watch.add', { symbol: $('#w-sym').value, kind: $('#w-kind').value }, 'Added: priced from the next daily run'); };
    $$('[data-unw]', body).forEach(function (b) { b.onclick = function () { save('f.inv.watch.remove', { symbol: b.dataset.unw }, 'Removed'); }; });
  }
  function holdingDrawer(h) {
    h = h || {};
    var p = U.drawer(head(h.holding_id ? 'Edit holding' : 'Add a holding', 'Only you can see this. Real quantities never leave Google.') + '<div class="fo-form" id="hd"></div>');
    function render(kind) {
      var f = function (label, id, v, type, extra) { return field(label, input('hd-' + id, v, type, extra)); };
      var html = field('Kind', sel('hd-kind', Object.keys(KIND).map(function (k) { return [k, KIND[k]]; }), kind)) + f('Name', 'name', h.name);
      if (kind === 'stock' || kind === 'etf') html += f('NSE symbol', 'symbol', h.symbol, 'text', ' placeholder="RELIANCE, GOLDBEES…"') + f('Units', 'units', h.units, 'number', ' step="any"') + f('Average cost (₹)', 'avg_cost', h.avg_cost, 'number', ' step="any"') + f('First bought', 'start_date', h.start_date, 'date');
      else if (kind === 'mf') html += f('AMFI scheme code', 'fund_code', h.fund_code, 'text', ' inputmode="numeric" placeholder="e.g. 120503"') + f('Units', 'units', h.units, 'number', ' step="any"') + f('Average NAV paid (₹)', 'avg_cost', h.avg_cost, 'number', ' step="any"') + f('First invested', 'start_date', h.start_date, 'date');
      else if (kind === 'gold' || kind === 'silver' || kind === 'sgb') html += f(kind === 'sgb' ? 'Units (1 unit = 1 gram)' : 'Weight (grams)', 'units', h.units, 'number', ' step="any"') + (kind === 'gold' ? field('Purity', sel('hd-purity', [['999', '24K (999)'], ['995', '995'], ['916', '22K (916)'], ['750', '18K (750)'], ['585', '14K (585)']], h.purity || '999')) : '') + f('Average cost per gram (₹)', 'avg_cost', h.avg_cost, 'number', ' step="any"') + f('Bought on', 'start_date', h.start_date, 'date');
      else if (kind === 'fd') html += f('Amount deposited (₹)', 'invested', h.invested, 'number') + f('Interest rate (% a year)', 'rate_pct', h.rate_pct, 'number', ' step="any"') + field('Compounding', sel('hd-compounding', [['quarterly', 'Quarterly'], ['monthly', 'Monthly'], ['half-yearly', 'Half-yearly'], ['yearly', 'Yearly'], ['simple', 'Simple (payout)']], h.compounding || 'quarterly')) + f('Start date', 'start_date', h.start_date, 'date') + f('Maturity date', 'maturity_date', h.maturity_date, 'date');
      else if (kind === 'rd') html += f('Monthly instalment (₹)', 'monthly_amount', h.monthly_amount, 'number') + f('Interest rate (% a year)', 'rate_pct', h.rate_pct, 'number', ' step="any"') + f('Start date', 'start_date', h.start_date, 'date') + f('Maturity date', 'maturity_date', h.maturity_date, 'date');
      else html += f('Current value (₹)', 'current_value', h.current_value, 'number') + f('Value as on', 'value_date', h.value_date || today(), 'date') + f('Amount invested so far (₹)', 'invested', h.invested, 'number') + f('Since', 'start_date', h.start_date, 'date') + (kind === 'ppf' || kind === 'epf' || kind === 'bond' ? f('Interest rate (% a year, to grow the value between updates)', 'rate_pct', h.rate_pct, 'number', ' step="any"') : '');
      html += f('Account / broker / bank', 'account', h.account) + f('Goal', 'goal', h.goal, 'text', ' placeholder="House, child education…"') + field('Notes', '<textarea id="hd-notes">' + esc(h.notes || '') + '</textarea>', true) +
        '<div class="fo-toolbar full"><button class="btn btn--primary" id="hd-save">Save</button>' + (h.holding_id ? '<button class="btn" id="hd-close">Mark sold / closed</button><button class="btn" id="hd-del">Delete</button>' : '') + '</div>';
      $('#hd', p).innerHTML = html;
      $('#hd-kind', p).onchange = function () { render(this.value); };
      $('#hd-save', p).onclick = function () {
        var o = { holding_id: h.holding_id, kind: kind, status: h.status };
        ['name', 'symbol', 'fund_code', 'units', 'avg_cost', 'invested', 'start_date', 'rate_pct', 'compounding', 'maturity_date', 'monthly_amount', 'current_value', 'value_date', 'purity', 'account', 'goal', 'notes'].forEach(function (k) { var e = $('#hd-' + k, p); if (e) o[k] = e.value; });
        save('f.inv.holding.save', { holding: o }, 'Saved').then(function (j) { if (j && j.ok) p.closest('.fo-drawer').remove(); });
      };
      var c = $('#hd-close', p); if (c) c.onclick = function () { save('f.inv.holding.save', { holding: Object.assign({}, h, { status: 'closed' }) }, 'Marked closed').then(function () { p.closest('.fo-drawer').remove(); }); };
      var d = $('#hd-del', p); if (d) d.onclick = function () { if (confirm('Delete this holding and keep no record of it?')) save('f.inv.holding.delete', { holding_id: h.holding_id }, 'Deleted').then(function () { p.closest('.fo-drawer').remove(); }); };
    }
    render(h.kind || 'stock');
  }
  function txnDrawer(id) {
    var h = (D().holdings || []).filter(function (x) { return x.holding_id === id; })[0]; if (!h) return;
    var tx = (D().txns || []).filter(function (t) { return t.holding_id === id; });
    var p = U.drawer(head('Transactions · ' + h.name, 'Each buy, SIP, deposit, sale or payout makes XIRR exact.') + table(['Date', 'Type', 'Units', 'Price', 'Amount', ''], tx.map(function (t) { return [esc(t.date), esc(t.type), t.units || '–', t.price || '–', inr(Number(t.amount)), '<button class="btn btn--sm" data-del="' + esc(t.txn_id) + '">Delete</button>']; }), 'No transactions yet: XIRR uses the first date and amount invested.', [2, 3, 4]) +
      '<div class="fo-form">' + field('Date', input('tx-date', today(), 'date')) + field('Type', sel('tx-type', [['buy', 'Buy / SIP'], ['sell', 'Sell'], ['deposit', 'Deposit'], ['withdrawal', 'Withdrawal'], ['dividend', 'Dividend'], ['interest', 'Interest paid out']], 'buy')) + field('Units', input('tx-units', '', 'number', ' step="any"')) + field('Price (₹)', input('tx-price', '', 'number', ' step="any"')) + field('Amount (₹)', input('tx-amount', '', 'number', ' step="any"')) + field('Note', input('tx-note', '')) + '<div class="fo-toolbar full"><button class="btn btn--primary" id="tx-save">Add</button></div></div>');
    $('#tx-save', p).onclick = function () { save('f.inv.txn.save', { txn: { holding_id: id, date: val(p, 'tx-date'), type: val(p, 'tx-type'), units: val(p, 'tx-units'), price: val(p, 'tx-price'), amount: val(p, 'tx-amount'), note: val(p, 'tx-note') } }, 'Added').then(function (j) { if (j && j.ok) { p.closest('.fo-drawer').remove(); txnDrawer(id); } }); };
    $$('[data-del]', p).forEach(function (b) { b.onclick = function () { save('f.inv.txn.delete', { txn_id: b.dataset.del }, 'Deleted').then(function () { p.closest('.fo-drawer').remove(); txnDrawer(id); }); }; });
  }

  // ------------------------------------------------------------ Rankings ------------------------------------------------------------
  function rankings(body) {
    var s = N(); if (!s) return noEngine(body);
    var F = I.filter, rows = (s.screener || []).slice();
    var sectors = rows.map(function (r) { return r.sector; }).filter(function (x, i, a) { return x && a.indexOf(x) === i; }).sort();
    rows = rows.filter(function (r) { return (F.sector === 'all' || r.sector === F.sector) && (r.composite || 0) >= F.min && (!F.q || (r.symbol + ' ' + (r.name || '')).toLowerCase().indexOf(F.q.toLowerCase()) >= 0); });
    var key = F.sort, desc = key !== 'rank' && key !== 'symbol';
    rows.sort(function (a, b) { var x = a[key], y = b[key]; if (x == null) return 1; if (y == null) return -1; return (x < y ? -1 : x > y ? 1 : 0) * (desc ? -1 : 1); });
    var hs = [['rank', '#'], ['symbol', 'Stock'], ['composite', 'Score'], ['technical', 'Technical'], ['ml_prob', 'P(top 20%)'], ['sentiment', 'Flow'], ['chg1d', '1 day'], ['chg3m', '3 months'], ['close', 'Close']];
    body.innerHTML = card('Screener', rows.length + ' of ' + (s.screener || []).length + ' Nifty 200 stocks · tap a column to sort, a row for detail', '<div class="fo-toolbar"><input class="fo-input" id="r-q" placeholder="Search" value="' + esc(F.q) + '">' + sel('r-sec', [['all', 'All sectors']].concat(sectors.map(function (x) { return [x, x]; })), F.sector) +
      '<label class="fo-hint">Min score <input type="number" id="r-min" class="fo-input" style="width:70px" value="' + F.min + '"></label></div>' +
      table(hs.map(function (x) { return '<span class="inv-sort" data-sort="' + x[0] + '">' + x[1] + (F.sort === x[0] ? ' ▾' : '') + '</span>'; }), rows.map(function (r) {
        return { attrs: ' data-sym="' + esc(r.symbol) + '" class="inv-click"', cells: [r.rank, '<b>' + esc(r.symbol) + '</b> <small class="fo-hint">' + esc(r.sector || '') + '</small>', '<b>' + n2(r.composite, 0) + '</b>', n2(r.technical, 0), pct(r.ml_prob, 0), n2(r.sentiment, 0), chg(r.chg1d), chg(r.chg3m), n2(r.close)] };
      }), 'No stock matches.', [0, 2, 3, 4, 5, 6, 7, 8])) +
      card('How the score is built', '', '<p>Score = weighted blend of <b>Technical</b> (trend, momentum, volume, volatility, oscillators, each ranked across all stocks), <b>ML</b> (calibrated probability of being in the top 20% over the next 20 trading days versus the Nifty 500) and <b>Flow</b> (delivery %, accumulation). Weights today: ' +
        Object.keys((s.model && s.model.weights) || {}).map(function (k) { return { T: 'Technical', M: 'ML', S: 'Flow' }[k] + ' ' + pct(s.model.weights[k], 0); }).join(' · ') + '. The learning loop moves them by at most 5 points a week. Company fundamentals join when a free licensed source exists.</p>') + disclaimer();
    $('#r-q').oninput = function () { F.q = this.value; clearTimeout(I.t); I.t = setTimeout(function () { rankings(body); $('#r-q').focus(); }, 300); };
    $('#r-sec').onchange = function () { F.sector = this.value; rankings(body); };
    $('#r-min').onchange = function () { F.min = Number(this.value) || 0; rankings(body); };
    $$('[data-sort]', body).forEach(function (x) { x.onclick = function (e) { e.stopPropagation(); F.sort = x.dataset.sort; rankings(body); }; });
    $$('[data-sym]', body).forEach(function (tr) { tr.onclick = function () { openAsset(tr.dataset.sym); }; });
  }
  function openAsset(sym) { I.asset = sym; location.hash = '#/investments/asset'; }

  // ------------------------------------------------------------ Asset ------------------------------------------------------------
  function asset(body) {
    var s = N(); if (!s) return noEngine(body);
    var sym = I.asset || (s.top && s.top[0] && s.top[0].symbol), p = s.prices && s.prices[sym], d = s.detail && s.detail[sym], sc = (s.screener || []).filter(function (x) { return x.symbol === sym; })[0], t = (s.top || []).filter(function (x) { return x.symbol === sym; })[0];
    var h = '<div class="fo-toolbar"><input class="fo-input" id="a-sym" placeholder="NSE symbol" value="' + esc(sym || '') + '"><button class="btn" id="a-go">Show</button>' + (sym ? '<button class="btn" id="a-watch">Add to watchlist</button><button class="btn btn--primary" id="a-trade">Paper trade</button>' : '') + '</div>';
    if (!p) { body.innerHTML = h + card(sym || 'Pick a stock', '', '<div class="fo-empty">' + (sym ? esc(sym) + ' is not in today\'s data. Add it to your watchlist: it is priced and charted from the next daily run.' : 'Type a symbol.') + '</div>') + disclaimer(); wireAsset(body, sym); return; }
    h += '<div class="fo-grid fo-grid--4">' + kpi(sym, n2(p.close), esc(p.name || '') + ' · ' + chg(p.chg1d) + ' on ' + esc(p.date)) + kpi('Model score', sc ? n2(sc.composite, 0) + ' <small>/100</small>' : '–', sc ? 'rank ' + sc.rank + ' of ' + (s.screener || []).length : 'not in the ranked universe') +
      kpi('P(top 20% in 20 days)', sc ? pct(sc.ml_prob, 0) : '–', t && t.pred != null ? 'expected excess ' + sg(t.pred) + ' (' + sg(t.p10, 0) + ' to ' + sg(t.p90, 0) + ')' : '') + kpi('ATR (14 days)', p.atr14 ? n2(p.atr14) : '–', p.atr14 ? 'stop distance 2 × ATR = ' + n2(2 * p.atr14) : '') + '</div>';
    h += card('Price with 50- and 200-day averages', 'adjusted for splits and bonuses', '<div class="fo-chartbox" id="a-chart"></div>');
    if (d) {
      h += '<div class="fo-grid fo-grid--2">' + card('Signals today', '−1 bearish … +1 bullish', table(['Signal', 'Value'], Object.keys(d.signals || {}).filter(function (k) { return d.signals[k] != null; }).sort(function (a, b) { return Math.abs(d.signals[b]) - Math.abs(d.signals[a]); }).map(function (k) { return [esc(k.replace(/_/g, ' ')), '<span class="' + dir(d.signals[k]) + '">' + n2(d.signals[k]) + '</span>']; }), '', [1])) +
        card('Technical score history', 'last 60 trading days', '<div class="fo-chartbox" id="a-score"></div>' + (t && t.reasons ? '<p><b>Why it ranks here:</b> ' + esc(t.reasons.map(function (x) { return x.text; }).join('; ')) + '</p>' : '') + (d.events && d.events.length ? '<p><b>Recent events:</b> ' + d.events.map(function (e) { return esc(e.event.replace(/_/g, ' ')) + ' (' + esc(e.date) + ')'; }).join(', ') + '</p>' : '')) + '</div>';
    } else h += card('More detail', '', '<div class="fo-empty">Add ' + esc(sym) + ' to your watchlist for its chart, signal breakdown and score history from the next run.</div>');
    h += card('Fundamentals and valuation', '', '<div class="fo-empty">Company financials, forensic scores (Piotroski, Altman, Beneish) and the DCF need a licensed fundamentals feed, which the free plan does not have. The academy explains each model; the slot is ready when you add a source.</div>');
    body.innerHTML = h + disclaimer();
    if (d && d.closes) {
      C.combo($('#a-chart'), { labels: d.closes.map(function (x) { return x[0].slice(5); }), height: 260, kind: 'n', series: [{ name: sym, type: 'line', values: d.closes.map(function (x) { return x[1]; }) }, { name: '50-day', type: 'line', values: d.ema50 }, { name: '200-day', type: 'line', values: d.ema200 }] });
      if (d.score_hist && d.score_hist.length) C.combo($('#a-score'), { labels: d.score_hist.map(function (x) { return x[0].slice(5); }), height: 180, kind: 'n', series: [{ name: 'Technical score', type: 'line', values: d.score_hist.map(function (x) { return x[1]; }) }] });
    } else $('#a-chart').innerHTML = '<div class="fo-empty">Chart arrives with the next run (watchlist symbols and the top 30 are charted).</div>';
    wireAsset(body, sym);
  }
  function wireAsset(body, sym) {
    $('#a-go').onclick = function () { I.asset = $('#a-sym').value.toUpperCase().trim(); asset(body); };
    $('#a-sym').onkeydown = function (e) { if (e.key === 'Enter') $('#a-go').click(); };
    var w = $('#a-watch'); if (w) w.onclick = function () { save('f.inv.watch.add', { symbol: sym }, 'Added to your watchlist'); };
    var t = $('#a-trade'); if (t) t.onclick = function () { ticket({ symbol: sym }); };
  }

  // ------------------------------------------------------------ Gold & silver ------------------------------------------------------------
  function bullion(body) {
    var s = N(), b = (s && s.bullion) || {}, live = D().bullion_live, t = (live && live.rates) || b.today || {};
    if (!s && !live) return noEngine(body);
    var rows = [['24K (999)', t.gold999], ['995', t.gold995], ['22K (916)', t.gold916], ['18K (750)', t.gold750], ['14K (585)', t.gold585]].filter(function (r) { return r[1]; });
    var ratio = b.gold999 && b.silver999 ? b.gold999.last * 100 / b.silver999.last : null;
    var h = '<div class="fo-grid fo-grid--4">' + kpi('Gold 24K · 10 g', t.gold999 ? inr(t.gold999 * 10) : '–', live ? 'IBJA ' + esc(live.session) + ' ' + esc(live.date) : 'IBJA, excl. GST') + kpi('Silver · 1 kg', b.silver999 ? inr(b.silver999.last) : '–', b.silver999 ? '1 month ' + sg(b.silver999.chg1m) : '') +
      kpi('Gold 1 year', b.gold999 ? chg(b.gold999.chg1y) : '–', b.gold999 ? '1 week ' + sg(b.gold999.chg1w) + ' · 1 month ' + sg(b.gold999.chg1m) : '') + kpi('Gold-silver ratio', ratio ? n2(ratio, 1) : '–', 'high = silver cheap relative to gold') + '</div>';
    h += '<div class="fo-grid fo-grid--2">' + card('IBJA rates by purity', 'per gram and per 10 g, excluding GST and making charges', table(['Purity', 'Per gram', 'Per 10 g'], rows.map(function (r) { return [r[0], inr(r[1]), inr(r[1] * 10)]; }), 'Rates not loaded yet.', [1, 2]) +
      (b.derived_per_10g ? '<div class="fo-hint">Derived 22K = 24K × 22/24 = ' + inr(b.derived_per_10g['22K (24K × 22/24)']) + ' per 10 g; 18K = ' + inr(b.derived_per_10g['18K (24K × 18/24)']) + '. IBJA\'s own 916 rate is shown above.</div>' : '')) +
      card('AM and PM sessions', 'IBJA publishes around 12:00 and 17:00 IST on working days', table(['Date', 'Session', 'Metal', 'Rate'], (b.sessions || []).slice().reverse().map(function (x) { return [esc(x.date), esc(x.session), esc(x.metal), inr(x.rate)]; }), 'Sessions appear after the first runs.', [3])) + '</div>';
    h += '<div class="fo-grid fo-grid--2">' + card('Gold 999 · 10 g', 'IBJA history', '<div class="fo-chartbox" id="b-g"></div>') + card('Silver · 1 kg', 'IBJA history', '<div class="fo-chartbox" id="b-s"></div>') + '</div>';
    var sb = ((s && s.scoreboard) || []).filter(function (x) { return x.class === 'gold' || x.class === 'silver'; });
    if (sb.length) h += card('Model outlook (60 trading days)', 'drift shrunk toward a long-run prior, band from EWMA volatility', table(['Metal', 'Expected', '80% band', 'Volatility'], sb.map(function (x) { return [esc(CLS[x.class]), sg(x.outlook60), x.band60 ? sg(x.band60[0]) + ' to ' + sg(x.band60[1]) : '–', pct(x.vol)]; }), '', [1, 2, 3]));
    h += '<div class="fo-hint">' + esc(b.note || '') + '</div>';
    body.innerHTML = h + disclaimer();
    [['b-g', b.gold999], ['b-s', b.silver999]].forEach(function (x) { if (x[1] && x[1].history) C.combo($('#' + x[0]), { labels: x[1].history.map(function (r) { return r[0].slice(5); }), height: 220, kind: 'inr', series: [{ name: x[0] === 'b-g' ? 'Gold 10 g' : 'Silver kg', type: 'line', values: x[1].history.map(function (r) { return r[1]; }) }] }); else $('#' + x[0]).innerHTML = '<div class="fo-empty">History arrives with the first run.</div>'; });
  }

  // ------------------------------------------------------------ IPOs ------------------------------------------------------------
  function ipos(body) {
    var L = (D().ipos || []).slice().sort(function (a, b) { return String(b.open).localeCompare(String(a.open)); });
    var h = card('IPO board', 'mainboard and SME · you type in the RHP, exchange and GMP numbers (no free licensed IPO feed)', table(['IPO', 'Status', 'Dates', 'Band · lot', 'Min. investment', 'Subscription (QIB / NII / retail / total)', 'GMP range', 'P(positive listing)', 'Paper verdict', 'Retail allotment'], L.map(function (i) {
      var v = K.ipoVerdict(i), lo = Number(i.price_low), hi = Number(i.price_high), lot = Number(i.lot);
      return { attrs: ' data-ipo="' + esc(i.ipo_id) + '" class="inv-click"', cells: ['<b>' + esc(i.name) + '</b>' + (i.type === 'sme' ? ' ' + badge('SME', 'fo-badge--warn') : ''), esc(i.status), esc((i.open || '?') + ' → ' + (i.close || '?')) + (i.listing ? '<br><small class="fo-hint">lists ' + esc(i.listing) + '</small>' : ''), (lo && hi ? '₹' + lo + '–' + hi : lo || hi ? '₹' + (lo || hi) : '–') + (lot ? ' · ' + lot : ''), hi && lot ? inr(hi * lot) : '–',
        [i.sub_qib, i.sub_nii || i.sub_bnii, i.sub_retail, i.sub_total].map(function (x) { return x === '' || x == null ? '–' : n2(x, 1) + '×'; }).join(' / '), gmpText(v.gmp), v.p == null ? '–' : pct(v.p, 0), verdictBadge(v.verdict), v.allot_retail != null ? pct(v.allot_retail, 0) : '–'] };
    }), 'No IPOs yet. Add the ones you are tracking.', [4, 7, 9]), '<button class="btn btn--sm btn--primary" id="ipo-add">Add IPO</button>');
    h += card('How the verdict works', '', '<p><b>Apply — listing and long term:</b> P(positive listing) above 70%, strong business, not expensive, no red flags. <b>Apply — listing only:</b> above 70% but valuation stretched or business average. <b>Watch post-listing:</b> strong business, expensive at issue. <b>Avoid:</b> below 50% or any red flag (heavy offer-for-sale with weak growth, governance issues, SME grey-market spike without QIB demand).</p><p class="fo-hint">P(positive listing) is a rule-of-thumb from subscription and the GMP range until a model can be trained on IPO history. GMP is unofficial: SEBI does not recognise grey-market trades, so it is shown as a range across sources and never used alone. If exchanges launch "when-listed" trading, those prices replace GMP.</p>');
    body.innerHTML = h + disclaimer();
    $('#ipo-add').onclick = function () { ipoDrawer({}); };
    $$('[data-ipo]', body).forEach(function (tr) { tr.onclick = function () { ipoDrawer(L.filter(function (x) { return x.ipo_id === tr.dataset.ipo; })[0]); }; });
  }
  function ipoDrawer(i) {
    i = i || {}; var v = i.ipo_id ? K.ipoVerdict(i) : null, gm = []; try { gm = JSON.parse(i.gmp_json || '[]'); } catch (e) {}
    var f = function (label, id, type) { return field(label, input('ip-' + id, i[id], type || 'number', type ? '' : ' step="any"')); };
    var p = U.drawer(head(i.ipo_id ? i.name : 'Add an IPO', v ? verdictBadge(v.verdict) + ' ' + (v.p != null ? 'P(positive listing) ' + pct(v.p, 0) + ' · long term ' + v.long : '') : 'From the RHP and exchange bid details') +
      (v ? '<div class="fo-card">' + (v.flags.length ? '<p><b>Red flags:</b> ' + esc(v.flags.join('; ')) + '</p>' : '') + (v.sme_warning ? '<p class="fo-alert fo-alert--bad">' + esc(v.sme_warning) + '</p>' : '') + (v.stretched ? '<p>Valuation stretched: post-issue P/E ' + esc(i.pe_post) + ' vs peers ' + esc(i.peer_pe) + '.</p>' : '') + '<p class="fo-hint">' + esc(v.basis) + '</p></div>' : '') +
      '<div class="fo-form">' + field('Name', input('ip-name', i.name), true) + field('Type', sel('ip-type', [['mainboard', 'Mainboard'], ['sme', 'SME']], i.type || 'mainboard')) + field('Status', sel('ip-status', [['upcoming', 'Upcoming'], ['open', 'Open'], ['closed', 'Closed (awaiting allotment)'], ['allotted', 'Allotted'], ['listed', 'Listed']], i.status || 'upcoming')) +
      f('Opens', 'open', 'date') + f('Closes', 'close', 'date') + f('Allotment', 'allotment', 'date') + f('Listing', 'listing', 'date') + f('Price band low (₹)', 'price_low') + f('Price band high (₹)', 'price_high') + f('Lot size (shares)', 'lot') + f('Issue size (₹ crore)', 'issue_size_cr') + f('Fresh issue (₹ crore)', 'fresh_cr') + f('Offer for sale (₹ crore)', 'ofs_cr') +
      f('QIB subscription (×)', 'sub_qib') + f('NII (×)', 'sub_nii') + f('bNII (×)', 'sub_bnii') + f('sNII (×)', 'sub_snii') + f('Retail (×)', 'sub_retail') + f('Employee (×)', 'sub_emp') + f('Total (×)', 'sub_total') +
      f('Post-issue P/E at upper band', 'pe_post') + f('Listed peers\' P/E', 'peer_pe') + f('Revenue CAGR 3Y (%)', 'rev_cagr') + f('PAT CAGR 3Y (%)', 'pat_cagr') + f('ROE (%)', 'roe') + f('ROCE (%)', 'roce') + f('Debt / equity', 'de') + f('Anchor book (₹ crore)', 'anchor_cr') +
      field('Anchor names', input('ip-anchor_names', i.anchor_names), true) + field('Lead managers', input('ip-lead_managers', i.lead_managers), true) + field('Red flags (governance, pledges, litigation…)', input('ip-red_flags', i.red_flags), true) + f('Listing day open (₹)', 'listing_open') + f('Listing day close (₹)', 'listing_close') + field('Notes', '<textarea id="ip-notes">' + esc(i.notes || '') + '</textarea>', true) + '</div>' +
      '<h3>Grey market readings</h3><div class="fo-hint">One reading per source and time. The board shows the median of each source\'s newest reading, with the range.</div>' + table(['When', 'Source', 'GMP (₹)', 'Kostak'], gm.slice().reverse().map(function (g) { return [esc(String(g.at).slice(0, 16).replace('T', ' ')), esc(g.source), n2(g.gmp, 0), g.kostak == null ? '–' : n2(g.kostak, 0)]; }), 'No readings yet.', [2, 3]) +
      '<div class="fo-toolbar"><input class="fo-input" id="gm-src" placeholder="Source (site name)"><input class="fo-input" id="gm-val" type="number" placeholder="GMP ₹" style="width:100px"><input class="fo-input" id="gm-k" type="number" placeholder="Kostak ₹" style="width:100px"></div>' +
      '<div class="fo-toolbar"><button class="btn btn--primary" id="ip-save">Save</button>' + (i.ipo_id ? '<button class="btn" id="ip-del">Delete</button>' : '') + '</div>');
    $('#ip-save', p).onclick = function () {
      var o = { ipo_id: i.ipo_id }; $$('[id^="ip-"]', p).forEach(function (e) { if (e.id !== 'ip-save' && e.id !== 'ip-del') o[e.id.slice(3)] = e.value; });
      var g = gm.slice(); if (val(p, 'gm-src') && val(p, 'gm-val') !== '') g.push({ at: new Date().toISOString(), source: val(p, 'gm-src'), gmp: Number(val(p, 'gm-val')), kostak: val(p, 'gm-k') === '' ? null : Number(val(p, 'gm-k')) });
      o.gmp = g; save('f.inv.ipo.save', { ipo: o }, 'Saved').then(function (j) { if (j && j.ok) p.closest('.fo-drawer').remove(); });
    };
    var d = $('#ip-del', p); if (d) d.onclick = function () { if (confirm('Delete this IPO?')) save('f.inv.ipo.delete', { ipo_id: i.ipo_id }, 'Deleted').then(function () { p.closest('.fo-drawer').remove(); }); };
  }

  // ------------------------------------------------------------ Paper trading ------------------------------------------------------------
  function paperView(body) {
    var accts = (D().accounts || []).filter(function (a) { return a.status !== 'closed'; }), s = N();
    if (!I.acct || !accts.some(function (a) { return a.account_id === I.acct; })) I.acct = (accts.filter(function (a) { return a.strategy !== 'autopilot'; })[0] || accts[0] || {}).account_id;
    var a = accts.filter(function (x) { return x.account_id === I.acct; })[0], P = a && s && s.paper && s.paper[a.account_id], st = (P && P.stats) || {};
    var orders = (D().orders || []).filter(function (o) { return a && o.account_id === a.account_id; }).reverse(), fills = (D().fills || []).filter(function (f) { return a && f.account_id === a.account_id; }).reverse();
    var h = '<div class="fo-toolbar">' + (accts.length ? sel('p-acct', accts.map(function (x) { return [x.account_id, x.name + (x.strategy === 'autopilot' ? ' (model)' : '')]; }), I.acct) : '') + '<button class="btn" id="p-new">New paper account</button>' + (a && a.strategy !== 'autopilot' ? '<button class="btn btn--primary" id="p-ticket">New order</button>' : '') + '</div>';
    if (!a) { body.innerHTML = h + card('Paper trading', '', '<div class="fo-empty">Create a paper account with virtual money (default ₹10 lakh). Orders fill at the next trading day\'s open from real NSE prices, with real Indian charges and slippage.</div>') + disclaimer(); wirePaper(body); return; }
    h += '<div class="fo-grid fo-grid--4">' + kpi('Equity', P ? inr(P.equity) : inr(Number(a.starting_cash)), 'started ' + inr(Number(a.starting_cash)) + ' on ' + esc(a.created_at)) + kpi('Return', P ? chg(st.total_return) : '–', st.xirr != null ? 'XIRR ' + pct(st.xirr) : 'after the first marks') +
      kpi('Max drawdown', pct(st.max_drawdown), st.drawdown_days ? st.drawdown_days + ' days under water' : '') + kpi('Sharpe · Sortino', st.sharpe != null ? n2(st.sharpe) + ' · ' + n2(st.sortino) : '–', 'risk-free ' + '6.5%') + '</div>';
    h += card('Equity curve vs Nifty 500', a.strategy === 'autopilot' ? 'the model\'s honest scorecard: top 10 by score, rebalanced weekly' : '', '<div class="fo-chartbox" id="p-curve"></div>');
    h += '<div class="fo-grid fo-grid--2">' + card('Positions', P ? inr(P.cash) + ' cash' : '', table(['Stock', 'Qty', 'Avg cost', 'Last', 'Value', 'P&L'], ((P && P.positions) || []).map(function (x) { return [esc(x.symbol), n2(x.qty, 0), n2(x.avg_cost), n2(x.price), inr(x.value), '<span class="' + dir(x.pnl) + '">' + inr(x.pnl) + '</span>']; }), 'No open positions.', [1, 2, 3, 4, 5])) +
      card('Risk and performance', '', table(['Metric', 'Value'], [['Annualised return', pct(st.ann_return)], ['Volatility', pct(st.volatility)], ['Beta', n2(st.beta)], ['Jensen\'s alpha', pct(st.jensen_alpha)], ['Information ratio', n2(st.info_ratio)], ['Treynor', n2(st.treynor)], ['Calmar', n2(st.calmar)], ['VaR 95% (1 day, historical · parametric)', pct(st.var95_hist, 2) + ' · ' + pct(st.var95_param, 2)], ['CVaR 95%', pct(st.cvar95, 2)], ['Trades · win rate', (st.trades || 0) + ' · ' + pct(st.win_rate, 0)], ['Avg win · avg loss', inr(st.avg_win) + ' · ' + inr(st.avg_loss)], ['Expectancy per trade', inr(st.expectancy)], ['Avg holding', st.avg_holding_days != null ? n2(st.avg_holding_days, 0) + ' days' : '–']].map(function (r) { return [esc(r[0]), r[1]]; }), '', [1])) + '</div>';
    h += card('Orders', 'open orders fill at the next trading day\'s open after the evening run', table(['Placed', 'Stock', 'Side', 'Type', 'Qty', 'Price / trigger', 'Status', 'Note', ''], orders.slice(0, 60).map(function (o) {
      return [esc(String(o.placed_at).slice(0, 10)), esc(o.symbol), esc(o.side), esc(o.type) + (o.origin === 'bracket' ? ' <small class="fo-hint">bracket</small>' : o.origin === 'autopilot' ? ' <small class="fo-hint">model</small>' : ''), o.type === 'sip' ? inr(Number(o.amount)) + '/month' : (o.filled_qty && o.filled_qty !== '0' ? o.filled_qty + '/' : '') + o.qty, [o.limit_price, o.trigger_price].filter(Boolean).join(' / ') || 'market', badge(o.status, o.status === 'filled' ? 'fo-badge--ok' : o.status === 'rejected' ? 'fo-badge--bad' : o.status === 'open' || o.status === 'partial' ? 'fo-badge--gold' : 'fo-badge--muted'), '<small>' + esc(o.note || '') + '</small>', (o.status === 'open' || o.status === 'partial') && a.strategy !== 'autopilot' ? '<button class="btn btn--sm" data-cancel="' + esc(o.order_id) + '">Cancel</button>' : ''];
    }), 'No orders yet.', [4]));
    h += '<div class="fo-grid fo-grid--2">' + card('Fills and contract notes', 'tap a fill for the charges breakdown', table(['Date', 'Stock', 'Side', 'Qty', 'Price', 'Charges'], fills.slice(0, 60).map(function (f) { return { attrs: ' data-fill="' + esc(f.fill_id) + '" class="inv-click"', cells: [esc(f.date), esc(f.symbol), esc(f.side), n2(Number(f.qty), 0), n2(Number(f.price)), inr(Number(f.charges))] }; }), 'No fills yet.', [3, 4, 5])) +
      card('Capital gains (indicative)', 'FIFO lots, short vs long term, ₹1.25 lakh equity LTCG exemption', table(['FY', 'Equity short', 'Equity long', 'Other', 'Tax estimate'], Object.keys((P && P.tax) || {}).sort().reverse().map(function (fy) { var t = P.tax[fy]; return [fy, inr(t.equity_short), inr(t.equity_long), inr(t.other_short + t.other_long), inr(t.tax)]; }), 'No closed trades yet.', [1, 2, 3, 4]) + '<div class="fo-hint">Rates come from the versioned charges file in the engine; verify against the current Budget and a real contract note.</div>') + '</div>';
    body.innerHTML = h + disclaimer();
    if (P && P.curve && P.curve.length > 1) C.combo($('#p-curve'), { labels: P.curve.map(function (x) { return x[0].slice(5); }), height: 240, kind: 'inr', series: [{ name: a.name, type: 'line', values: P.curve.map(function (x) { return x[1]; }) }, { name: 'Nifty 500 (same start)', type: 'line', values: P.curve.map(function (x) { return x[2]; }) }] });
    else $('#p-curve').innerHTML = '<div class="fo-empty">The curve starts after the first evening run marks the account.</div>';
    wirePaper(body);
    $$('[data-cancel]', body).forEach(function (b) { b.onclick = function () { save('f.inv.order.cancel', { order_id: b.dataset.cancel }, 'Cancelled'); }; });
    $$('[data-fill]', body).forEach(function (tr) { tr.onclick = function () { var f = fills.filter(function (x) { return x.fill_id === tr.dataset.fill; })[0], c = {}; try { c = JSON.parse(f.charges_json || '{}'); } catch (e) {}
      U.drawer(head('Contract note · ' + f.symbol, esc(f.side) + ' ' + f.qty + ' @ ' + n2(Number(f.price)) + ' on ' + esc(f.date) + ' · slippage ' + esc(f.slippage_bps) + ' bps') + table(['Charge', '₹'], ['brokerage', 'stt', 'exchange_txn', 'sebi_fee', 'stamp_duty', 'dp_charge', 'gst', 'total'].map(function (k) { return [k === 'total' ? '<b>Total</b>' : esc(k.replace('_', ' ').toUpperCase().replace('STT', 'STT').replace('GST', 'GST')), n2(c[k], 2)]; }), '', [1]) + '<div class="fo-hint">Charges version ' + esc(c.version || '') + '. Value = ' + inr(f.qty * f.price) + '.</div>'); }; });
  }
  function wirePaper(body) {
    var s = $('#p-acct'); if (s) s.onchange = function () { I.acct = this.value; paperView(body); };
    $('#p-new').onclick = accountDrawer;
    var t = $('#p-ticket'); if (t) t.onclick = function () { ticket({}); };
  }
  function accountDrawer() {
    var R = D().risk_defaults || {};
    var p = U.drawer(head('New paper account', 'Virtual money with the same risk rules a disciplined desk would use.') + '<div class="fo-form">' + field('Name', input('pa-name', 'My swing account')) + field('Strategy', sel('pa-strategy', [['manual', 'Manual'], ['model_top10', 'I follow the model top 10'], ['ipo', 'IPO only'], ['bullion', 'Gold-silver tactical'], ['custom', 'Custom']], 'manual')) + field('Starting cash (₹)', input('pa-cash', 1000000, 'number')) +
      Object.keys(R).map(function (k) { return field({ max_stock_pct: 'Max per stock (%)', max_sector_pct: 'Max per sector (%)', max_bullion_pct: 'Max gold + silver (%)', max_sme_pct: 'Max SME IPOs (%)', riskoff_gross_pct: 'Gross exposure cap in risk-off (%)', dd_pause_pct: 'Pause new entries below peak by (%)' }[k] || k, input('pa-' + k, R[k], 'number')); }).join('') +
      '<div class="fo-toolbar full"><button class="btn btn--primary" id="pa-save">Create</button></div></div>');
    $('#pa-save', p).onclick = function () { var risk = {}; Object.keys(R).forEach(function (k) { risk[k] = val(p, 'pa-' + k); }); save('f.inv.account.save', { account: { name: val(p, 'pa-name'), strategy: val(p, 'pa-strategy'), starting_cash: val(p, 'pa-cash'), risk: risk } }, 'Paper account created').then(function (j) { if (j && j.ok) { I.acct = j.account_id; p.closest('.fo-drawer').remove(); } }); };
  }
  function ticket(pre) {
    var s = N(), accts = (D().accounts || []).filter(function (a) { return a.status !== 'closed' && a.strategy !== 'autopilot'; });
    if (!accts.length) { toast('Create a paper account first (Paper trading → New paper account).', true); return; }
    var acc = accts.filter(function (a) { return a.account_id === I.acct; })[0] || accts[0];
    var p = U.drawer(head('Paper order', 'Fills at the next trading day\'s open, with slippage and Indian charges. No real order is ever placed.') + '<div class="fo-form">' + field('Account', sel('t-acct', accts.map(function (a) { return [a.account_id, a.name]; }), acc.account_id)) + field('Symbol', input('t-sym', pre.symbol || '')) +
      field('Side', sel('t-side', [['buy', 'Buy'], ['sell', 'Sell']], 'buy')) + field('Type', sel('t-type', [['market', 'Market'], ['limit', 'Limit'], ['sl', 'Stop-loss limit (SL)'], ['sl-m', 'Stop-loss market (SL-M)'], ['gtt', 'GTT (good till triggered, 1 year)'], ['sip', 'SIP (monthly amount)']], 'market')) +
      field('Quantity', input('t-qty', '', 'number')) + field('Limit price', input('t-limit', '', 'number', ' step="any"')) + field('Trigger price', input('t-trig', '', 'number', ' step="any"')) + field('GTT triggers when the close goes', sel('t-dir', [['', 'Default (buy below / sell above)'], ['below', 'Below the trigger'], ['above', 'Above the trigger']], '')) +
      field('Bracket target (optional)', input('t-target', '', 'number', ' step="any"')) + field('Bracket stop (optional)', input('t-stop', '', 'number', ' step="any"')) + field('SIP amount (₹ a month)', input('t-amt', '', 'number')) + field('SIP day of month', input('t-day', 5, 'number')) + field('Validity', sel('t-val', [['day', 'Day'], ['gtc', 'Good till cancelled']], 'day')) +
      '<div class="full" id="t-hint"></div><div class="fo-toolbar full"><button class="btn btn--primary" id="t-place">Place paper order</button></div></div>');
    function hint() {
      var sym = val(p, 't-sym').toUpperCase(), px = s && s.prices && s.prices[sym], a = (s && s.paper && s.paper[val(p, 't-acct')]) || null, eq = a ? a.equity : Number(acc.starting_cash);
      var sc = s && (s.screener || []).filter(function (x) { return x.symbol === sym; })[0];
      if (!px) { $('#t-hint', p).innerHTML = sym ? '<div class="fo-hint">' + esc(sym) + ' has no price yet: add it to your watchlist first.</div>' : ''; return; }
      var risk = (s && s.regime && s.regime.label === 'Risk-off') ? 0.5 : 1, q = px.atr14 ? Math.floor(eq * 0.01 * risk / (2 * px.atr14)) : null;
      $('#t-hint', p).innerHTML = '<div class="fo-card"><b>' + esc(sym) + '</b> last ' + n2(px.close) + ' (' + esc(px.date) + ')' + (sc ? ' · model score ' + n2(sc.composite, 0) + ', rank ' + sc.rank : '') + (q ? '<br>Volatility sizing: risking 1% of ' + inr(eq) + (risk < 1 ? ' (halved: risk-off)' : '') + ' with a 2 × ATR stop → <b>' + q + ' shares</b> (' + inr(q * px.close) + '), stop near ' + n2(px.close - 2 * px.atr14) + ' <button class="btn btn--sm" id="t-use">Use</button>' : '') + '</div>';
      var u = $('#t-use', p); if (u) u.onclick = function () { $('#t-qty', p).value = q; $('#t-stop', p).value = (px.close - 2 * px.atr14).toFixed(2); };
    }
    $('#t-sym', p).oninput = hint; $('#t-acct', p).onchange = hint; hint();
    $('#t-place', p).onclick = function () {
      var o = { account_id: val(p, 't-acct'), symbol: val(p, 't-sym'), side: val(p, 't-side'), type: val(p, 't-type'), qty: val(p, 't-qty'), limit_price: val(p, 't-limit'), trigger_price: val(p, 't-trig'), trigger_dir: val(p, 't-dir'), target: val(p, 't-target'), stop: val(p, 't-stop'), amount: val(p, 't-amt'), sip_day: val(p, 't-day'), validity: val(p, 't-val') };
      save('f.inv.order.place', { order: o }, 'Paper order queued').then(function (j) { if (j && j.ok) { I.acct = o.account_id; p.closest('.fo-drawer').remove(); } });
    };
  }

  // ------------------------------------------------------------ Investing options ------------------------------------------------------------
  function options(body) {
    var s = N(), prof = D().profile || {}, answers = prof.answers || [], cur = prof.profile;
    var h = card('Your risk profile', cur ? 'saved: ' + cur : '10 questions, 2 minutes', '<div class="fo-form">' + K.QUESTIONS.map(function (q, i) { return field((i + 1) + '. ' + q[0], sel('q' + i, q[1].map(function (o, j) { return [j, o]; }), answers[i] != null ? answers[i] : 2), true); }).join('') + '<div class="fo-toolbar full"><button class="btn btn--primary" id="q-save">Save my profile</button><span id="q-out" class="fo-hint"></span></div></div>');
    var profile = cur || 'Balanced', alloc = K.ALLOC[profile];
    h += card('Strategic allocation · ' + profile, 'editable starting point; your rebalancing gaps use it', table(['Class', 'Target'], Object.keys(alloc).map(function (k) { return [esc(CLS[k] || k), pct(alloc[k], 0)]; }), '', [1]));
    var ports = s && s.portfolios && s.portfolios[profile] || {};
    h += card('Model portfolios · ' + profile, 'six construction methods side by side, built from ETF proxies (NIFTYBEES, MID150BEES, GOLDBEES, SILVERBEES, GILT5YBEES, LIQUIDBEES)', Object.keys(ports).length ? table(['Method', 'Expected return (±1σ)', 'Volatility', 'Sharpe', 'Max drawdown (backtest)', 'Covid crash', '2022 rate shock', 'Weights'], Object.keys(METHODS).filter(function (m) { return ports[m]; }).map(function (m) {
      var x = ports[m], st = x.stress || {};
      return ['<b>' + esc(METHODS[m]) + '</b>', pct(x.exp_return) + ' <small class="fo-hint">(' + pct(x.exp_low, 0) + ' to ' + pct(x.exp_high, 0) + ')</small>', pct(x.volatility), n2(x.sharpe), pct(x.max_drawdown), sg(st['Covid crash (Feb–Mar 2020)']), sg(st['2022 rate shock (Jan–Jun 2022)']), Object.keys(x.weights).filter(function (k) { return x.weights[k] > 0.005; }).map(function (k) { return esc(CLS[k] || k) + ' ' + pct(x.weights[k], 0); }).join(', ')];
    }), '', [1, 2, 3, 4, 5, 6]) + '<div class="fo-hint">Strategic + tilt moves each class ±5 points with the model\'s 60-day outlook. Black-Litterman blends your profile (prior) with that outlook (views). Stress windows need data from those dates (history starts 2020). 2008 and the 2013 taper tantrum predate the free data.</div>' : '<div class="fo-empty">Needs about a year of ETF history from the engine.</div>');
    h += card('Investment menu', 'what each option is for', table(['Option', 'Instruments', 'Role', 'Live data here'], [
      ['Direct equity', 'Nifty 200 stocks ranked by score', 'Growth, alpha', 'Score, rank, P(top 20%), ATR'], ['Index funds and ETFs', 'NIFTYBEES, JUNIORBEES, MID150BEES, sector ETFs', 'Low-cost core', 'Returns, volatility, Nifty P/E percentile'], ['Active mutual funds', 'Funds you hold or watch (AMFI code)', 'Delegated management', 'Daily NAV, your XIRR'],
      ['Gold', 'Gold ETFs, SGBs, physical (IBJA)', 'Hedge, diversifier', 'IBJA rates, outlook band'], ['Silver', 'Silver ETFs, physical', 'Cyclical commodity', 'IBJA rate, gold-silver ratio'], ['Government debt', 'T-bills, G-secs (RBI Retail Direct), gilt funds', 'Stability, duration', 'Gilt ETF returns'],
      ['Corporate debt and FDs', 'Bond funds, bank FDs', 'Income', 'Your FD/RD accrual'], ['REITs and InvITs', 'Listed REITs / InvITs', 'Income, real assets', 'Add symbols to the watchlist'], ['IPOs', 'Mainboard and SME issues', 'Opportunistic', 'Board with paper verdicts'],
    ].map(function (r) { return r.map(esc); })));
    var goals = D().goals && D().goals.length ? D().goals : [{ name: 'Retirement corpus', target: 30000000, years: 20, sip: 50000, start: 0, method: 'strategic_tilt' }];
    h += card('Goal planner', '10,000 Monte Carlo paths with the chosen portfolio\'s expected return and volatility', '<div id="g-list"></div><div class="fo-toolbar"><button class="btn" id="g-add">Add goal</button><button class="btn btn--primary" id="g-save">Save goals</button></div>');
    body.innerHTML = h + disclaimer();
    function profileNow() { var a = K.QUESTIONS.map(function (_, i) { return Number(val(body, 'q' + i)); }); return { a: a, r: K.profileOf(a) }; }
    function showProf() { var x = profileNow().r; $('#q-out').textContent = 'Score ' + x.score + '/40 → ' + x.profile + (x.capped ? ' (capped by your time horizon or loss tolerance)' : ''); }
    K.QUESTIONS.forEach(function (_, i) { $('#q' + i).onchange = showProf; }); showProf();
    $('#q-save').onclick = function () { var x = profileNow(); save('f.inv.profile.save', { profile: { answers: x.a, profile: x.r.profile }, goals: readGoals() }, 'Profile saved: ' + x.r.profile); };
    function stats(method) { var x = ports[method] || ports.strategic_tilt; return x ? { mu: x.exp_return, sigma: x.volatility } : { mu: 0.10, sigma: 0.14 }; }
    function renderGoals(list) {
      $('#g-list').innerHTML = list.map(function (g, i) {
        var st = stats(g.method), r = K.goal({ start: Number(g.start) || 0, sip: Number(g.sip) || 0, years: Number(g.years) || 10, target: Number(g.target) || 0, mu: st.mu, sigma: st.sigma }), need = K.sipFor({ start: Number(g.start) || 0, years: Number(g.years) || 10, target: Number(g.target) || 0, mu: st.mu, sigma: st.sigma }, 0.8);
        return '<div class="fo-card inv-goal" data-g="' + i + '"><div class="fo-form">' + field('Goal', input('g-name-' + i, g.name)) + field('Target (₹, today\'s money)', input('g-target-' + i, g.target, 'number')) + field('Years', input('g-years-' + i, g.years, 'number')) + field('Monthly SIP (₹)', input('g-sip-' + i, g.sip, 'number')) + field('Already invested (₹)', input('g-start-' + i, g.start, 'number')) + field('Portfolio', sel('g-method-' + i, Object.keys(METHODS).map(function (m) { return [m, METHODS[m]]; }), g.method)) + '</div>' +
          '<p><b>' + pct(r.prob, 0) + '</b> chance of reaching ' + inr(Number(g.target)) + ' · median outcome ' + inr(r.p50) + ' (10th–90th percentile ' + inr(r.p10) + ' – ' + inr(r.p90) + ') · you put in ' + inr(r.paid) + '. For an 80% chance, invest about <b>' + inr(need) + '</b> a month.</p>' +
          '<div class="fo-hint">Assumes ' + pct(st.mu) + ' a year with ' + pct(st.sigma) + ' volatility, before tax and inflation. Treat the target as today\'s money only if you also raise the SIP with inflation.</div></div>';
      }).join('');
      $$('.inv-goal input, .inv-goal select', body).forEach(function (e) { e.onchange = function () { renderGoals(readGoals()); }; });
    }
    function readGoals() { return $$('.inv-goal', body).map(function (c) { var i = c.dataset.g; return { name: val(body, 'g-name-' + i), target: val(body, 'g-target-' + i), years: val(body, 'g-years-' + i), sip: val(body, 'g-sip-' + i), start: val(body, 'g-start-' + i), method: val(body, 'g-method-' + i) }; }); }
    renderGoals(goals);
    $('#g-add').onclick = function () { var l = readGoals(); l.push({ name: 'New goal', target: 1000000, years: 5, sip: 10000, start: 0, method: 'strategic_tilt' }); renderGoals(l); };
    $('#g-save').onclick = function () { var x = profileNow(); save('f.inv.profile.save', { profile: { answers: x.a, profile: (D().profile || {}).profile || x.r.profile }, goals: readGoals() }, 'Goals saved'); };
  }

  // ------------------------------------------------------------ Model health ------------------------------------------------------------
  function model(body) {
    var s = N(); if (!s) return noEngine(body);
    var m = s.model || {}, ch = m.champion || {}, cl = m.challenger || {}, ic = m.ic || {};
    var h = '<div class="fo-grid fo-grid--4">' + kpi('Health', lightBadge(m.light), esc(m.note || '')) + kpi('Composite IC (60 days)', m.ic_mean && m.ic_mean.composite != null ? n2(m.ic_mean.composite, 3) : '–', 'target above 0.03') + kpi('Champion', esc(ch.version || '–'), ch.trained_on ? 'trained ' + esc(ch.trained_on) + ' on ' + n2(ch.rows, 0) + ' rows' : '') + kpi('Challenger', esc(cl.version || '–'), cl.shadow_since ? 'shadowing since ' + esc(cl.shadow_since) : '') + '</div>';
    h += card('Rank information coefficient', 'daily Spearman correlation between yesterday\'s scores and what happened over 20 trading days', '<div class="fo-chartbox" id="m-ic"></div>');
    h += '<div class="fo-grid fo-grid--2">' + card('Score weights', 'moved daily by recent skill, at most 5 points a week, each between 10% and 50%', table(['Component', 'Weight', '60-day IC'], Object.keys(m.weights || {}).map(function (k) { return [{ T: 'Technical', M: 'ML model', S: 'Flow / sentiment' }[k] || k, pct(m.weights[k], 0), n2(m.ic_mean && m.ic_mean[k], 3)]; }), '', [1, 2]) +
      table(['Technical family', 'Weight', 'IC'], Object.keys(m.family_weights || {}).map(function (k) { return [esc(k), pct(m.family_weights[k], 0), n2(m.family_ic && m.family_ic[k], 3)]; }), '', [1, 2])) +
      card('Promotion gate', 'a challenger replaces the champion only if ALL hold over 3 months out-of-sample + 4 weeks of shadowing', '<ol class="fo-steps"><li>Rank IC higher by ≥ 0.01, paired-test p < 0.10</li><li>Top-decile return higher after costs, drawdown not worse by > 2 points</li><li>Calibration (Brier) not worse</li><li>Deflated Sharpe probability > 0.95 (' + n2(m.trials, 0) + ' models tried so far)</li><li>No data-quality incidents in the shadow window</li></ol>' + (m.last_gate ? '<p><b>Last check ' + esc(m.last_gate.date) + ':</b> ' + (m.last_gate.passed ? 'passed' : 'not promoted') + ' — ' + esc((m.last_gate.reasons || []).join('; ')) + '</p>' : '<p class="fo-hint">First check after 4 weeks of shadowing.</p>') + '<p class="fo-hint">Risk caps, the red-flag gate, the ban on live orders and point-in-time validation are hard limits in code: the loop cannot change them.</p>') + '</div>';
    h += '<div class="fo-grid fo-grid--2">' + card('Signal events · live track record', 'Bayesian hit rate (Beta prior) of beating the Nifty 500 over 20 days', table(['Event', 'Matured', 'Hit rate', 'Avg excess 5d', 'Avg excess 20d', 'Open'], Object.keys((s.events || {}).track || {}).map(function (k) { var t = s.events.track[k]; return [esc(t.label), t.n, pct(t.hit_rate, 0), sg(t.avg_ex5), sg(t.avg_ex20), t.open]; }), 'Events need 20 trading days to mature.', [1, 2, 3, 4, 5])) +
      card('Drift monitor', 'Population Stability Index, last month vs the training year (alarm above 0.25)', table(['Feature', 'PSI'], Object.keys(m.drift || {}).sort(function (a, b) { return m.drift[b] - m.drift[a]; }).slice(0, 12).map(function (k) { return [esc(k), '<span class="' + (m.drift[k] > 0.25 ? 'inv-down' : '') + '">' + n2(m.drift[k], 3) + '</span>']; }), 'Needs a few months of data.', [1]) + (m.drift_alarm ? '<div class="fo-alert fo-alert--bad">Drift alarm: a retrain is scheduled.</div>' : '')) + '</div>';
    h += card('Model log', 'promotions, retirements and first models', table(['Date', 'Event', 'Version', 'Detail'], (m.log || []).slice().reverse().map(function (x) { return [esc(x.at), esc(x.event), esc(x.version || ''), esc(x.replaced ? 'replaced ' + x.replaced : (x.reasons || []).join('; '))]; }), 'Nothing yet.') + ((m.retired || []).length ? '<div class="fo-hint">Retired champions kept for one-click rollback: ' + m.retired.map(function (r) { return esc(r.version); }).join(', ') + '. Rollback runs in the engine (tell Claude "roll back the markets model to …").</div>' : ''));
    body.innerHTML = h + disclaimer();
    var keys = ['composite', 'M', 'T', 'S'].filter(function (k) { return ic[k] && ic[k].length; });
    if (keys.length) { var labels = ic[keys[0]].map(function (x) { return x[0].slice(5); }); C.combo($('#m-ic'), { labels: labels, height: 220, kind: 'n', series: keys.map(function (k) { var mp = {}; ic[k].forEach(function (x) { mp[x[0].slice(5)] = x[1]; }); return { name: { composite: 'Composite', M: 'ML', T: 'Technical', S: 'Flow' }[k], type: 'line', values: labels.map(function (l) { return mp[l] == null ? null : mp[l]; }) }; }) }); }
    else $('#m-ic').innerHTML = '<div class="fo-empty">Predictions need 20 trading days to mature before the IC can be measured.</div>';
  }

  // ------------------------------------------------------------ Academy ------------------------------------------------------------
  function academy(body) {
    var s = N(), dom = I.dom || 'all';
    var cards = A.CARDS.filter(function (c) { return dom === 'all' || c.domain === dom; });
    var h = '<div class="fo-toolbar">' + sel('ac-dom', [['all', 'All domains']].concat(A.domains.map(function (d) { return [d, d]; })), dom) + '<button class="btn btn--primary" id="ac-quiz">Quiz me (5 questions)</button></div><div id="ac-q"></div>';
    h += '<div class="inv-cards">' + cards.map(function (c) {
      var live = c.live ? c.live(s) : null;
      return '<div class="fo-card inv-concept"><div class="fo-hint">' + esc(c.domain) + '</div><h3>' + esc(c.title) + '</h3><p>' + esc(c.def) + '</p><p class="inv-formula">' + esc(c.formula) + '</p><p><b>Why it matters:</b> ' + esc(c.why) + '</p><p><b>Pitfall:</b> ' + esc(c.pitfall) + '</p>' + (live ? '<p class="inv-live">Live: ' + esc(live) + '</p>' : '') + '<p class="fo-hint">Used in: ' + esc(c.used) + ' · Read: ' + esc(c.ref) + '</p></div>';
    }).join('') + '</div>';
    body.innerHTML = h + disclaimer();
    $('#ac-dom').onchange = function () { I.dom = this.value; academy(body); };
    $('#ac-quiz').onclick = function () {
      var qs = A.quiz(dom === 'all' ? null : dom, Math.floor(Date.now() / 60000)), score = 0, done = 0;
      $('#ac-q').innerHTML = '<div class="fo-card">' + qs.map(function (q, i) { return '<div class="inv-q"><p><b>' + (i + 1) + '.</b> Which concept is this? <i>' + esc(q.q) + '</i></p>' + q.options.map(function (o) { return '<button class="btn btn--sm" data-q="' + i + '" data-o="' + esc(o) + '">' + esc(o) + '</button> '; }).join('') + '</div>'; }).join('') + '<p id="ac-score" class="fo-hint"></p></div>';
      $$('[data-q]', body).forEach(function (b) { b.onclick = function () {
        var q = qs[b.dataset.q], box = b.parentNode; if (box.dataset.done) return; box.dataset.done = 1; done++;
        var right = b.dataset.o === q.answer; if (right) score++;
        $$('button', box).forEach(function (x) { x.disabled = true; if (x.dataset.o === q.answer) x.classList.add('btn--primary'); });
        if (!right) { try { var miss = JSON.parse(localStorage.getItem('fo_inv_missed') || '{}'); miss[q.slug] = (miss[q.slug] || 0) + 1; localStorage.setItem('fo_inv_missed', JSON.stringify(miss)); } catch (e) {} }
        $('#ac-score').textContent = score + ' / ' + done + (done === qs.length ? (score === qs.length ? ' · perfect' : ' · review the cards you missed') : '');
      }; });
    };
  }

  // ------------------------------------------------------------ Settings ------------------------------------------------------------
  function settings(body) {
    var k = D().key, s = N();
    var h = card('Markets engine connection', k ? 'connected key created ' + esc(String(k.created_at).slice(0, 10)) : 'not connected', '<ol class="fo-steps"><li>Tap <b>Create markets key</b> below and copy the key (shown once).</li><li>Open <a href="https://github.com/apvillasandresorts/ap-markets/settings/secrets/actions/new" target="_blank" rel="noopener">the ap-markets repo → Settings → Secrets → New secret</a>, name it <code>FO_MARKETS_KEY</code>, paste, save.</li><li>Run the workflow once: <a href="https://github.com/apvillasandresorts/ap-markets/actions" target="_blank" rel="noopener">Actions → Markets daily → Run workflow</a>. After that it runs every trading evening at 16:45 IST and IBJA rates at 12:30 and 17:30.</li></ol>' +
      '<div class="fo-toolbar"><button class="btn btn--primary" id="k-new">' + (k ? 'Replace markets key' : 'Create markets key') + '</button>' + (k ? '<button class="btn" id="k-rev">Revoke</button>' : '') + '</div><div id="k-out"></div><p class="fo-hint">The key can only pull paper orders and the list of symbols to price, and push results. It cannot read your holdings\' quantities, guests, bookings or anything else.</p>');
    h += card('Data sources', 'spec rule R3: every source has a terms status; unverified sources are never fetched', table(['Source', 'Terms', 'Used for'], ((s && s.sources) || []).map(function (x) { return [esc(x.name), badge(x.terms_status, x.terms_status === 'unverified' ? 'fo-badge--bad' : x.terms_status === 'permitted' ? 'fo-badge--ok' : 'fo-badge--gold'), esc(x.used_for)]; }), 'Listed after the first run.'));
    h += card('What the free plan does not include', '', '<ul><li>Company fundamentals, forensic scores and DCF (needs a licensed fundamentals API; paid tiers start around ₹400–500 a month)</li><li>Intraday bars, MCX futures and live ticks (needs a broker API)</li><li>FII / DII flows and the official India 10-year yield</li><li>An automatic IPO feed (you type in IPO details; GMP sites are not scraped)</li></ul><p class="fo-hint">Each slot is ready in the engine: adding a source later is configuration, not a rewrite.</p>');
    h += card('Rules that never change', '', '<ul><li>Paper only: no code path places a real order (SEBI\'s 2026 retail algo rules would also require a static IP and an exchange Algo ID).</li><li>Model output is for you alone. Showing signals to others needs SEBI Research Analyst registration.</li><li>Keys live only in Script Properties and GitHub secrets, never in Sheets or the page.</li><li>Every score and prediction is logged with its model version: the audit trail.</li></ul>');
    body.innerHTML = h + disclaimer();
    $('#k-new').onclick = function () { if (k && !confirm('Replace the key? The engine stops until you paste the new one into GitHub.')) return; U.api('f.inv.key').then(function (j) { if (!j.ok) return toast(j.error, true); $('#k-out').innerHTML = '<div class="fo-card"><b>Copy now (shown once):</b><pre class="inv-key">' + esc(j.key) + '</pre><button class="btn btn--sm" id="k-copy">Copy</button></div>'; $('#k-copy').onclick = function () { navigator.clipboard.writeText(j.key).then(function () { toast('Copied'); }); }; }); };
    var r = $('#k-rev'); if (r) r.onclick = function () { if (confirm('Revoke the markets key? The engine stops at once.')) save('f.inv.key.revoke', {}, 'Revoked'); };
  }

  U.VIEWS.investments = view;
  window.FoInvest = { view: view, reload: load };
})();
