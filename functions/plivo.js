/**
 * AJKO ↔ Plivo integration — STEP 1: basic outbound call test.
 *
 * Fully ISOLATED: registers NEW functions only and never touches existing AJKO
 * functions, orders, auth, media, WhatsApp, the Sarvam AI-call functions, or the
 * Do Calls UI. Wired into deployment by a single `Object.assign` line in
 * index.js.
 *
 * Exports:
 *   plivoTestCall (HTTP) — place a test call via Plivo to a number you pass.
 *   plivoAnswer   (HTTP) — Plivo fetches this when the call connects; it returns
 *                          Plivo XML that speaks a placeholder message.
 *
 * Flow: trigger plivoTestCall → Plivo rings the destination → on answer, Plivo
 * fetches plivoAnswer → caller hears the <Speak> placeholder.
 *
 * Secrets (set via `firebase functions:secrets:set …`, NEVER hardcoded):
 *   PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN.
 */
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');

const PLIVO_AUTH_ID = defineSecret('PLIVO_AUTH_ID');
const PLIVO_AUTH_TOKEN = defineSecret('PLIVO_AUTH_TOKEN');

// Non-secret config. The Plivo number we own (caller ID for the test call) and
// the public URL Plivo calls back for the answer XML (same cloudfunctions.net
// base, region us-central1 — set globally in index.js).
const PLIVO_NUMBER = '+918065537772';
const ANSWER_URL = 'https://us-central1-ajko-48799.cloudfunctions.net/plivoAnswer';

// ---- 1. MANUAL TEST TRIGGER (HTTP) -----------------------------------------
// Places a call via Plivo. Gated by the Plivo Auth Token itself (pass it as the
// X-Test-Key header or ?key=), so it is not an open endpoint anyone can use to
// place calls — no extra secret to manage.
//
//   curl -X POST "<plivoTestCall-url>" \
//     -H "X-Test-Key: <PLIVO_AUTH_TOKEN>" -H "Content-Type: application/json" \
//     -d '{"to":"+919698200086"}'
exports.plivoTestCall = onRequest({ secrets: [PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN] }, async (req, res) => {
  try {
    const b = (req.body && typeof req.body === 'object') ? req.body : {};
    const key = req.get('X-Test-Key') || req.query.key || b.key;
    if (!key || key !== PLIVO_AUTH_TOKEN.value()) {
      res.status(401).json({ error: 'Unauthorized. Pass your Plivo Auth Token as the "X-Test-Key" header or "?key=".' });
      return;
    }

    const to = String(b.to || req.query.to || '').trim();
    if (!to) {
      res.status(400).json({ error: 'Missing "to" — the destination phone number in E.164, e.g. +919698200086.' });
      return;
    }

    const authId = PLIVO_AUTH_ID.value();
    const url = `https://api.plivo.com/v1/Account/${authId}/Call/`;
    const auth = Buffer.from(`${authId}:${PLIVO_AUTH_TOKEN.value()}`).toString('base64');
    const payload = {
      from: PLIVO_NUMBER,
      to,
      answer_url: ANSWER_URL,
      answer_method: 'POST',
    };

    logger.info('Plivo → POST Call', { url, from: PLIVO_NUMBER, to, answer_url: ANSWER_URL });

    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = text; }

    if (!r.ok) {
      logger.error(`Plivo HTTP ${r.status}`, { to, response: data });
      res.status(502).json({ ok: false, status: r.status, requested: { from: PLIVO_NUMBER, to }, plivo: data });
      return;
    }
    logger.info('Plivo OK', { to, response: data });
    res.status(200).json({ ok: true, status: r.status, requested: { from: PLIVO_NUMBER, to }, plivo: data });
  } catch (e) {
    logger.error('plivoTestCall failed', e);
    res.status(500).json({ error: String((e && e.message) || e) });
  }
});

// ---- 2. ANSWER URL (HTTP, public) ------------------------------------------
// Plivo fetches this when the call is answered and expects Plivo XML back. For
// now it just speaks an English placeholder (we swap in a Punjabi audio <Play>
// later). Must be publicly reachable — Plivo calls it, unauthenticated.
exports.plivoAnswer = onRequest(async (req, res) => {
  logger.info('Plivo → fetched answer_url', { method: req.method, from: req.query.From || (req.body && req.body.From) });
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<Response><Speak>This is a test call from AJKO. The connection is working.</Speak></Response>';
  res.set('Content-Type', 'text/xml');
  res.status(200).send(xml);
});
