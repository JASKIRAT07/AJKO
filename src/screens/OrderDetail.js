import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useUsers, useOrderMessages } from '../hooks/useCollections';
import {
  getUrgency, formatDate, formatDateTime, whatsappUrl, stageInfo,
} from '../utils/format';
import { moveStage, sendMessage } from '../utils/actions';
import { StageBadge, UrgencyBadge } from '../components/Badges';
import StagePipeline from '../components/StagePipeline';
import MediaStrip from '../components/MediaStrip';
import { IcBack, IcWhatsApp, IcSend } from '../components/Icons';

export default function OrderDetail() {
  const { id } = useParams();
  const { profile, isVendor, isAdmin, isTeam } = useAuth();
  const nav = useNavigate();
  const { data: users } = useUsers();
  const [order, setOrder] = useState(null);
  const { data: messages } = useOrderMessages(id);
  const [text, setText] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'orders', id), (s) => setOrder(s.exists() ? { id: s.id, ...s.data() } : null));
    return unsub;
  }, [id]);

  const urgency = useMemo(() => order && getUrgency(order.dueDate, order.stage), [order]);
  if (!order) return <div className="full-center"><div className="spinner" /></div>;

  const vendor = users.find((u) => u.id === order.vendorId);
  const creator = users.find((u) => u.id === order.createdBy);
  const canMove = isVendor && order.vendorId === profile?.id;
  const canShare = isAdmin || isVendor; // not team members
  const sendText = async () => { if (!text.trim()) return; await sendMessage({ channelId: order.channelId, orderId: id, sender: profile, content: text }); setText(''); };

  const specs = [
    ['Store ref', order.storeOrderNo],
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

        <div style={{ marginTop: 14 }}>
          <div className="row-between">
            <h2 style={{ margin: 0, fontSize: 22 }}>{order.itemName}</h2>
          </div>
          <div className="faint" style={{ fontSize: 13, marginTop: 4 }}>{order.appOrderNo} · Store {order.storeOrderNo}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <StageBadge stage={order.stage} />
            <UrgencyBadge urgency={urgency} />
          </div>
        </div>

        <div className="card" style={{ marginTop: 14 }}><StagePipeline stage={order.stage} /></div>

        {canMove && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {order.stage !== 'new' && <button className="btn btn-ghost" onClick={() => moveStage(order, -1, profile)}>↩︎ Move back</button>}
            {order.stage !== 'ready' && <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => moveStage(order, 1, profile)}>
              {order.stage === 'new' ? 'Start work' : 'Mark ready'}</button>}
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

        {order.voiceNote && (<>
          <div className="section-title">Voice note</div>
          <audio src={order.voiceNote} controls style={{ width: '100%' }} />
        </>)}

        {!isVendor && vendor && (<>
          <div className="section-title">Assigned vendor</div>
          <div className="card card-tight" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="avatar">{vendor.code?.replace('-', '')}</div>
            <div><div style={{ fontWeight: 700 }}>{vendor.code}</div><div className="faint" style={{ fontSize: 12 }}>{vendor.specialty || 'Karigar'}</div></div>
          </div>
        </>)}

        {!isVendor && creator && <div className="faint" style={{ fontSize: 12, marginTop: 12 }}>Created by {creator.name} · {formatDateTime(order.createdAt)}</div>}

        {order.stageHistory?.length > 0 && (<>
          <div className="section-title">Stage history</div>
          <div className="card card-tight">
            {order.stageHistory.map((h, i) => (
              <div key={i} className="row-between" style={{ padding: '4px 0' }}>
                <span style={{ color: stageInfo(h.stage).color, fontWeight: 700, fontSize: 13 }}>{stageInfo(h.stage).label}</span>
                <span className="faint" style={{ fontSize: 12 }}>{h.by} · {formatDateTime(h.at)}</span>
              </div>
            ))}
          </div>
        </>)}

        <div className="section-title">Conversation</div>
        {messages.filter((m) => m.type !== 'order').length === 0 && <p className="faint" style={{ fontSize: 13 }}>No messages yet.</p>}
        {messages.map((m) => {
          if (m.type === 'order') return null;
          const mine = m.senderId === profile?.id;
          return (
            <div key={m.id} className={`msg ${mine ? 'out' : 'in'}`}>
              {!mine && <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>{m.senderCode}</div>}
              {m.type === 'stage' ? <em>{m.content}</em> : m.content}
              <div className="meta">{formatDateTime(m.timestamp)}</div>
            </div>
          );
        })}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input className="input" style={{ borderRadius: 22 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Message about this order…" onKeyDown={(e) => e.key === 'Enter' && sendText()} />
          <button className="round-btn primary" onClick={sendText}><IcSend size={18} /></button>
        </div>
      </div>

      <div className="input-bar" style={{ gap: 10, padding: '12px 16px max(12px, env(safe-area-inset-bottom))' }}>
        {!isVendor && <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => nav(`/edit/${id}`)}>Edit order</button>}
        {canShare && <a className="btn btn-wa" style={{ flex: 1 }} href={whatsappUrl(order, vendor?.phone)} target="_blank" rel="noreferrer"><IcWhatsApp size={18} /> WhatsApp share</a>}
        {isTeam && <div style={{ flex: 1 }} />}
      </div>
    </div>
  );
}
