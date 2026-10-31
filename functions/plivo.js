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
const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const crypto = require('crypto');

// index.js calls initializeApp() before requiring this module; guard keeps it
// safe in any load order.
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const PLIVO_AUTH_ID = defineSecret('PLIVO_AUTH_ID');
const PLIVO_AUTH_TOKEN = defineSecret('PLIVO_AUTH_TOKEN');

// Cloudflare R2 (S3-compatible). Set via `firebase functions:secrets:set …`.
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const R2_ACCOUNT_ID = defineSecret('R2_ACCOUNT_ID');
const R2_BUCKET = defineSecret('R2_BUCKET');
const R2_ACCESS_KEY_ID = defineSecret('R2_ACCESS_KEY_ID');
const R2_SECRET_ACCESS_KEY = defineSecret('R2_SECRET_ACCESS_KEY');
const R2_SECRETS = [R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY];

function r2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID.value()}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID.value(), secretAccessKey: R2_SECRET_ACCESS_KEY.value() },
  });
}

// Download a Plivo recording (Basic auth) and upload it to R2. Returns the key.
async function ingestRecordingToR2(recordUrl, key) {
  const auth = Buffer.from(`${PLIVO_AUTH_ID.value()}:${PLIVO_AUTH_TOKEN.value()}`).toString('base64');
  const dl = await fetch(recordUrl, { headers: { Authorization: `Basic ${auth}` } });
  if (!dl.ok) throw new Error(`download failed: HTTP ${dl.status}`);
  const buf = Buffer.from(await dl.arrayBuffer());
  await r2Client().send(new PutObjectCommand({
    Bucket: R2_BUCKET.value(), Key: key, Body: buf, ContentType: 'audio/mpeg',
  }));
  return { key, bytes: buf.length };
}

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

// ============================================================================
// STEP 3b — INGEST A RECORDING INTO CLOUDFLARE R2
// Standalone + isolated: give it a Plivo recording URL, it downloads the mp3 and
// uploads it to your R2 bucket. Tested on its own (decoupled from Plivo's
// recording-ready delay); the SAME ingestRecordingToR2() helper will be called
// from the real masked-call webhook once we assemble the full flow.
// Needs the 4 R2 secrets set before deploy: R2_ACCOUNT_ID, R2_BUCKET,
// R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.
// ============================================================================
exports.r2IngestRecording = onRequest(
  { secrets: [PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN, ...R2_SECRETS] },
  async (req, res) => {
    try {
      const b = (req.body && typeof req.body === 'object') ? req.body : {};
      const key = req.get('X-Test-Key') || req.query.key || b.key;
      if (!key || key !== PLIVO_AUTH_TOKEN.value()) {
        res.status(401).json({ error: 'Unauthorized. Pass your Plivo Auth Token as the "X-Test-Key" header or "?key=".' });
        return;
      }
      const recordUrl = String(b.recordUrl || req.query.recordUrl || '').trim();
      if (!recordUrl) { res.status(400).json({ error: 'Missing "recordUrl" (the Plivo recording .mp3 URL).' }); return; }

      const objectKey = String(b.objectKey || req.query.objectKey || `recordings/test/${Date.now()}.mp3`).trim();
      logger.info('R2 ingest → start', { recordUrl, objectKey });
      const out = await ingestRecordingToR2(recordUrl, objectKey);
      logger.info('R2 ingest → OK', out);

      // Also write a doCalls record so it shows in the AJKO "Do Calls Recordings"
      // tab (with the R2 key for playback). vendorId/durationSec are optional —
      // the real masked-call flow will fill them; this test uses what's passed.
      const ref = await db.collection('doCalls').add({
        vendorId: b.vendorId || null,
        karigar: b.karigar || null,
        channelId: b.channelId || null,
        durationSec: Number(b.durationSec) || null,
        recordingKey: objectKey,
        pickedUp: true,
        source: 'r2IngestRecording-test',
        at: admin.firestore.FieldValue.serverTimestamp(),
      });
      logger.info('doCalls record written', { id: ref.id, recordingKey: objectKey });

      res.status(200).json({ ok: true, stored: out, doCallId: ref.id });
    } catch (e) {
      logger.error('r2IngestRecording failed', e);
      res.status(500).json({ ok: false, error: String((e && e.message) || e) });
    }
  },
);

// ============================================================================
// STEP 3c — PLAY A RECORDING INSIDE AJKO (admin-only signed URL)
// The "Do Calls Recordings" tab calls this with a recording's R2 key; it returns
// a short-lived signed URL the <audio> player can load. Admin-only: recordings
// are private and must never be a public link.
// ============================================================================
exports.getDoCallRecording = onCall({ secrets: R2_SECRETS }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  // Verify the caller is an admin (recordings are sensitive).
  const snap = await db.collection('users').where('authUid', '==', req.auth.uid).limit(1).get();
  if (snap.empty || snap.docs[0].data().role !== 'admin') {
    throw new HttpsError('permission-denied', 'Admins only.');
  }
  const recordingKey = String(req.data && req.data.recordingKey || '').trim();
  if (!recordingKey) throw new HttpsError('invalid-argument', 'Missing recordingKey.');

  const url = await getSignedUrl(
    r2Client(),
    new GetObjectCommand({ Bucket: R2_BUCKET.value(), Key: recordingKey }),
    { expiresIn: 3600 }, // 1 hour
  );
  return { url };
});

// ============================================================================
// STEP 4 — BROWSER CALLING (staff talk through AJKO, no SIM) + REAL MASKED,
// RECORDED CALL wired to the "Do Calls" button.
//
// Flow:
//   1. Staff opens Do Calls → browser SDK logs in as a Plivo endpoint (JWT from
//      plivoBrowserToken).
//   2. Staff taps "Call" on a karigar → browser places a WebRTC call, passing
//      the karigar number + vendorId as X-PH headers.
//   3. Plivo invokes plivoBrowserAnswer → we create the doCalls record, start
//      recording the whole call, and <Dial> the karigar with the SHOP number as
//      caller ID (masking) + a consent message.
//   4. On recording ready → plivoDoCallRecordingDone stores it in R2 + links it.
//   5. On hangup → plivoDoCallHangup finalizes the doCalls record.
//
// One-time setup: run plivoProvision (creates the Plivo Application + a shared
// staff Endpoint, stores ids in Firestore config/plivo).
// ============================================================================

const BROWSER_ANSWER_URL = 'https://us-central1-ajko-48799.cloudfunctions.net/plivoBrowserAnswer';
const DOCALL_HANGUP_URL = 'https://us-central1-ajko-48799.cloudfunctions.net/plivoDoCallHangup';
const DOCALL_RECORDING_DONE_URL = 'https://us-central1-ajko-48799.cloudfunctions.net/plivoDoCallRecordingDone';

const plivoAuthHeader = () => `Basic ${Buffer.from(`${PLIVO_AUTH_ID.value()}:${PLIVO_AUTH_TOKEN.value()}`).toString('base64')}`;
const plivoBase = () => `https://api.plivo.com/v1/Account/${PLIVO_AUTH_ID.value()}`;

// Verify the signed-in caller is an active admin or team member (the people who
// place calls). Returns the user doc.
async function requireStaff(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const snap = await db.collection('users').where('authUid', '==', req.auth.uid).limit(1).get();
  if (snap.empty) throw new HttpsError('permission-denied', 'No profile.');
  const u = snap.docs[0].data();
  if (u.isActive === false || !['admin', 'team'].includes(u.role)) {
    throw new HttpsError('permission-denied', 'Staff only.');
  }
  return { id: snap.docs[0].id, ...u };
}

// ---- 8. ONE-TIME PROVISION (HTTP, gated) -----------------------------------
// Creates the Plivo Application (pointing at our answer/hangup URLs) and a
// shared staff Endpoint, and saves their ids to Firestore config/plivo.
exports.plivoProvision = onRequest({ secrets: [PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN] }, async (req, res) => {
  try {
    const b = (req.body && typeof req.body === 'object') ? req.body : {};
    const key = req.get('X-Test-Key') || req.query.key || b.key;
    if (!key || key !== PLIVO_AUTH_TOKEN.value()) { res.status(401).json({ error: 'Unauthorized.' }); return; }

    // Create the Application.
    const appRes = await fetch(`${plivoBase()}/Application/`, {
      method: 'POST',
      headers: { Authorization: plivoAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_name: `ajko-browser-${Date.now()}`,
        answer_url: BROWSER_ANSWER_URL,
        answer_method: 'POST',
        hangup_url: DOCALL_HANGUP_URL,
        hangup_method: 'POST',
      }),
    });
    const appData = await appRes.json().catch(() => ({}));
    if (!appRes.ok) { res.status(502).json({ step: 'application', plivo: appData }); return; }
    const appId = String(appData.app_id);

    // Create a shared staff Endpoint attached to that Application.
    const username = `ajkostaff${Math.floor(Math.random() * 1e6)}`;
    const password = crypto.randomBytes(12).toString('hex'); // not stored; JWT login doesn't need it
    const epRes = await fetch(`${plivoBase()}/Endpoint/`, {
      method: 'POST',
      headers: { Authorization: plivoAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, alias: 'AJKO Staff', app_id: appId }),
    });
    const epData = await epRes.json().catch(() => ({}));
    if (!epRes.ok) { res.status(502).json({ step: 'endpoint', plivo: epData }); return; }
    const endpointUsername = String(epData.username || username);

    await db.collection('config').doc('plivo').set({
      appId, endpointUsername, provisionedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    logger.info('plivoProvision done', { appId, endpointUsername });
    res.status(200).json({ ok: true, appId, endpointUsername });
  } catch (e) {
    logger.error('plivoProvision failed', e);
    res.status(500).json({ error: String((e && e.message) || e) });
  }
});

// ---- 9. BROWSER LOGIN TOKEN (callable, staff) ------------------------------
// Mints a short-lived Plivo JWT so the browser SDK can register the endpoint
// without ever seeing the endpoint password.
exports.plivoBrowserToken = onCall({ secrets: [PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN] }, async (req) => {
  await requireStaff(req);
  const cfg = (await db.collection('config').doc('plivo').get()).data();
  if (!cfg || !cfg.appId || !cfg.endpointUsername) {
    throw new HttpsError('failed-precondition', 'Plivo not provisioned yet. Run plivoProvision.');
  }
  const now = Math.floor(Date.now() / 1000);
  const tokRes = await fetch(`${plivoBase()}/JWT/Token/`, {
    method: 'POST',
    headers: { Authorization: plivoAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      iss: PLIVO_AUTH_ID.value(),
      sub: cfg.endpointUsername,
      nbf: now,
      exp: now + 3600, // 1h
      per: { voice: { incoming_allow: false, outgoing_allow: true } },
      app: cfg.appId,
    }),
  });
  const data = await tokRes.json().catch(() => ({}));
  if (!tokRes.ok || !data.token) {
    logger.error('JWT token failed', data);
    throw new HttpsError('internal', 'Could not get browser token.');
  }
  return { token: data.token, endpointUsername: cfg.endpointUsername };
});

// ---- 10. BROWSER ANSWER URL (HTTP, public) ---------------------------------
// Invoked when the staff browser places a call. Creates the doCalls record,
// starts recording the whole call, then dials the karigar with the SHOP number
// as caller ID (masking) after a consent message.
exports.plivoBrowserAnswer = onRequest({ secrets: [PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN] }, async (req, res) => {
  res.set('Content-Type', 'text/xml');
  const p = { ...(req.query || {}), ...((req.body && typeof req.body === 'object') ? req.body : {}) };
  const callUuid = String(p.CallUUID || '').trim();
  // karigar comes from the X-PH header the browser set, falling back to the dialed To.
  const karigar = String(p['X-PH-Karigar'] || p.XPHKarigar || p.To || '').trim();
  const vendorId = String(p['X-PH-Vendorid'] || p.XPHVendorid || '') || null;

  if (!karigar) {
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?>\n<Response><Speak>Sorry, no number to connect.</Speak></Response>');
    return;
  }

  // Record the doCalls row (keyed by callUuid so later webhooks can find it).
  try {
    await db.collection('doCalls').add({
      callUuid, vendorId, karigar, channelId: p['X-PH-Channelid'] || null,
      at: admin.firestore.FieldValue.serverTimestamp(), status: 'in-progress', source: 'browser',
    });
  } catch (e) { logger.error('doCalls create failed', e); }

  // Start recording the whole call (bridged conversation). Best-effort.
  try {
    if (callUuid) {
      await fetch(`${plivoBase()}/Call/${callUuid}/Record/`, {
        method: 'POST',
        headers: { Authorization: plivoAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_format: 'mp3', callback_url: DOCALL_RECORDING_DONE_URL, callback_method: 'POST' }),
      });
    }
  } catch (e) { logger.error('start record failed', e); }

  const consent = `${BRIDGE_ANSWER_URL}?leg=b`; // reuse the Punjabi-ready consent snippet
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<Response>'
    + `<Speak>${escapeXml(CONSENT_TEXT)}</Speak>`
    + `<Dial callerId="${escapeXml(PLIVO_NUMBER)}" callerName="AJKO" timeout="30" `
    + `action="${escapeXml(DOCALL_HANGUP_URL)}" confirmSound="${escapeXml(consent)}">`
    + `<Number>${escapeXml(karigar)}</Number>`
    + '</Dial>'
    + '</Response>';
  logger.info('Plivo → browser answer', { callUuid, karigar, vendorId });
  res.status(200).send(xml);
});

// ---- 11. DO-CALL HANGUP (HTTP, public) -------------------------------------
// Finalizes the doCalls record when the call ends.
exports.plivoDoCallHangup = onRequest(async (req, res) => {
  const p = { ...(req.query || {}), ...((req.body && typeof req.body === 'object') ? req.body : {}) };
  const callUuid = String(p.CallUUID || '').trim();
  const dur = Number(p.Duration || p.BillDuration || p.DialBLegDuration || 0) || null;
  try {
    if (callUuid) {
      const snap = await db.collection('doCalls').where('callUuid', '==', callUuid).limit(1).get();
      if (!snap.empty) {
        await snap.docs[0].ref.set({ status: 'completed', durationSec: dur, pickedUp: dur ? true : false }, { merge: true });
      }
    }
  } catch (e) { logger.error('doCall hangup update failed', e); }
  res.set('Content-Type', 'text/xml');
  res.status(200).send('<?xml version="1.0" encoding="UTF-8"?>\n<Response></Response>');
});

// ---- 12. DO-CALL RECORDING DONE (HTTP, public) -----------------------------
// Plivo posts the recording here → download → R2 → link it on the doCalls row.
exports.plivoDoCallRecordingDone = onRequest(
  { secrets: [PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN, ...R2_SECRETS] },
  async (req, res) => {
    const p = { ...(req.query || {}), ...((req.body && typeof req.body === 'object') ? req.body : {}) };
    const callUuid = String(p.CallUUID || '').trim();
    const recordUrl = String(p.RecordUrl || p.RecordingUrl || p.recording_url || '').trim();
    const dur = Number(p.RecordingDuration || p.Duration || 0) || null;
    try {
      if (recordUrl && callUuid) {
        const key = `recordings/${callUuid}.mp3`;
        await ingestRecordingToR2(recordUrl, key);
        const snap = await db.collection('doCalls').where('callUuid', '==', callUuid).limit(1).get();
        if (!snap.empty) {
          await snap.docs[0].ref.set({ recordingKey: key, durationSec: dur }, { merge: true });
        }
        logger.info('doCall recording stored', { callUuid, key });
      }
    } catch (e) { logger.error('doCall recording ingest failed', e); }
    res.status(200).json({ ok: true });
  },
);
