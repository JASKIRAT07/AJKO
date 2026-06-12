import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import {
  useUsers, useChannelMessages, useOrders, decorateOrders,
} from '../hooks/useCollections';
import { dayKey, dayDivider, formatTime } from '../utils/format';
import { sendMessage } from '../utils/actions';
import { uploadBlob } from '../utils/upload';
import OrderCard from '../components/OrderCard';
import { IcBack, IcSearch, IcDots, IcPlus, IcMic, IcSend } from '../components/Icons';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'inprogress', label: 'In progress' },
  { key: 'ready', label: 'Ready' },
  { key: 'overdue', label: 'Overdue' },
];

export default function Channel() {
  const { id } = useParams();
  const { profile, isVendor, isAdmin } = useAuth();
  const nav = useNavigate();
  const { data: users } = useUsers();
  const { data: messages } = useChannelMessages(id);
  const { data: rawOrders } = useOrders(profile);
  const [channel, setChannel] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState('all');
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const endRef = useRef(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'channels', id), (s) => { setChannel(s.exists() ? { id: s.id, ...s.data() } : null); setLoaded(true); });
    return unsub;
  }, [id]);

  const orders = useMemo(() => decorateOrders(rawOrders.filter((o) => o.channelId === id)), [rawOrders, id]);
  const members = users.filter((u) => channel?.memberIds?.includes(u.id));
  const vendorMembers = members.filter((u) => u.role === 'vendor');
  const isMember = isAdmin || channel?.memberIds?.includes(profile?.id);

  const feed = useMemo(() => {
    const orderItems = orders
      .filter((o) => {
        if (filter === 'all') return true;
        if (filter === 'overdue') return o.isOverdue;
        return o.stage === filter;
      })
      .map((o) => ({ kind: 'order', ts: o.createdAt, data: o, id: `o-${o.id}` }));
    const msgItems = messages
      .filter((m) => m.type !== 'order')
      .map((m) => ({ kind: 'msg', ts: m.timestamp, data: m, id: `m-${m.id}` }));
    return [...orderItems, ...msgItems].sort((a, b) => tsVal(a.ts) - tsVal(b.ts));
  }, [orders, messages, filter]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [feed.length]);

  const send = async () => { if (!text.trim()) return; await sendMessage({ channelId: id, sender: profile, content: text }); setText(''); };

  const toggleRec = async () => {
    if (recording) { recRef.current?.stop(); setRecording(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = await uploadBlob(blob, 'voice');
        await sendMessage({ channelId: id, sender: profile, content: url, type: 'voice' });
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start(); recRef.current = rec; setRecording(true);
    } catch { alert('Microphone permission needed.'); }
  };

  if (loaded && (!channel || !isMember)) {
    return (
      <div className="app-shell">
        <div className="topbar"><button className="icon-btn" onClick={() => nav(-1)}><IcBack size={18} /></button><h1 style={{ fontSize: 17 }}>Channel</h1></div>
        <div className="empty"><div className="big">🔒</div>{!channel ? 'Channel not found.' : 'You are not a member of this channel.'}</div>
      </div>
    );
  }

  let lastDay = null;

  return (
    <div className="app-shell">
      <div className="topbar">
        <button className="icon-btn" onClick={() => nav(-1)}><IcBack size={18} /></button>
        <div className="avatar" style={{ width: 38, height: 38, fontSize: 13 }}>{channel?.code}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{channel?.code}{channel?.name && channel.name !== channel.code ? ` · ${channel.name}` : ''}</div>
          <div className="faint" style={{ fontSize: 12 }}>{vendorMembers.length} vendor{vendorMembers.length === 1 ? '' : 's'} · {members.length} member{members.length === 1 ? '' : 's'}</div>
        </div>
        <button className="icon-btn" onClick={() => nav('/search')}><IcSearch size={18} /></button>
        <button className="icon-btn"><IcDots size={18} /></button>
      </div>

      <div className="pill-row" style={{ padding: '10px 16px 0' }}>
        {FILTERS.map((f) => <button key={f.key} className={`chip ${filter === f.key ? 'chip-active' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>)}
      </div>

      <div className="screen" style={{ paddingTop: 12, paddingBottom: 96 }}>
        {feed.length === 0 && <div className="empty"><div className="big">✨</div>No activity yet.{!isVendor && ' Create the first order.'}</div>}
        {feed.map((item) => {
          const day = dayKey(item.ts);
          const showDivider = day && day !== lastDay;
          lastDay = day;
          return (
            <div key={item.id}>
              {showDivider && <div className="day-divider"><span>{dayDivider(item.ts)}</span></div>}
              {item.kind === 'order'
                ? <OrderCard order={item.data} inFeed />
                : <MessageBubble m={item.data} mine={item.data.senderId === profile?.id} />}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="input-bar">
        {!isVendor && <button className="round-btn primary" onClick={() => nav(`/create?channel=${id}`)}><IcPlus size={20} /></button>}
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Message…" onKeyDown={(e) => e.key === 'Enter' && send()} />
        <button className={`round-btn ${recording ? 'primary' : 'soft'}`} onClick={toggleRec} style={recording ? { color: '#fff' } : {}}>{recording ? '⏹' : <IcMic size={20} />}</button>
        <button className="round-btn primary" onClick={send}><IcSend size={18} /></button>
      </div>
    </div>
  );
}

function MessageBubble({ m, mine }) {
  return (
    <div className={`msg ${mine ? 'out' : 'in'}`}>
      {!mine && <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>{m.senderCode}</div>}
      {m.type === 'stage' ? <em>🔁 {m.content}</em>
        : m.type === 'voice' ? <audio src={m.content} controls style={{ maxWidth: 200, height: 36 }} />
          : m.content}
      <div className="meta">{formatTime(m.timestamp)}</div>
    </div>
  );
}

function tsVal(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts instanceof Date) return ts.getTime();
  return new Date(ts).getTime();
}
