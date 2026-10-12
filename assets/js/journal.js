// ====== AP Villas Journal: interactive blog index, post enhancements, home "latest posts" ======
// Works on: blog.html (filters/search/featured), blog/*.html (progress, TOC, share, related, booking bar),
// index.html (#home-journal latest posts). Everything is progressive: pages work without it.
(function () {
  const WA = 'https://wa.me/918999061598?text=Hi%20Apoorv%2C%20I%27d%20like%20to%20enquire%20about%20AP%20Villas.';
  const ICON_WA = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41-.08-.13-.27-.2-.57-.35M12.05 21.79a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88a9.88 9.88 0 0 1 9.88 9.89c0 5.45-4.43 9.88-9.89 9.88M20.46 3.49A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.69 1.45c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.17-3.48-8.42"/></svg>';
  const ICON_LINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Read the cards listed on blog.html (single source of truth for posts).
  async function loadCards(blogUrl) {
    const res = await fetch(blogUrl, { cache: 'no-cache' });
    if (!res.ok) throw new Error('blog.html ' + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    return [...doc.querySelectorAll('.blog-card')].map(card => ({
      href: card.querySelector('a')?.getAttribute('href') || '',
      img: card.querySelector('img')?.getAttribute('src') || '',
      alt: card.querySelector('img')?.getAttribute('alt') || '',
      tag: card.querySelector('.blog-card__tag')?.textContent.trim() || '',
      title: card.querySelector('h3')?.textContent.trim() || '',
      text: card.querySelector('.blog-card__body p')?.textContent.trim() || '',
    })).filter(c => c.href);
  }

  function cardHTML(c, prefix) {
    return `<article class="blog-card in">
      <a href="${esc(prefix + c.href)}" style="display:contents;">
        <div class="blog-card__media"><img src="${esc(prefix + c.img)}" alt="${esc(c.alt)}" loading="lazy"><span class="blog-card__tag">${esc(c.tag)}</span></div>
        <div class="blog-card__body"><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p><span class="blog-card__link">Read article →</span></div>
      </a></article>`;
  }

  // ---------- Blog index ----------
  const grid = document.querySelector('.journal-grid');
  if (grid) {
    const cards = [...grid.querySelectorAll('.blog-card')];
    if (cards[0] && !cards[0].querySelector('.blog-card__badge')) {
      cards[0].querySelector('.blog-card__media')?.insertAdjacentHTML('beforeend', '<span class="blog-card__badge">Latest</span>');
    }
    const chipsEl = document.querySelector('.journal-chips');
    const search = document.querySelector('.journal-search input');
    const empty = document.querySelector('.journal-empty');
    const counts = {};
    cards.forEach(c => { const t = c.querySelector('.blog-card__tag')?.textContent.trim(); if (t) counts[t] = (counts[t] || 0) + 1; });
    let active = 'All';
    if (chipsEl) {
      chipsEl.innerHTML = ['All', ...Object.keys(counts).sort()].map(t =>
        `<button type="button" class="journal-chip${t === 'All' ? ' is-active' : ''}" data-tag="${esc(t)}">${esc(t)}<span>${t === 'All' ? cards.length : counts[t]}</span></button>`).join('');
      chipsEl.addEventListener('click', e => {
        const b = e.target.closest('.journal-chip'); if (!b) return;
        active = b.dataset.tag;
        chipsEl.querySelectorAll('.journal-chip').forEach(x => x.classList.toggle('is-active', x === b));
        apply();
      });
    }
    search?.addEventListener('input', apply);
    function apply() {
      const q = (search?.value || '').trim().toLowerCase();
      let shown = 0;
      cards.forEach(c => {
        const tag = c.querySelector('.blog-card__tag')?.textContent.trim();
        const ok = (active === 'All' || tag === active) && (!q || c.textContent.toLowerCase().includes(q));
        c.classList.toggle('is-hidden', !ok);
        if (ok) { shown++; c.classList.add('in'); }
      });
      grid.classList.toggle('is-filtered', active !== 'All' || !!q);
      empty?.classList.toggle('is-visible', shown === 0);
    }
  }

  // ---------- Home: latest posts ----------
  const home = document.getElementById('home-journal');
  if (home) {
    loadCards('blog.html').then(list => {
      if (!list.length) return;
      home.querySelector('.blog-grid').innerHTML = list.slice(0, 3).map(c => cardHTML(c, '')).join('');
      home.hidden = false;
    }).catch(() => {});
  }

  // ---------- Single post ----------
  const article = document.querySelector('article.article');
  if (!article || !location.pathname.includes('/blog/')) return;

  // ---------- Listen: narration in English or Hindi (the browser's own free voices) ----------
  // Blocks are picked the same way as scripts/narration-blocks.mjs, so blog/narration/<slug>.hi.json lines up with them.
  const SKIP = 'figure, .article__meta, .post-toc, .post-share, .post-book, .post-related, .post-listen';
  const blockEls = [...article.querySelectorAll('h1, h2, h3, p, li')].filter(el => !el.closest(SKIP) && !(el.tagName === 'P' && /text-align:\s*center/.test(el.getAttribute('style') || '')) && el.textContent.trim());
  const synth = window.speechSynthesis;
  if (synth && blockEls.length) {
    const slugHere = location.pathname.split('/').pop().replace(/\.html$/, '');
    const texts = { en: blockEls.map(el => el.textContent.replace(/\s+/g, ' ').trim()) };
    const ui = document.createElement('div');
    ui.className = 'post-listen';
    ui.innerHTML = `<span class="post-listen__label"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 14v-2a9 9 0 0 1 18 0v2"/><rect x="2" y="14" width="5" height="7" rx="2"/><rect x="17" y="14" width="5" height="7" rx="2"/></svg> Listen to this guide</span>
      <div class="post-listen__btns">
        <button type="button" data-lang="en">▶ English</button>
        <button type="button" data-lang="hi" hidden>▶ हिंदी में सुनें</button>
        <button type="button" data-act="toggle" hidden>❚❚ Pause</button>
        <button type="button" data-act="stop" hidden>■ Stop</button>
        <select aria-label="Reading speed"><option value="0.85">0.85×</option><option value="1" selected>1×</option><option value="1.15">1.15×</option><option value="1.3">1.3×</option></select>
      </div>
      <div class="post-listen__bar"><i></i></div><small class="post-listen__note" hidden></small>`;
    (article.querySelector('.article__meta') || article.querySelector('h1')).after(ui);
    const $q = s => ui.querySelector(s), barI = $q('.post-listen__bar i'), note = $q('.post-listen__note');
    fetch(`narration/${slugHere}.hi.json`).then(r => r.ok ? r.json() : null).then(j => { if (j && Array.isArray(j.blocks) && j.blocks.length) { texts.hi = j.blocks; $q('[data-lang="hi"]').hidden = false; } }).catch(() => {});
    let voices = [];
    const loadVoices = () => { voices = synth.getVoices(); };
    loadVoices(); synth.addEventListener?.('voiceschanged', loadVoices);
    const pickVoice = lang => {
      const want = lang === 'hi' ? ['hi-IN', 'hi'] : ['en-IN', 'en-GB', 'en-US', 'en'];
      const good = v => /google|natural|online|neural|premium|enhanced/i.test(v.name);
      for (const w of want) {
        const list = voices.filter(v => v.lang.replace('_', '-').toLowerCase().startsWith(w.toLowerCase()));
        if (list.length) return list.find(good) || list[0];
      }
      return null;
    };
    // split long paragraphs into sentences: some browsers stop speaking after ~15 seconds of one utterance
    const chunks = t => (t.match(/[^.!?।]+[.!?।]+["')\]]*\s*|[^.!?।]+$/g) || [t]).reduce((a, s) => { s = s.trim(); if (!s) return a; if (a.length && (a[a.length - 1] + ' ' + s).length < 200) a[a.length - 1] += ' ' + s; else a.push(s); return a; }, []);
    let lang = null, idx = 0, playing = false, runId = 0;
    const setState = () => {
      ui.classList.toggle('is-playing', playing);
      $q('[data-act="toggle"]').hidden = lang === null; $q('[data-act="stop"]').hidden = lang === null;
      $q('[data-act="toggle"]').textContent = playing ? '❚❚ Pause' : '▶ Resume';
      ui.querySelectorAll('[data-lang]').forEach(b => b.classList.toggle('is-active', b.dataset.lang === lang));
    };
    const mark = i => {
      blockEls.forEach(el => el.classList.remove('is-reading'));
      const aligned = lang === 'en' || (texts[lang] && texts[lang].length === blockEls.length);
      const el = aligned ? blockEls[i] : null;
      if (el) { el.classList.add('is-reading'); const r = el.getBoundingClientRect(); if (r.top < 80 || r.bottom > innerHeight - 80) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      const list = texts[lang] || []; barI.style.width = (100 * i / Math.max(1, list.length)) + '%';
    };
    const speakFrom = i => {
      const my = ++runId, list = texts[lang];
      synth.cancel();
      if (i >= list.length) { stop(); return; }
      idx = i; mark(i); playing = true; setState();
      const parts = chunks(list[i]), voice = pickVoice(lang);
      parts.forEach((p, k) => {
        const u = new SpeechSynthesisUtterance(p);
        u.lang = lang === 'hi' ? 'hi-IN' : (voice?.lang || 'en-IN'); if (voice) u.voice = voice;
        u.rate = parseFloat($q('select').value) * (lang === 'hi' ? 0.95 : 1);
        if (k === parts.length - 1) u.onend = () => { if (my === runId && playing) speakFrom(i + 1); };
        u.onerror = e => { if (my === runId && e.error !== 'interrupted' && e.error !== 'canceled') { playing = false; setState(); } };
        synth.speak(u);
      });
    };
    const stop = () => { runId++; synth.cancel(); playing = false; lang = null; blockEls.forEach(el => el.classList.remove('is-reading')); barI.style.width = '0'; setState(); };
    ui.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.lang) {
        lang = b.dataset.lang;
        if (!voices.length) loadVoices();
        note.hidden = true;
        if (lang === 'hi' && !pickVoice('hi')) { note.hidden = false; note.textContent = 'Your device has no Hindi voice installed, so it may sound unusual. On Android: Settings → Text-to-speech → Google → install Hindi. On iPhone: Settings → Accessibility → Spoken Content → Voices → Hindi.'; }
        speakFrom(0);
        if (typeof gtag === 'function') gtag('event', 'post_listen', { lang, post: slugHere });
      } else if (b.dataset.act === 'toggle') {
        if (playing) { runId++; synth.cancel(); playing = false; setState(); }   // pause = stop at this paragraph (pause() is unreliable on phones)
        else speakFrom(idx);
      } else if (b.dataset.act === 'stop') stop();
    });
    $q('select').addEventListener('change', () => { if (playing) speakFrom(idx); });
    blockEls.forEach((el, i) => el.addEventListener('dblclick', () => { if (lang) speakFrom(i); }));   // double-click a paragraph to jump there
    addEventListener('pagehide', () => synth.cancel());
  }


  // Reading progress
  const bar = document.createElement('div');
  bar.className = 'read-progress';
  document.body.appendChild(bar);

  // Share row (after the meta line)
  const meta = article.querySelector('.article__meta');
  const url = location.origin + location.pathname;
  const title = article.querySelector('h1')?.textContent.trim() || document.title;
  if (meta) {
    const share = document.createElement('div');
    share.className = 'post-share';
    share.innerHTML = `<span>Share with family:</span>
      <a href="https://wa.me/?text=${encodeURIComponent(title + ' ' + url)}" target="_blank" rel="noopener">${ICON_WA} WhatsApp</a>
      <button type="button" data-copy>${ICON_LINK} Copy link</button>`;
    meta.after(share);
    share.querySelector('[data-copy]').addEventListener('click', async e => {
      const btn = e.currentTarget;
      try {
        if (navigator.share && matchMedia('(hover: none)').matches) await navigator.share({ title, url });
        else { await navigator.clipboard.writeText(url); btn.lastChild.textContent = ' Copied!'; setTimeout(() => (btn.lastChild.textContent = ' Copy link'), 2000); }
      } catch {}
    });
  }

  // Table of contents from H2s (after the first paragraph, i.e. the short answer)
  const h2s = [...article.querySelectorAll(':scope > h2')];
  if (h2s.length >= 3) {
    const slug = s => s.toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, '-').replace(/^-|-$/g, '');
    h2s.forEach(h => { if (!h.id) h.id = slug(h.textContent); });
    const toc = document.createElement('details');
    toc.className = 'post-toc';
    toc.open = innerWidth > 900;
    toc.innerHTML = `<summary>In this guide · ${h2s.length} sections</summary><ol>${h2s.map(h => `<li><a href="#${h.id}">${esc(h.textContent)}</a></li>`).join('')}</ol>`;
    const firstP = article.querySelector(':scope > p');
    (firstP || article.querySelector('.article__hero'))?.after(toc);
    const links = toc.querySelectorAll('a');
    const io = new IntersectionObserver(es => es.forEach(en => {
      if (en.isIntersecting) links.forEach(a => a.classList.toggle('is-current', a.hash === '#' + en.target.id));
    }), { rootMargin: '-20% 0px -70% 0px' });
    h2s.forEach(h => io.observe(h));
  }

  // Booking card mid-article for older posts that lack WhatsApp CTAs
  const ctaCount = article.querySelectorAll('a[href*="wa.me/918999061598"]').length;
  if (ctaCount < 2 && h2s.length >= 3) {
    h2s[Math.floor(h2s.length / 2)].insertAdjacentHTML('beforebegin',
      `<div class="post-book"><div><strong>Planning a darshan trip to Ujjain?</strong><span>Five family villas within 2 km of Mahakaleshwar · free Mahakal shuttle · kitchen · caretaker</span></div>
       <a class="btn btn--primary" href="${WA}" target="_blank" rel="noopener">Check availability</a></div>`);
  }

  // Related posts (same category first)
  const end = article.querySelector('hr') || article.lastElementChild;
  loadCards('../blog.html').then(list => {
    const here = location.pathname.split('/').pop().replace(/\.html$/, '');
    const myTag = article.querySelector('.eyebrow')?.textContent.trim().toLowerCase() || '';
    const others = list.filter(c => !c.href.endsWith('/' + here + '.html') && !c.href.endsWith('/' + here));
    others.sort((a, b) => (b.tag.toLowerCase() === myTag) - (a.tag.toLowerCase() === myTag));
    const pick = others.slice(0, 3);
    if (!pick.length) return;
    const sec = document.createElement('section');
    sec.className = 'post-related';
    sec.innerHTML = `<h2>Keep reading</h2><div class="blog-grid">${pick.map(c => cardHTML({ ...c, href: c.href.replace(/^blog\//, '') }, '').replace(/src="(?!https?:|\.\.\/)/, 'src="../')).join('')}</div>`;
    end.before(sec);
  }).catch(() => {});

  // (Mobile booking bar now comes from main.js for every page: WhatsApp · Call · Quick answers)

  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const r = article.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -r.top / (r.height - innerHeight)));
      bar.style.transform = `scaleX(${p})`;
      ticking = false;
    });
  }, { passive: true });
})();
