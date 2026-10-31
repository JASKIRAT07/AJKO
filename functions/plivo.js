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

// ============================================================================
// STEP 2 — MASKED BRIDGE TEST
// Place a call to `first` (stands in for staff). When they answer, play a
// consent message, then <Dial> the `karigar` number showing the SHOP number as
// caller ID — so the karigar sees only +918065537772. The karigar also hears a
// consent message on pickup (via confirmSound) before being connected.
// ============================================================================

const BRIDGE_ANSWER_URL = 'https://us-central1-ajko-48799.cloudfunctions.net/plivoBridgeAnswer';
// English placeholder (swap for a Punjabi <Play> audio file later).
const CONSENT_TEXT = 'This call is from A J K O and is recorded for quality purposes. Please hold while we connect you.';

function escapeXml(s) {
  return String(s || '').replace(/[<>&'"]/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
  ));
}

// ---- 3. MASKED BRIDGE TRIGGER (HTTP) ---------------------------------------
// Gated by the Plivo Auth Token as X-Test-Key (same as plivoTestCall).
//   curl -X POST "<plivoMaskTest-url>" \
//     -H "X-Test-Key: <PLIVO_AUTH_TOKEN>" -H "Content-Type: application/json" \
//     -d '{"first":"+919698200086","karigar":"+91XXXXXXXXXX"}'
exports.plivoMaskTest = onRequest({ secrets: [PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN] }, async (req, res) => {
  try {
    const b = (req.body && typeof req.body === 'object') ? req.body : {};
    const key = req.get('X-Test-Key') || req.query.key || b.key;
    if (!key || key !== PLIVO_AUTH_TOKEN.value()) {
      res.status(401).json({ error: 'Unauthorized. Pass your Plivo Auth Token as the "X-Test-Key" header or "?key=".' });
      return;
    }

    const first = String(b.first || req.query.first || '').trim();
    const karigar = String(b.karigar || req.query.karigar || '').trim();
    if (!first || !karigar) {
      res.status(400).json({ error: 'Need both "first" (rings first) and "karigar" (gets bridged, sees the shop number) in E.164, e.g. +919698200086.' });
      return;
    }

    const authId = PLIVO_AUTH_ID.value();
    const url = `https://api.plivo.com/v1/Account/${authId}/Call/`;
    const auth = Buffer.from(`${authId}:${PLIVO_AUTH_TOKEN.value()}`).toString('base64');
    // Pass the karigar number to the answer XML via the query string.
    const answerUrl = `${BRIDGE_ANSWER_URL}?karigar=${encodeURIComponent(karigar)}`;
    const payload = { from: PLIVO_NUMBER, to: first, answer_url: answerUrl, answer_method: 'POST' };

    logger.info('Plivo → POST Call (mask bridge)', { url, from: PLIVO_NUMBER, first, karigar, answerUrl });

    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = text; }

    if (!r.ok) {
      logger.error(`Plivo HTTP ${r.status} (mask)`, { first, karigar, response: data });
      res.status(502).json({ ok: false, status: r.status, requested: { from: PLIVO_NUMBER, first, karigar }, plivo: data });
      return;
    }
    logger.info('Plivo OK (mask)', { first, karigar, response: data });
    res.status(200).json({ ok: true, status: r.status, requested: { from: PLIVO_NUMBER, first, karigar }, plivo: data });
  } catch (e) {
    logger.error('plivoMaskTest failed', e);
    res.status(500).json({ error: String((e && e.message) || e) });
  }
});

// ---- 4. BRIDGE ANSWER URL (HTTP, public) -----------------------------------
// Returns the Plivo XML for the bridge. Two modes:
//   ?leg=b        → the short consent message played to the KARIGAR on pickup
//                   (used as the <Dial confirmSound>).
//   (default)     → consent to the FIRST party, then <Dial> the karigar with the
//                   shop number as caller ID.
exports.plivoBridgeAnswer = onRequest(async (req, res) => {
  res.set('Content-Type', 'text/xml');
  const q = { ...(req.query || {}), ...((req.body && typeof req.body === 'object') ? req.body : {}) };

  // B-leg (karigar) consent snippet.
  if (String(q.leg || '') === 'b') {
    res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n<Response><Speak>${escapeXml(CONSENT_TEXT)}</Speak></Response>`);
    return;
  }

  const karigar = String(q.karigar || '').trim();
  if (!karigar) {
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?>\n<Response><Speak>Sorry, no number to connect.</Speak></Response>');
    return;
  }

  const confirm = `${BRIDGE_ANSWER_URL}?leg=b`;
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<Response>'
    + `<Speak>${escapeXml(CONSENT_TEXT)}</Speak>`
    + `<Dial callerId="${escapeXml(PLIVO_NUMBER)}" callerName="AJKO" timeout="30" confirmSound="${escapeXml(confirm)}">`
    + `<Number>${escapeXml(karigar)}</Number>`
    + '</Dial>'
    + '</Response>';
  logger.info('Plivo → bridge answer', { karigar });
  res.status(200).send(xml);
});

// ============================================================================
// STEP 3a — RECORDING TEST (prove Plivo records + we receive the recording URL)
// Calls a number, plays the consent line, records a few seconds of the caller,
// and when done Plivo POSTs the recording URL to plivoRecordDone, which LOGS it.
// No R2 yet — this half just proves recording works and we capture the URL. The
// download→R2 step (3b) plugs into the clearly-marked spot in plivoRecordDone.
// ============================================================================

const RECORD_ANSWER_URL = 'https://us-central1-ajko-48799.cloudfunctions.net/plivoRecordAnswer';
const RECORD_DONE_URL = 'https://us-central1-ajko-48799.cloudfunctions.net/plivoRecordDone';

// ---- 5. RECORDING TRIGGER (HTTP) -------------------------------------------
//   curl -X POST "<plivoRecordTest-url>" \
//     -H "X-Test-Key: <PLIVO_AUTH_TOKEN>" -H "Content-Type: application/json" \
//     -d '{"to":"+919698200086"}'
exports.plivoRecordTest = onRequest({ secrets: [PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN] }, async (req, res) => {
  try {
    const b = (req.body && typeof req.body === 'object') ? req.body : {};
    const key = req.get('X-Test-Key') || req.query.key || b.key;
    if (!key || key !== PLIVO_AUTH_TOKEN.value()) {
      res.status(401).json({ error: 'Unauthorized. Pass your Plivo Auth Token as the "X-Test-Key" header or "?key=".' });
      return;
    }
    const to = String(b.to || req.query.to || '').trim();
    if (!to) { res.status(400).json({ error: 'Missing "to" (E.164, e.g. +919698200086).' }); return; }

    const authId = PLIVO_AUTH_ID.value();
    const url = `https://api.plivo.com/v1/Account/${authId}/Call/`;
    const auth = Buffer.from(`${authId}:${PLIVO_AUTH_TOKEN.value()}`).toString('base64');
    const payload = { from: PLIVO_NUMBER, to, answer_url: RECORD_ANSWER_URL, answer_method: 'POST' };

    logger.info('Plivo → POST Call (record test)', { to });
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch (e) { data = text; }
    if (!r.ok) {
      logger.error(`Plivo HTTP ${r.status} (record)`, { to, response: data });
      res.status(502).json({ ok: false, status: r.status, plivo: data });
      return;
    }
    res.status(200).json({ ok: true, status: r.status, requested: { to }, plivo: data });
  } catch (e) {
    logger.error('plivoRecordTest failed', e);
    res.status(500).json({ error: String((e && e.message) || e) });
  }
});

// ---- 6. RECORD ANSWER URL (HTTP, public) -----------------------------------
// Plays the consent line, then records up to 30s of the caller (mp3) and posts
// the result to plivoRecordDone.
exports.plivoRecordAnswer = onRequest(async (req, res) => {
  res.set('Content-Type', 'text/xml');
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<Response>'
    + `<Speak>${escapeXml(CONSENT_TEXT)} Please say a few words after the beep.</Speak>`
    + `<Record maxLength="30" fileFormat="mp3" playBeep="true" redirect="true" `
    + `action="${escapeXml(RECORD_DONE_URL)}" method="POST"/>`
    + '</Response>';
  logger.info('Plivo → record answer served');
  res.status(200).send(xml);
});

// ---- 7. RECORD DONE (HTTP, public) -----------------------------------------
// Plivo POSTs the recording details here when recording finishes. For 3a we just
// LOG the recording URL so you can confirm it. (3b will download it → R2 here.)
exports.plivoRecordDone = onRequest(async (req, res) => {
  const p = { ...(req.query || {}), ...((req.body && typeof req.body === 'object') ? req.body : {}) };
  logger.info('Plivo → RECORDING DONE', {
    RecordUrl: p.RecordUrl,
    RecordingID: p.RecordingID,
    RecordingDuration: p.RecordingDuration,
    CallUUID: p.CallUUID,
    From: p.From,
    To: p.To,
  });

  // ── STEP 3b PLUGS IN HERE ───────────────────────────────────────────────
  // When R2 is set up: download p.RecordUrl (Basic auth with Plivo creds) and
  // upload the bytes to the R2 bucket, then store the R2 key on the call record.
  // Left as a no-op for 3a.

  res.set('Content-Type', 'text/xml');
  res.status(200).send('<?xml version="1.0" encoding="UTF-8"?>\n<Response><Speak>Thank you. Your recording is saved. Goodbye.</Speak></Response>');
});
