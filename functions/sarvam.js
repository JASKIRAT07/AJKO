/**
 * AJKO ↔ Sarvam voice-agent integration — CONNECTION 1 (outbound calls).
 *
 * This module is fully ISOLATED: it registers NEW functions only and never
 * touches existing AJKO functions, orders, auth, media, WhatsApp, or the AI
 * Calls UI. It is wired into deployment by a single `Object.assign` line at the
 * bottom of index.js.
 *
 * Exports:
 *   sarvamTestCall   (HTTP)      — manual one-off test call to a number you pass.
 *   dailyVendorCalls (schedule)  — 13:30 Asia/Kolkata; calls each eligible vendor
 *                                  with their real order counts.
 *
 * Results (recording / transcript / picked-up / upset) arrive later via a
 * webhook — that receiver is Connection 2 (built next). The webhook URL below
 * is a PLACEHOLDER until then.
 */
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

// index.js calls initializeApp() before requiring this module; the guard keeps
// the module safe to load in any order (and in tests) without double-init.
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// Sarvam API key — set via `firebase functions:secrets:set SARVAM_API_KEY`.
// NEVER hardcoded.
const SARVAM_API_KEY = defineSecret('SARVAM_API_KEY');

// ---- Sarvam call configuration (non-secret constants) -----------------------
const SARVAM_ORG_ID = '019f7496-980c-7d27-95e9-a0d6ed786acf';
const SARVAM_WORKSPACE_ID = '019f7496-9814-71bd-b38e-312c51c44fef';
const SARVAM_URL = `https://apps.sarvam.ai/api/outbounds/v1/orgs/${SARVAM_ORG_ID}/workspaces/${SARVAM_WORKSPACE_ID}/outbounds`;

const SARVAM_APP = {
  app_id: 'AJKO-VENDOR-08239b17-f628',
  app_version: 1,
  connection_id: 'ec2b200b-0f-a44cac3e-99ed',
  agent_phone_number: '+917971413677',
};

// Placeholder until Connection 2 (the webhook receiver) is deployed. The call
// still succeeds without a live webhook — results are simply not delivered yet.
const WEBHOOK_URL = 'https://REPLACE_WITH_WEBHOOK/sarvamWebhook';

// ---- tiny local helpers (self-contained; no imports from index.js) ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Any Indian phone → strict E.164 (+91XXXXXXXXXX). Returns '' if not 10 digits.
function toE164India(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 12 && d.startsWith('91')) return `+${d}`;
  d = d.replace(/^0+/, '').slice(-10);
  return d.length === 10 ? `+91${d}` : '';
}

// Firestore Timestamp / Date / string → JS Date (or null).
function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === 'object' && v._seconds != null) return new Date(v._seconds * 1000);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// "2026-09-09" in IST — for due-date comparisons and the metadata date stamp.
function istYMD(d) {
  if (!d) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

// Mirror the app's stage model (src/utils/format.js):
//   done = ready | handedover ; everything else is pending.
const DONE_STAGES = ['ready', 'handedover'];
const isPending = (stage) => !DONE_STAGES.includes(stage);

// Force all four counts to strings, as Sarvam requires.
function stringifyCounts(c) {
  return {
    new_count: String(c.new_count || 0),
    in_process_count: String(c.in_process_count || 0),
    ready_count: String(c.ready_count || 0),
    overdue_count: String(c.overdue_count || 0),
  };
}

// ---- the one place that talks to Sarvam -------------------------------------
// Places a single outbound call. Never throws — returns a structured result and
// logs the full request + Sarvam's response (including any error body).
async function placeSarvamCall({ phone, counts, vendorId, date }) {
  const agent_variables = stringifyCounts(counts);
  const body = {
    app_config: {
      app_id: SARVAM_APP.app_id,
      app_version: SARVAM_APP.app_version,
      connection_config: {
        connection_id: SARVAM_APP.connection_id,
        agent_phone_number: SARVAM_APP.agent_phone_number,
      },
      agent_variables,
    },
    user_config: { user_phone_number: phone },
    webhook_config: { url: WEBHOOK_URL, metadata: { vendorId: vendorId || '', date: date || '' } },
  };

  logger.info('Sarvam → POST outbound', { url: SARVAM_URL, phone, vendorId, agent_variables });

  try {
    const res = await fetch(SARVAM_URL, {
      method: 'POST',
      headers: { 'X-API-Key': SARVAM_API_KEY.value(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = text; }
    if (!res.ok) {
      logger.error(`Sarvam HTTP ${res.status}`, { phone, vendorId, response: data });
      return { ok: false, status: res.status, response: data };
    }
    logger.info('Sarvam OK', { phone, vendorId, attempt_id: data && data.attempt_id, response: data });
    return { ok: true, status: res.status, response: data };
  } catch (e) {
    logger.error('Sarvam request threw', { phone, vendorId, error: String((e && e.message) || e) });
    return { ok: false, status: 0, response: String((e && e.message) || e) };
  }
}

// ---- MANUAL TEST (HTTP) -----------------------------------------------------
// Trigger ONE call to a number you specify, with counts you specify. Gated by
// the Sarvam API key itself (pass it as the X-Test-Key header or ?key=), so it
// is not an open endpoint that anyone could use to place calls.
//
//   curl -X POST "<function-url>" \
//     -H "X-Test-Key: <SARVAM_API_KEY>" -H "Content-Type: application/json" \
//     -d '{"phone":"+91XXXXXXXXXX","new_count":2,"in_process_count":4,"ready_count":3,"overdue_count":2}'
exports.sarvamTestCall = onRequest({ secrets: [SARVAM_API_KEY] }, async (req, res) => {
  try {
    const b = (req.body && typeof req.body === 'object') ? req.body : {};
    const key = req.get('X-Test-Key') || req.query.key || b.key;
    if (!key || key !== SARVAM_API_KEY.value()) {
      res.status(401).json({ error: 'Unauthorized. Pass the Sarvam API key as the "X-Test-Key" header or "?key=".' });
      return;
    }

    const phone = toE164India(b.phone || req.query.phone);
    if (!phone) {
      res.status(400).json({ error: 'Missing or invalid "phone". Use +91XXXXXXXXXX (Indian 10-digit).' });
      return;
    }

    const num = (v, d) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : d;
    };
    const counts = {
      new_count: num(b.new_count, 2),
      in_process_count: num(b.in_process_count, 4),
      ready_count: num(b.ready_count, 3),
      overdue_count: num(b.overdue_count, 2),
    };

    const out = await placeSarvamCall({
      phone,
      counts,
      vendorId: b.vendorId || 'manual-test',
      date: b.date || istYMD(new Date()),
    });

    res.status(out.ok ? 200 : 502).json({
      requested: { phone, counts: stringifyCounts(counts) },
      sarvam: out,
    });
  } catch (e) {
    logger.error('sarvamTestCall failed', e);
    res.status(500).json({ error: String((e && e.message) || e) });
  }
});

// ---- DAILY SCHEDULED CALLS --------------------------------------------------
// 13:30 Asia/Kolkata. For each active vendor: compute their channel's real order
// counts, skip when disabled / upset-paused / all-zero / no phone, then place
// one call. Failures are per-vendor (never stop the loop). Calls are spaced ~1s.
exports.dailyVendorCalls = onSchedule(
  { schedule: '30 13 * * *', timeZone: 'Asia/Kolkata', secrets: [SARVAM_API_KEY] },
  async () => {
    const date = istYMD(new Date());
    const today = date;

    const [usersSnap, ordersSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('orders').get(),
    ]);

    // Aggregate counts per channel (orders belong to a channel; a vendor works
    // their channel). Mirrors the app's stage buckets: "New (Edited)" rolls up
    // into New; overdue = any pending order past its due date.
    const byChannel = {};
    ordersSnap.docs.forEach((d) => {
      const o = d.data();
      if (o.isDraft || !o.channelId) return;
      const c = byChannel[o.channelId] || (byChannel[o.channelId] = {
        new_count: 0, in_process_count: 0, ready_count: 0, overdue_count: 0,
      });
      const st = o.stage;
      if (st === 'new' || st === 'newedited') c.new_count += 1;
      else if (st === 'inprogress') c.in_process_count += 1;
      else if (st === 'ready') c.ready_count += 1;
      if (isPending(st)) {
        const ymd = istYMD(toDate(o.dueDate));
        if (ymd && ymd < today) c.overdue_count += 1;
      }
    });

    const vendors = usersSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u) => u.role === 'vendor' && u.isActive !== false);

    let placed = 0;
    let skipped = 0;
    let failed = 0;

    for (const v of vendors) {
      try {
        if (v.aiCallsEnabled === false) { logger.info(`skip ${v.id}: aiCallsEnabled OFF`); skipped += 1; continue; }
        // Upset-pause flag (set by Connection 2 when a vendor gets upset).
        if (v.aiCallsPaused === true) { logger.info(`skip ${v.id}: upset-paused`); skipped += 1; continue; }

        const phone = toE164India(v.phone);
        if (!phone) { logger.warn(`skip ${v.id}: no valid phone`); skipped += 1; continue; }

        const c = byChannel[v.channelId] || { new_count: 0, in_process_count: 0, ready_count: 0, overdue_count: 0 };
        const total = c.new_count + c.in_process_count + c.ready_count + c.overdue_count;
        if (total === 0) { logger.info(`skip ${v.id}: all counts zero`); skipped += 1; continue; }

        const out = await placeSarvamCall({ phone, counts: c, vendorId: v.id, date });
        if (out.ok) {
          placed += 1;
          logger.info(`called ${v.id} (${v.code || v.name})`, { counts: stringifyCounts(c), attempt_id: out.response && out.response.attempt_id });
        } else {
          failed += 1;
          logger.error(`call FAILED ${v.id} (${v.code || v.name})`, { status: out.status, response: out.response });
        }
        await sleep(1000); // ~1s between vendors
      } catch (e) {
        failed += 1;
        logger.error(`vendor ${v.id} unexpected error`, e);
      }
    }

    logger.info(`dailyVendorCalls done — placed=${placed} skipped=${skipped} failed=${failed} of ${vendors.length} vendor(s)`);
  },
);
