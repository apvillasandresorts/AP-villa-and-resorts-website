/**
 * AP Villas Founder OS · visual effects (no libraries, CSP-safe: plain SVG + CSS animations).
 * FoFX.boot()   → the "Loading your business data" screen: circuit traces across the whole screen with currents of light running along
 *                 them, glowing junctions, the AP emblem in a charged ring and the steps being loaded.
 * FoFX.wires()  → the same circuit layer, for backgrounds.
 * FoFX.brain()  → the sign-in illustration: a brain whose folds and veins carry flowing current, with neurons firing.
 * Everything is decorative (aria-hidden) and holds still for people who ask their device for reduced motion.
 */
(function () {
  'use strict';
  // small seeded random, so the circuit looks hand-laid but identical on every load (no layout jumps)
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function defs(id) {
    return '<defs>' +
      '<linearGradient id="' + id + '-cur" x1="0" x2="1"><stop offset="0" stop-color="#F3D98B" stop-opacity="0"/><stop offset=".55" stop-color="#F3D98B"/><stop offset="1" stop-color="#FFFFFF"/></linearGradient>' +
      '<linearGradient id="' + id + '-cur2" x1="0" x2="1"><stop offset="0" stop-color="#5FD3A0" stop-opacity="0"/><stop offset=".6" stop-color="#5FD3A0"/><stop offset="1" stop-color="#E9FFF5"/></linearGradient>' +
      '<filter id="' + id + '-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      '</defs>';
  }
  /**
   * Printed-circuit traces: each runs across the screen in straight runs joined by 45° bends, ending in a via (junction).
   * Returned as { paths: [d], vias: [[x, y]] } in a 1600 × 900 box.
   */
  function traces(seed, n) {
    var r = rng(seed), out = { paths: [], vias: [] }, W = 1600, H = 900, lanes = [];
    for (var i = 0; i < n; i++) lanes.push(Math.round((i + 0.5) * H / n / 10) * 10);
    lanes.forEach(function (y0, i) {
      var fromLeft = i % 2 === 0, x = fromLeft ? -20 : W + 20, y = y0, dir = fromLeft ? 1 : -1, d = 'M' + x + ' ' + y, stop = W * (0.35 + r() * 0.7);
      while (fromLeft ? x < stop : x > W - stop) {
        var run = 60 + Math.round(r() * 220), jog = (r() < 0.5 ? -1 : 1) * (20 + Math.round(r() * 50));
        if (y + jog < 30 || y + jog > H - 30) jog = -jog;
        x += dir * run; d += ' L' + x + ' ' + y;
        if (r() < 0.75) { x += dir * Math.abs(jog); y += jog; d += ' L' + x + ' ' + y; }
      }
      out.paths.push(d); out.vias.push([x, y]);
      if (r() < 0.45) { var bx = x - dir * 40, by = y + (y > H / 2 ? -1 : 1) * (60 + Math.round(r() * 90)); out.paths.push('M' + (x - dir * 120) + ' ' + y + ' L' + bx + ' ' + y + ' L' + (bx + dir * 30) + ' ' + by + ' L' + (bx + dir * 140) + ' ' + by); out.vias.push([bx + dir * 140, by]); }
    });
    return out;
  }
  function wires(opt) {
    opt = opt || {};
    var id = 'fx' + (opt.seed || 7), t = traces(opt.seed || 7, opt.lanes || 15), r = rng((opt.seed || 7) * 31);
    var flows = t.paths.map(function (d, i) {
      var dur = (2.4 + r() * 3.2).toFixed(2), delay = (-r() * 6).toFixed(2), alt = i % 3 === 1;
      return '<path d="' + d + '" pathLength="1000" class="fx-flow' + (alt ? ' fx-flow--em' : '') + '" stroke="url(#' + id + (alt ? '-cur2' : '-cur') + ')" style="animation-duration:' + dur + 's;animation-delay:' + delay + 's"/>';
    }).join('');
    return '<svg class="fx-wires' + (opt.cls ? ' ' + opt.cls : '') + '" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' + defs(id) +
      '<g class="fx-base">' + t.paths.map(function (d) { return '<path d="' + d + '"/>'; }).join('') + '</g>' +
      '<g filter="url(#' + id + '-glow)">' + flows + '</g>' +
      '<g class="fx-vias">' + t.vias.map(function (v, i) { return '<circle cx="' + v[0] + '" cy="' + v[1] + '" r="5" style="animation-delay:' + (-(i * 0.37) % 3).toFixed(2) + 's"/>'; }).join('') + '</g></svg>';
  }
  var STEPS = ['Connecting securely…', 'Reading bookings and payments…', 'Pricing the next 90 nights…', 'Checking competitor prices…', 'Reading the news and Google searches…', 'Putting your dashboard together…'];
  /** Full-screen loading view. Call FoFX.bootStart(root) after inserting it to cycle the step text. */
  function boot() {
    return '<div class="fx-boot" role="status" aria-live="polite">' + wires({ seed: 11, lanes: 16 }) +
      '<div class="fx-boot__core"><div class="fx-boot__ring"><span></span><span></span><img src="/assets/brand/logo-emblem-512.webp" alt="" width="84" height="84"></div>' +
      '<div class="fx-boot__title">Loading your business data</div><div class="fx-boot__step" id="fx-step">' + STEPS[0] + '</div><div class="fx-boot__bar"><i></i></div></div></div>';
  }
  function bootStart(root) {
    var k = 0, el = root.querySelector('#fx-step');
    var t = setInterval(function () { if (!document.body.contains(el)) { clearInterval(t); return; } k = Math.min(k + 1, STEPS.length - 1); el.classList.remove('is-in'); void el.offsetWidth; el.textContent = STEPS[k]; el.classList.add('is-in'); }, 1500);
  }

  // ------------------------------------------------------------ the brain (sign-in) ------------------------------------------------------------
  // side view, facing left: outline, cerebellum, stem, and the folds (gyri) that double as the veins the current runs through
  var BRAIN = {
    outline: 'M124 300C82 262 80 182 128 140C158 92 228 58 300 68C362 48 442 68 484 118C534 148 556 210 534 262C550 304 522 344 482 352C470 382 430 396 396 386C370 410 320 412 298 392C268 402 228 396 206 376C166 382 136 352 124 300Z',
    cerebellum: 'M396 386C432 396 470 382 482 352C504 372 494 408 458 418C426 426 400 412 396 386Z',
    stem: 'M356 398C362 428 358 452 346 478M386 396C390 426 388 452 382 478',
    veins: [
      'M150 200C180 178 202 212 232 190S282 168 302 190S352 214 384 196',
      'M140 262C172 240 202 272 236 250S292 234 322 256S382 272 412 250S468 236 506 254',
      'M198 128C210 160 240 150 250 176S240 222 266 236',
      'M298 82C288 120 322 140 310 170S332 212 352 222',
      'M380 88C386 130 360 150 380 182S422 202 442 192',
      'M452 138C432 170 462 190 450 222S472 262 502 252',
      'M190 332C222 314 252 342 282 326S332 320 362 342',
      'M330 282C360 302 400 292 430 312S470 322 494 302',
      'M168 166C190 150 214 158 226 140',
      'M246 296C270 280 296 300 316 288',
      'M418 140C440 112 470 120 486 140',
      'M410 360C432 372 452 366 470 352',
    ],
    nodes: [[384, 196], [506, 254], [266, 236], [352, 222], [442, 192], [502, 252], [362, 342], [494, 302], [226, 140], [316, 288], [486, 140], [470, 352], [150, 200], [140, 262], [298, 82], [190, 332]],
  };
  function brain(key) {
    var id = 'br' + (key || ''), r = rng(5);
    var flow = BRAIN.veins.map(function (d, i) {
      var dur = (2.2 + r() * 2.6).toFixed(2), delay = (-r() * 4).toFixed(2), alt = i % 2 === 1;
      return '<path d="' + d + '" pathLength="1000" class="fx-flow fx-flow--brain' + (alt ? ' fx-flow--em' : '') + '" stroke="url(#' + id + (alt ? '-cur2' : '-cur') + ')" style="animation-duration:' + dur + 's;animation-delay:' + delay + 's"/>';
    }).join('');
    // the outline itself carries a slow current around the whole brain
    return '<svg class="fx-brain" viewBox="60 40 520 460" aria-hidden="true" focusable="false">' + defs(id) +
      '<radialGradient id="' + id + '-aura" cx="50%" cy="48%" r="55%"><stop offset="0" stop-color="#C9A24F" stop-opacity=".28"/><stop offset=".6" stop-color="#2F8F6B" stop-opacity=".10"/><stop offset="1" stop-color="#0F3D2E" stop-opacity="0"/></radialGradient>' +
      '<ellipse class="fx-brain__aura" cx="320" cy="250" rx="270" ry="215" fill="url(#' + id + '-aura)"/>' +
      '<g class="fx-brain__shape"><path d="' + BRAIN.outline + '"/><path d="' + BRAIN.cerebellum + '"/><path d="' + BRAIN.stem + '" fill="none"/></g>' +
      '<g class="fx-base fx-base--brain">' + BRAIN.veins.map(function (d) { return '<path d="' + d + '"/>'; }).join('') + '</g>' +
      '<g filter="url(#' + id + '-glow)">' + flow +
      '<path d="' + BRAIN.outline + '" pathLength="1000" class="fx-flow fx-flow--rim" stroke="url(#' + id + '-cur)"/>' +
      '<path d="' + BRAIN.stem.split('M')[1].replace(/^/, 'M') + '" pathLength="1000" class="fx-flow fx-flow--stem" stroke="url(#' + id + '-cur2)"/></g>' +
      '<g class="fx-neurons" filter="url(#' + id + '-glow)">' + BRAIN.nodes.map(function (n, i) { return '<circle cx="' + n[0] + '" cy="' + n[1] + '" r="4.2" style="animation-delay:' + (-(i * 0.53) % 3.2).toFixed(2) + 's"/>'; }).join('') + '</g></svg>';
  }

  window.FoFX = { wires: wires, boot: boot, bootStart: bootStart, brain: brain };
})();
