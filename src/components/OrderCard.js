import { useState, useEffect, useRef, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  stageInfo, formatDateTime, allowedTransitions,
} from '../utils/format';
import { setStage } from '../utils/actions';
import { shareOrder } from '../utils/share';
import { getStreamPlayback, streamThumbUrl } from '../utils/stream';
import { UrgencyBadge, EditedBadge } from './Badges';
import StagePipeline from './StagePipeline';
import MediaStrip from './MediaStrip';
import { IcWhatsApp } from './Icons';

// Card preview thumbnail for a Cloudflare Stream video. LAZY: does nothing until
// the tile scrolls near the viewport, then loads a SMALL thumbnail (never the
// video file). Falls back to a neutral tile while processing / on error.
function VideoThumb({ uid, onOpen }) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  const [pb, setPb] = useState(null);
  const [failed, setFailed] = useState(false);

  // Only start any work once the tile is near the viewport.
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setInView(true); io.disconnect(); }
    }, { rootMargin: '250px' });
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView) return undefined;
    let alive = true;
    getStreamPlayback(uid).then((d) => { if (alive) setPb(d); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [inView, uid]);

  const base = !failed ? streamThumbUrl(pb) : null;
  const url = base ? `${base}?width=400&height=400&fit=crop` : null; // small, not full-res
  const processing = inView && !failed && (!pb || !pb.ready);
  return (
    <div ref={ref} onClick={onOpen} style={{ position: 'relative', width: 120, height: 120, minWidth: 120, flexShrink: 0, borderRadius: 14, overflow: 'hidden', background: '#111', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
      {url
        ? <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <div style={{ color: '#fff', opacity: 0.75, fontSize: 12, textAlign: 'center', padding: 6 }}>{processing ? '🎥 Processing…' : '🎥 Video'}</div>}
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
        <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 16, paddingLeft: 3 }}>▶</div>
      </div>
    </div>
  );
}

function OrderCard({ order, channelCode, createdByName, inFeed }) {
  const { profile, isVendor, isAdmin, isTeam } = useAuth();
  const nav = useNavigate();
  const urg = order.urgency;
  const glow = urg?.overdue ? 'glow-red' : stageInfo(order.stage).glow;
  const ownChannel = order.channelId === profile?.channelId;
  const canAct = isAdmin || isTeam || (isVendor && ownChannel);
  const canShare = isVendor || isAdmin; // team members cannot share
  const transitions = canAct ? allowedTransitions(order.stage, profile?.role) : [];
  const primary = transitions.find((t) => t.kind === 'primary');
  const danger = transitions.find((t) => t.kind === 'danger');

  const go = () => nav(`/order/${order.id}`);

  // Sharing pre-fetches the order's images/voice note into files, which can take
  // a few seconds — show a spinner on the button so the tap isn't a dead wait.
  const [sharing, setSharing] = useState(false);
  const onShare = async (e) => {
    e.stopPropagation();
    if (sharing) return;
    setSharing(true);
    try { await shareOrder(order); } finally { setSharing(false); }
  };

  return (
    <div className={`card card-order ${glow}`} style={{ marginBottom: 10 }}>
      {/* Line 1: AJKO order number · View details (centre) · status badge */}
      <div className="oc-top">
        <div className="order-no" onClick={go} style={{ cursor: 'pointer' }}>{order.appOrderNo}</div>
        <button type="button" className="btn btn-details btn-details-sm" onClick={go}>View&nbsp;details&nbsp;→</button>
        <div className="oc-badge"><UrgencyBadge urgency={urg} /></div>
      </div>

      {/* Line 2: store number (meta) + the prominent item / vendor name */}
      <div onClick={go} style={{ cursor: 'pointer', marginTop: 9 }}>
        <div className="store-no">Store #{order.storeOrderNo}</div>
        <div className="oc-name-row">
          {channelCode && <span className="chip spec-chip" style={{ fontWeight: 700 }}>💬 {channelCode}</span>}
          <span className="oc-name">{order.itemName}</span>
          {order.edited && <EditedBadge />}
        </div>
      </div>

      {/* The image — the heart of the card (compact tile) */}
      {order.images?.length > 0 && (
        <div className="oc-media" style={{ marginTop: 10 }}>
          <MediaStrip media={order.images} />
        </div>
      )}

      {order.videos?.length > 0 && (
        <div className="oc-media" style={{ marginTop: 10 }}>
          <div className="media-strip">
            {order.videos.map((v) => <VideoThumb key={v.uid} uid={v.uid} onOpen={go} />)}
          </div>
        </div>
      )}

      {/* Status */}
      <div style={{ margin: '10px 0 8px' }} onClick={go}><StagePipeline stage={order.stage} compact /></div>
      {(() => {
        const s = stageInfo(order.stage);
        return (
          <div onClick={go} style={{ background: `${s.color}1a`, color: s.color, borderRadius: 10, padding: '9px 0', fontWeight: 800, fontSize: 13.5, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer' }}>
            <span className="dot" style={{ background: s.color }} /> {s.label}
          </div>
        );
      })()}

      {createdByName && (
        <div className="faint" style={{ fontSize: 11, marginTop: 8 }}>
          Created by {createdByName} · {formatDateTime(order.createdAt)}
        </div>
      )}

      {/* Actions — Start work + a wide WhatsApp button, on one line */}
      {(primary || danger || canShare) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {danger && (
            <button className="btn btn-danger" style={{ flex: '0 0 auto' }}
              onClick={(e) => { e.stopPropagation(); setStage(order, danger.to, profile); }}>{danger.label}</button>
          )}
          {primary && (
            <button className="btn btn-primary" style={{ flex: 1, minWidth: 0 }}
              onClick={(e) => { e.stopPropagation(); setStage(order, primary.to, profile); }}>{primary.label}</button>
          )}
          {canShare && (
            <button className="btn btn-wa" style={{ flex: 1.4, minWidth: 0 }} disabled={sharing} onClick={onShare}>
              {sharing
                ? <><span className="btn-spin" /> Preparing…</>
                : <><IcWhatsApp size={18} /> Share</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(OrderCard);
