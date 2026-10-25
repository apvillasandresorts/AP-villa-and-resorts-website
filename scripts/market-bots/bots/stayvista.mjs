// StayVista bot: luxury villa chain. Checks its public sitemap (allowed) for villas in or near Ujjain; none listed on 25 Oct 2026.
// When villas appear they are added as competitors (whole villas) so the comp set can consider them.
export default {
  id: 'stayvista', platform: 'StayVista',
  async discover(s) {
    let xml = '';
    try { const r = await fetch('https://www.stayvista.com/sitemap.xml', { signal: AbortSignal.timeout(20000) }); xml = r.ok ? await r.text() : ''; } catch (e) { return []; }
    s.pages++;
    return [...xml.matchAll(/<loc>([^<]*(?:ujjain|mahakal)[^<]*)<\/loc>/gi)].map(m => ({ href: m[1], name: 'StayVista ' + decodeURIComponent(m[1].split('/').filter(Boolean).pop()).replace(/-/g, ' '), price: null, type: 'villa' }));
  },
};
