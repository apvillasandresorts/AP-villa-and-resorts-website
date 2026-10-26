// Relay for the Founder OS portal AND the guest e-check-in (Vercel serverless function, free tier). Both post here (same origin); this calls the Apps Script web app
// from Vercel's servers, follows Google's redirect and returns the JSON answer. It holds no secrets and adds no access: every action is
// still checked by the Apps Script with the session token, exactly as when the browser calls Google directly.
const EXEC = 'https://script.google.com/macros/s/AKfycbzmtIwOzGohnjEOfp7RZ1cU8JtwkCb6mEZiHEa8j_gknh-zkVbHz4oEV1Mu5xTaNpo7/exec';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') { res.status(405).send(JSON.stringify({ ok: false, error: 'POST only' })); return; }
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  if (body.length > 4000000) { res.status(413).send(JSON.stringify({ ok: false, error: 'Request too large' })); return; }
  try {
    const r = await fetch(EXEC, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, redirect: 'follow', signal: AbortSignal.timeout(55000) });
    const text = await r.text();
    if (!/^\s*\{/.test(text)) { res.status(502).send(JSON.stringify({ ok: false, error: 'The Founder OS server did not answer properly. Please try again.' })); return; }
    res.status(200).send(text);
  } catch (e) {
    res.status(504).send(JSON.stringify({ ok: false, error: e && e.name === 'TimeoutError' ? 'The server took too long to answer. Please try again in a moment.' : 'Could not reach the Founder OS server.' }));
  }
};
