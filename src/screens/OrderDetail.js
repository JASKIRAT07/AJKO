import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useUsers, useChannels } from '../hooks/useCollections';
import {
  getUrgency, formatDate, formatDateTime, stageInfo, allowedTransitions,
} from '../utils/format';
import { setStage, deleteOrder } from '../utils/actions';
import { getStreamPlayback } from '../utils/stream';
import { shareOrder, prepareShareFiles } from '../utils/share';
import { StageBadge, UrgencyBadge, EditedBadge } from '../components/Badges';
import StagePipeline from '../components/StagePipeline';
import MediaStrip from '../components/MediaStrip';
import { IcBack, IcWhatsApp, IcChevron } from '../components/Icons';

export default function OrderDetail() {
  const { id } = useParams();
  const { profile, isVendor, isAdmin, isTeam } = useAuth();
  const nav = useNavigate();
  const { data: users } = useUsers();
  const { data: channels } = useChannels(profile);
  const [order, setOrder] = useState(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [shareFiles, setShareFiles] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'orders', id), (s) => setOrder(s.exists() ? { id: s.id, ...s.data() } : null));
    return unsub;
  }, [id]);

  // Pre-fetch media so the Share tap can attach files synchronously (iOS-safe).
  const mediaKey = order ? (order.images || []).map((m) => (typeof m === 'string' ? m : m.url)).join(',') : '';
  useEffect(() => {
    let alive = true;
    if (order && mediaKey) prepareShareFiles(order).then((f) => { if (alive) setShareFiles(f); });
    return () => { alive = false; };
  }, [mediaKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const urgency = useMemo(() => order && getUrgency(order.dueDate, order.stage), [order]);
  if (!order) return <div className="full-center"><div className="spinner" /></div>;

  const channel = channels.find((c) => c.id === order.channelId);
  const vendorMembers = users.filter((u) => u.role === 'vendor' && u.channelId === order.channelId);
  const creator = users.find((u) => u.id === order.createdBy);
  const canAct = isAdmin || isTeam || (isVendor && order.channelId === profile?.channelId);
  const transitions = canAct ? allowedTransitions(order.stage, profile?.role) : [];
  const canShare = isAdmin || isVendor; // not team members
  const removeOrder = async () => {
    if (!window.confirm(`Delete order ${order.appOrderNo}? This also removes its messages and cannot be undone.`)) return;
    await deleteOrder(id);
    nav('/orders');
  };

  const specs = [
    ['Store ref', `#${order.storeOrderNo}`],
    ['Item name', order.itemName || '—'],
    ['Weight', order.weight ? `${order.weight} gms` : '—'],
    ['Purity', order.purity],
    ['Look', order.look],
    ['Pieces', order.pieces || '—'],
    ['Size', order.size || '—'],
    ['Width', order.width || '—'],
    ['Sample taken', order.sampleTaken ? 'Yes' : 'No'],
    ['Due date', order.dueDate ? formatDate(order.dueDate) : '—'],
  ];

  return (
    <div className="app-shell">
      <div className="topbar">
        <button className="icon-btn" onClick={() => nav(-1)}><IcBack size={18} /></button>
        <h1 style={{ fontSize: 17 }}>{order.appOrderNo}</h1>
      </div>

      <div className="screen" style={{ paddingBottom: 100 }}>
        {order.images?.length > 0 && <MediaStrip media={order.images} single={order.images.length === 1} />}

        {order.videos?.length > 0 && (
          <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            {order.videos.map((v) => <StreamVideo key={v.uid} uid={v.uid} />)}
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <div className="order-no" style={{ fontSize: 26 }}>{order.appOrderNo}</div>
          <div className="faint" style={{ fontSize: 13, marginTop: 2 }}>Store #{order.storeOrderNo}</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            {channel && <span className="chip spec-chip" style={{ fontWeight: 700 }}>💬 {channel.code}</span>}
            <h2 style={{ margin: 0, fontSize: 20 }}>{order.itemName}</h2>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <StageBadge stage={order.stage} />
            <UrgencyBadge urgency={urgency} />
            {order.edited && <EditedBadge />}
          </div>
        </div>

        <div className="card" style={{ marginTop: 14 }}><StagePipeline stage={order.stage} /></div>

        {transitions.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {transitions.filter((t) => t.kind !== 'primary').map((t) => (
              <button key={t.to} className={`btn ${t.kind === 'danger' ? 'btn-danger' : 'btn-ghost'}`}
                style={{ flex: '0 0 auto' }} onClick={() => setStage(order, t.to, profile)}>{t.label}</button>
            ))}
            {transitions.filter((t) => t.kind === 'primary').map((t) => (
              <button key={t.to} className="btn btn-primary" style={{ flex: 1, minWidth: 130 }}
                onClick={() => setStage(order, t.to, profile)}>{t.label}</button>
            ))}
          </div>
        )}

        {order.changes?.length > 0 && (
          <div style={{ marginTop: 16, border: '1.5px solid #8a5a2b', background: '#8a5a2b14', borderRadius: 14, padding: '12px 14px' }}>
            <div style={{ fontWeight: 800, color: '#7a4e24', fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>✏️</span> Change history
            </div>
            {[...order.changes].reverse().map((c, i) => (
              <div key={i} style={{ fontSize: 13, padding: '3px 0', color: '#5f3e1c', lineHeight: 1.5 }}>
                <b>{c.label || c.field}:</b> {c.from} → {c.to}
                <span className="faint" style={{ fontSize: 11 }}> · {formatDateTime(c.at)}{c.editedBy ? ` · by ${c.editedBy}` : ''}</span>
              </div>
            ))}
          </div>
        )}

        <div className="section-title">Specifications</div>
        <div className="specs-grid">
          {specs.map(([k, v]) => (
            <div className="spec-box" key={k}><div className="k">{k}</div><div className="v">{v || '—'}</div></div>
          ))}
          {order.designDetails && <div className="spec-box full"><div className="k">Design details</div><div className="v" style={{ fontWeight: 500 }}>{order.designDetails}</div></div>}
          {order.extraDetails && <div className="spec-box full"><div className="k">Extra details</div><div className="v" style={{ fontWeight: 500 }}>{order.extraDetails}</div></div>}
        </div>

        {!isVendor && channel && (<>
          <div className="section-title">Assigned channel</div>
          <div className="card card-tight" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="avatar" style={{ fontSize: 13 }}>{channel.code}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{channel.code}{channel.name && channel.name !== channel.code ? ` · ${channel.name}` : ''}</div>
              <div className="faint" style={{ fontSize: 12 }}>{vendorMembers.length ? vendorMembers.map((v) => v.code).join(', ') : 'No vendors yet'}</div>
            </div>
            <button className="link" onClick={() => nav(`/conversations?channel=${channel.id}`)}>Chat</button>
          </div>
        </>)}

        {!isVendor && creator && <div className="faint" style={{ fontSize: 12, marginTop: 12 }}>Created by {creator.name} · {formatDateTime(order.createdAt)}</div>}

        {order.stageHistory?.length > 0 && (
          <div className="card card-tight" style={{ marginTop: 18 }}>
            <button className="row-between" style={{ width: '100%', background: 'none', padding: 0 }} onClick={() => setAuditOpen((o) => !o)}>
              <span style={{ fontWeight: 800 }}>Audit log <span className="faint" style={{ fontWeight: 500 }}>({order.stageHistory.length})</span></span>
              <span style={{ transform: auditOpen ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}><IcChevron size={18} /></span>
            </button>
            {auditOpen && (
              <div style={{ marginTop: 10 }}>
                {[...order.stageHistory].reverse().map((h, i, arr) => (
                  <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--line)' : 'none' }}>
                    <span className="dot" style={{ background: stageInfo(h.stage).color, marginTop: 6 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>
                        {h.direction === 'create'
                          ? <>Order created — <span style={{ color: stageInfo(h.stage).color }}>{stageInfo(h.stage).label}</span></>
                          : <>
                              {h.fromStage ? `${stageInfo(h.fromStage).label} ` : ''}→ <span style={{ color: stageInfo(h.stage).color }}>{stageInfo(h.stage).label}</span>
                              {h.direction === 'back' ? ' (moved back)' : h.direction === 'rework' ? ' (sent for rework)' : ''}
                            </>}
                      </div>
                      <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
                        by {h.byName ? `${h.byName} (${h.by})` : h.by} · {formatDateTime(h.at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="input-bar" style={{ gap: 10, padding: '12px 16px max(12px, env(safe-area-inset-bottom))' }}>
        {!isVendor && <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => nav(`/edit/${id}`)}>Edit</button>}
        {isAdmin && <button className="btn btn-danger" style={{ flex: '0 0 auto' }} onClick={removeOrder}>Delete</button>}
        {canShare && <button className="btn btn-wa" style={{ flex: 1 }} onClick={() => shareOrder(order, shareFiles)}><IcWhatsApp size={18} /> Share</button>}
        {isTeam && <div style={{ flex: 1 }} />}
      </div>
    </div>
  );
}

// In-app Cloudflare Stream player for an order video. Fetches a short-lived
// SIGNED playback token from the server, then embeds the player inline — the
// user watches inside the order, no external link or redirect.
function StreamVideo({ uid }) {
  const [pb, setPb] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    setPb(null); setErr(false);
    getStreamPlayback(uid)
      .then((d) => { if (alive) setPb(d); })
      .catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [uid]);

  if (err) return <div className="card card-tight muted" style={{ textAlign: 'center' }}>Video unavailable right now.</div>;
  if (!pb) return <div className="card" style={{ height: 200, display: 'grid', placeItems: 'center' }}><div className="spinner" /></div>;

  const src = `https://${pb.host}/${pb.token}/iframe`;
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 14, overflow: 'hidden', background: '#000' }}>
      <iframe
        title="Order video"
        src={src}
        loading="lazy"
        style={{ border: 0, position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
        allowFullScreen
      />
    </div>
  );
}
