/**
 * AP Villas Founder OS · tiny SVG chart kit (no third-party code on the admin page).
 * Every chart is drawn from data passed in, supports hover values, click-to-drill-down and SVG/CSV export.
 */
var FoCharts = (function () {
  var NS = 'http://www.w3.org/2000/svg';
  var PALETTE = ['#0F5C45', '#C9A24F', '#2F8F6B', '#8C6512', '#5B7F95', '#B5532A', '#7A6FA8', '#3C4A45', '#9BB8A8', '#E2C27A'];
  function el(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function txt(parent, x, y, s, attrs) { var t = el('text', Object.assign({ x: x, y: y }, attrs || {}), parent); t.textContent = s; return t; }
  function nice(max) { if (!(max > 0)) return 1; var p = Math.pow(10, Math.floor(Math.log10(max))), f = max / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 4 ? 4 : f <= 8 ? 8 : 10) * p; }   // divisible by 4 → round gridlines
  function fmt(v, kind) {
    if (v == null || !isFinite(v)) return '—';
    if (v < 0 && (kind === 'inr' || kind === 'n' || !kind)) return '−' + fmt(-v, kind);
    if (kind === 'inr') return '₹' + (Math.abs(v) >= 100000 ? (v / 100000).toFixed(1).replace(/\.0$/, '') + 'L' : Math.round(v).toLocaleString('en-IN'));
    if (kind === 'pct') return (v * 100).toFixed(v < 0.1 ? 1 : 0) + '%';
    if (kind === 'days') return v.toFixed(1) + ' d';
    return Math.round(v * 10) / 10 + '';
  }
  function frame(host, h) {
    host.innerHTML = '';
    var w = Math.max(host.clientWidth || 600, 280);
    var svg = el('svg', { viewBox: '0 0 ' + w + ' ' + h, width: '100%', height: h, role: 'img', class: 'fo-chart', 'font-family': 'Inter, system-ui, sans-serif', 'font-size': 11 }, host);
    return { svg: svg, w: w, h: h };
  }
  function tip(host) {
    var t = host.querySelector('.fo-tip'); if (t) return t;
    t = document.createElement('div'); t.className = 'fo-tip'; t.hidden = true; host.style.position = 'relative'; host.appendChild(t); return t;
  }
  function showTip(host, evt, html) {
    var t = tip(host), r = host.getBoundingClientRect();
    t.innerHTML = html; t.hidden = false;
    var x = evt.clientX - r.left + 12, y = evt.clientY - r.top + 12;
    if (x + 200 > r.width) x = r.width - 210;
    t.style.left = Math.max(0, x) + 'px'; t.style.top = y + 'px';
  }
  function hideTip(host) { var t = host.querySelector('.fo-tip'); if (t) t.hidden = true; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function empty(host, msg) { host.innerHTML = '<div class="fo-empty">' + esc(msg || 'No data for this period yet.') + '</div>'; }

  /**
   * Bars (grouped or stacked) and lines on one category axis.
   * opt: { labels:[], series:[{name, values:[], type:'bar'|'line', axis:'left'|'right', kind}], stacked, height, kind, rightKind, onClick(i) }
   */
  function combo(host, opt) {
    var labels = opt.labels || [];
    if (!labels.length || !opt.series.some(function (s) { return s.values.some(function (v) { return v; }); })) return empty(host, opt.empty);
    var f = frame(host, opt.height || 240), svg = f.svg, pad = { l: 58, r: opt.series.some(function (s) { return s.axis === 'right'; }) ? 52 : 16, t: 14, b: 40 };
    var W = f.w - pad.l - pad.r, H = f.h - pad.t - pad.b, n = labels.length, step = W / n;
    var bars = opt.series.filter(function (s) { return s.type !== 'line'; }), lines = opt.series.filter(function (s) { return s.type === 'line'; });
    var leftMax = 0, rightMax = 0;
    for (var i = 0; i < n; i++) {
      var stackSum = 0;
      bars.forEach(function (s) { var v = s.values[i] || 0; if (opt.stacked) stackSum += v; else leftMax = Math.max(leftMax, v); });
      if (opt.stacked) leftMax = Math.max(leftMax, stackSum);
      lines.forEach(function (s) { var v = s.values[i] || 0; if (s.axis === 'right') rightMax = Math.max(rightMax, v); else leftMax = Math.max(leftMax, v); });
    }
    leftMax = nice(leftMax); rightMax = nice(rightMax);
    var y = function (v) { return pad.t + H - (v / leftMax) * H; }, yr = function (v) { return pad.t + H - (v / rightMax) * H; };
    for (var g = 0; g <= 4; g++) {
      var gv = leftMax * g / 4, gy = y(gv);
      el('line', { x1: pad.l, x2: pad.l + W, y1: gy, y2: gy, class: 'fo-grid' }, svg);
      txt(svg, pad.l - 6, gy + 4, fmt(gv, opt.kind), { 'text-anchor': 'end', class: 'fo-axis' });
      if (pad.r > 20) txt(svg, pad.l + W + 6, gy + 4, fmt(rightMax * g / 4, opt.rightKind), { class: 'fo-axis' });
    }
    var every = Math.ceil(n / Math.max(1, Math.floor(W / 64)));
    labels.forEach(function (l, i) { if (i % every === 0) txt(svg, pad.l + step * i + step / 2, f.h - pad.b + 16, String(l), { 'text-anchor': 'middle', class: 'fo-axis' }); });
    var bw = Math.max(2, Math.min(38, step * 0.7 / (opt.stacked ? 1 : Math.max(1, bars.length))));
    labels.forEach(function (l, i) {
      var base = pad.t + H;
      bars.forEach(function (s, k) {
        var v = s.values[i] || 0, h = (v / leftMax) * H, x = opt.stacked ? pad.l + step * i + (step - bw) / 2 : pad.l + step * i + (step - bw * bars.length) / 2 + bw * k;
        var yy = opt.stacked ? base - h : pad.t + H - h;
        if (h > 0) el('rect', { x: x, y: yy, width: bw, height: h, rx: 2, fill: s.color || PALETTE[opt.series.indexOf(s) % PALETTE.length], class: 'fo-bar' }, svg);
        if (opt.stacked) base -= h;
      });
    });
    lines.forEach(function (s) {
      var color = s.color || PALETTE[opt.series.indexOf(s) % PALETTE.length], yf = s.axis === 'right' ? yr : y, d = '';
      s.values.forEach(function (v, i) { if (v == null) return; d += (d ? 'L' : 'M') + (pad.l + step * i + step / 2) + ' ' + yf(v); });
      if (d) el('path', { d: d, fill: 'none', stroke: color, 'stroke-width': 2.2, 'stroke-linejoin': 'round' }, svg);
      s.values.forEach(function (v, i) { if (v != null && n <= 60) el('circle', { cx: pad.l + step * i + step / 2, cy: yf(v), r: 3, fill: color }, svg); });
    });
    // hover/click columns
    labels.forEach(function (l, i) {
      var hit = el('rect', { x: pad.l + step * i, y: pad.t, width: step, height: H, fill: 'transparent', class: 'fo-hit' + (opt.onClick ? ' fo-click' : '') }, svg);
      hit.addEventListener('mousemove', function (e) {
        showTip(host, e, '<b>' + esc(l) + '</b>' + opt.series.map(function (s) { return '<div><i style="background:' + (s.color || PALETTE[opt.series.indexOf(s) % PALETTE.length]) + '"></i>' + esc(s.name) + ': ' + fmt(s.values[i], s.kind || (s.axis === 'right' ? opt.rightKind : opt.kind)) + '</div>'; }).join('') + (opt.onClick ? '<small>Click for the bookings</small>' : ''));
      });
      hit.addEventListener('mouseleave', function () { hideTip(host); });
      if (opt.onClick) hit.addEventListener('click', function () { opt.onClick(i); });
    });
    legend(host, opt.series);
  }
  function legend(host, series) {
    var d = document.createElement('div'); d.className = 'fo-legend';
    d.innerHTML = series.map(function (s, i) { return '<span><i style="background:' + (s.color || PALETTE[i % PALETTE.length]) + '"></i>' + esc(s.name) + '</span>'; }).join('');
    host.appendChild(d);
  }
  /** Donut: items [{label, value}] */
  function donut(host, items, opt) {
    opt = opt || {};
    items = items.filter(function (x) { return x.value > 0; });
    var total = items.reduce(function (s, x) { return s + x.value; }, 0);
    if (!total) return empty(host, opt.empty);
    var f = frame(host, opt.height || 220), cx = Math.min(f.w / 2, 120), cy = f.h / 2, r = Math.min(cy - 8, 90), ir = r * 0.62, a = -Math.PI / 2;
    items.forEach(function (it, i) {
      var sweep = it.value / total * Math.PI * 2, a2 = a + sweep, large = sweep > Math.PI ? 1 : 0;
      var p = sweep >= Math.PI * 2 - 1e-6
        ? 'M' + (cx + r) + ' ' + cy + 'A' + r + ' ' + r + ' 0 1 1 ' + (cx - r) + ' ' + cy + 'A' + r + ' ' + r + ' 0 1 1 ' + (cx + r) + ' ' + cy + 'M' + (cx + ir) + ' ' + cy + 'A' + ir + ' ' + ir + ' 0 1 0 ' + (cx - ir) + ' ' + cy + 'A' + ir + ' ' + ir + ' 0 1 0 ' + (cx + ir) + ' ' + cy
        : 'M' + (cx + r * Math.cos(a)) + ' ' + (cy + r * Math.sin(a)) + 'A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + (cx + r * Math.cos(a2)) + ' ' + (cy + r * Math.sin(a2)) +
          'L' + (cx + ir * Math.cos(a2)) + ' ' + (cy + ir * Math.sin(a2)) + 'A' + ir + ' ' + ir + ' 0 ' + large + ' 0 ' + (cx + ir * Math.cos(a)) + ' ' + (cy + ir * Math.sin(a)) + 'Z';
      var path = el('path', { d: p, fill: PALETTE[i % PALETTE.length], 'fill-rule': 'evenodd', class: opt.onClick ? 'fo-click' : '' }, f.svg);
      path.addEventListener('mousemove', function (e) { showTip(host, e, '<b>' + esc(it.label) + '</b><div>' + fmt(it.value, opt.kind) + ' · ' + fmt(it.value / total, 'pct') + '</div>'); });
      path.addEventListener('mouseleave', function () { hideTip(host); });
      if (opt.onClick) path.addEventListener('click', function () { opt.onClick(it); });
      a = a2;
    });
    txt(f.svg, cx, cy - 2, fmt(total, opt.kind), { 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700, class: 'fo-strong' });
    txt(f.svg, cx, cy + 16, opt.centerLabel || 'total', { 'text-anchor': 'middle', class: 'fo-axis' });
    var lx = cx + r + 24;
    if (lx + 120 < f.w) items.slice(0, 9).forEach(function (it, i) {
      el('rect', { x: lx, y: 18 + i * 21, width: 10, height: 10, rx: 2, fill: PALETTE[i % PALETTE.length] }, f.svg);
      txt(f.svg, lx + 16, 27 + i * 21, it.label + ' · ' + fmt(it.value / total, 'pct'), { class: 'fo-label' });
    });
    else legend(host, items.map(function (it, i) { return { name: it.label + ' ' + fmt(it.value / total, 'pct'), color: PALETTE[i % PALETTE.length] }; }));
  }
  /** Horizontal bars: items [{label, value, sub}] */
  function hbars(host, items, opt) {
    opt = opt || {};
    if (!items.length || !items.some(function (x) { return x.value; })) return empty(host, opt.empty);
    var rowH = 30, f = frame(host, items.length * rowH + 16), max = nice(Math.max.apply(null, items.map(function (x) { return x.value || 0; })));
    var lw = Math.min(170, f.w * 0.35), W = f.w - lw - 90;
    items.forEach(function (it, i) {
      var y = 8 + i * rowH;
      txt(f.svg, lw - 8, y + 15, it.label, { 'text-anchor': 'end', class: 'fo-label' });
      el('rect', { x: lw, y: y + 4, width: W, height: 16, rx: 4, class: 'fo-track' }, f.svg);
      var bar = el('rect', { x: lw, y: y + 4, width: Math.max(0, (it.value || 0) / max * W), height: 16, rx: 4, fill: it.color || PALETTE[i % PALETTE.length], class: opt.onClick ? 'fo-click' : '' }, f.svg);
      txt(f.svg, lw + W + 8, y + 16, fmt(it.value, opt.kind) + (it.sub ? ' · ' + it.sub : ''), { class: 'fo-label' });
      if (opt.onClick) bar.addEventListener('click', function () { opt.onClick(it); });
    });
  }
  /** Waterfall: steps [{label, value, total:bool}] (totals drawn from zero, others float from the running sum). */
  function waterfall(host, steps, opt) {
    opt = opt || {};
    if (!steps.length) return empty(host, opt.empty);
    var f = frame(host, opt.height || 240), pad = { l: 62, r: 12, t: 14, b: 44 }, W = f.w - pad.l - pad.r, H = f.h - pad.t - pad.b;
    var run = 0, bars = steps.map(function (s) { var from = s.total ? 0 : run, to = s.total ? s.value : run + s.value; run = to; return { s: s, a: Math.min(from, to), b: Math.max(from, to) }; });
    var lo = Math.min(0, Math.min.apply(null, bars.map(function (x) { return x.a; }))), hi = nice(Math.max.apply(null, bars.map(function (x) { return x.b; })) - lo) + lo;
    var y = function (v) { return pad.t + H - (v - lo) / (hi - lo) * H; }, step = W / steps.length, bw = Math.min(64, step * 0.6);
    for (var g = 0; g <= 4; g++) { var gv = lo + (hi - lo) * g / 4; el('line', { x1: pad.l, x2: pad.l + W, y1: y(gv), y2: y(gv), class: 'fo-grid' }, f.svg); txt(f.svg, pad.l - 6, y(gv) + 4, fmt(gv, opt.kind), { 'text-anchor': 'end', class: 'fo-axis' }); }
    bars.forEach(function (x, i) {
      var color = x.s.total ? '#0F5C45' : x.s.value >= 0 ? '#2F8F6B' : '#B4402A', X = pad.l + step * i + (step - bw) / 2;
      var r = el('rect', { x: X, y: y(x.b), width: bw, height: Math.max(1, y(x.a) - y(x.b)), rx: 3, fill: color }, f.svg);
      txt(f.svg, X + bw / 2, y(x.b) - 5, (x.s.total || x.s.value < 0 ? '' : '+') + fmt(x.s.value, opt.kind), { 'text-anchor': 'middle', class: 'fo-label' });
      txt(f.svg, X + bw / 2, f.h - pad.b + 16, x.s.label, { 'text-anchor': 'middle', class: 'fo-axis' });
      r.addEventListener('mousemove', function (e) { showTip(host, e, '<b>' + esc(x.s.label) + '</b><div>' + fmt(x.s.value, opt.kind) + '</div>'); });
      r.addEventListener('mouseleave', function () { hideTip(host); });
    });
  }
  /** PNG export (draws the SVG on a canvas at 2× for sharpness). */
  function exportPng(host, name) {
    var svg = host.querySelector('svg'); if (!svg) return;
    var clone = svg.cloneNode(true), w = svg.viewBox.baseVal.width, h = svg.viewBox.baseVal.height;
    clone.setAttribute('xmlns', NS); clone.setAttribute('width', w); clone.setAttribute('height', h);
    var st = document.createElementNS(NS, 'style'); st.textContent = 'text{fill:#1C2421;font-family:Arial,sans-serif}.fo-grid{stroke:#E3E9E5}.fo-axis{fill:#6B756F}.fo-track{fill:#EEF2EF}'; clone.insertBefore(st, clone.firstChild);
    var url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' })), img = new Image();
    img.onload = function () {
      var c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.scale(2, 2); g.drawImage(img, 0, 0);
      URL.revokeObjectURL(url); c.toBlob(function (b) { var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name + '.png'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }, 'image/png');
    };
    img.src = url;
  }
  /** Excel workbook (SpreadsheetML 2003 .xls: opens in Excel, Numbers, LibreOffice, Google Sheets). sheets: [{name, head:[], rows:[[]]}] */
  function exportExcel(name, sheets) {
    function x(v) { return String(v == null ? '' : v).replace(/[<>&"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); }
    function cell(v) { var n = typeof v === 'number' && isFinite(v); return '<Cell><Data ss:Type="' + (n ? 'Number' : 'String') + '">' + x(n ? v : v) + '</Data></Cell>'; }
    var xml = '<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
      '<Styles><Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#E7EFEA" ss:Pattern="Solid"/></Style></Styles>' +
      sheets.map(function (s) { return '<Worksheet ss:Name="' + x(String(s.name).slice(0, 31)) + '"><Table><Row>' + s.head.map(function (h) { return '<Cell ss:StyleID="h"><Data ss:Type="String">' + x(h) + '</Data></Cell>'; }).join('') + '</Row>' + s.rows.map(function (r) { return '<Row>' + r.map(cell).join('') + '</Row>'; }).join('') + '</Table></Worksheet>'; }).join('') + '</Workbook>';
    download(name + '.xls', xml, 'application/vnd.ms-excel');
  }
  function exportSvg(host, name) {
    var svg = host.querySelector('svg'); if (!svg) return;
    var clone = svg.cloneNode(true); clone.setAttribute('xmlns', NS);
    var css = 'text{fill:#1C2421}.fo-grid{stroke:#E3E9E5}.fo-axis{fill:#6B756F}.fo-track{fill:#EEF2EF}';
    var st = document.createElementNS(NS, 'style'); st.textContent = css; clone.insertBefore(st, clone.firstChild);
    download(name + '.svg', new XMLSerializer().serializeToString(clone), 'image/svg+xml');
  }
  function download(name, content, type) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type: type })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  return { combo: combo, donut: donut, hbars: hbars, waterfall: waterfall, exportSvg: exportSvg, exportPng: exportPng, exportExcel: exportExcel, download: download, fmt: fmt, PALETTE: PALETTE, empty: empty };
})();
