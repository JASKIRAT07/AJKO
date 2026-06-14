import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  useChannels, useChannelMessages, useOrders, decorateOrders,
} from '../hooks/useCollections';
import { dayKey, dayDivider, formatTime, isDone } from '../utils/format';
import { sendMessage } from '../utils/actions';
import { uploadBlob } from '../utils/upload';
import BottomNav from '../components/BottomNav';
import { IcMic, IcSend } from '../components/Icons';

const MENTION = /(@APP-\d+)/g;

export default function Conversations() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data: channels } = useChannels(profile);
  const { data: rawOrders } = useOrders(profile);
  const orders = useMemo(() => decorateOrders(rawOrders), [rawOrders]);

  const [channelId, setChannelId] = useState(params.get('channel') || '');
  const [text, setText] = useState('');
  const [showTagger, setShowTagger] = useState(false);
  const [recording, setRecording] = useState(false);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  // default to the first channel once channels load
  useEffect(() => {
    if (!channelId && channels.length) setChannelId(channels[0].id);
  }, [channels, channelId]);

  const { data: messages } = useChannelMessages(channelId);
  const channel = channels.find((c) => c.id === channelId);

  const orderByNo = useMemo(() => {
    const map = {};
    orders.forEach((o) => { if (o.appOrderNo) map[o.appOrderNo] = o; });
    return map;
  }, [orders]);

  const channelOrders = orders.filter((o) => o.channelId === channelId);
  const activeOrders = channelOrders.filter((o) => !isDone(o.stage));

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, channelId]);

  const pickChannel = (cid) => { setChannelId(cid); setParams(cid ? { channel: cid } : {}); };

  const send = async () => {
    if (!text.trim() || !channelId) return;
    await sendMessage({ channelId, sender: profile, content: text.trim() });
    setText('');
  };

  const insertTag = (no) => {
    setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}@${no} `);
    setShowTagger(false);
    inputRef.current?.focus();
  };

  const toggleRec = async () => {
    if (!channelId) return;
    if (recording) { recRef.current?.stop(); setRecording(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = await uploadBlob(blob, 'voice');
        await sendMessage({ channelId, sender: profile, content: url, type: 'voice' });
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start(); recRef.current = rec; setRecording(true);
    } catch { alert('Microphone permission needed.'); }
  };

  const renderContent = (body) => String(body || '').split(MENTION).map((p, i) => {
    if (/^@APP-\d+$/.test(p)) {
      const no = p.slice(1);
      const o = orderByNo[no];
      return <span key={i} className="mention" onClick={() => o && nav(`/order/${o.id}`)}>{p}</span>;
    }
    return p;
  });

  let lastDay = null;

  return (
    <div className="app-shell">
      <div className="topbar">
        <h1 style={{ flex: '0 0 auto' }}>Chat</h1>
        <select className="select" style={{ flex: 1, padding: '10px 12px' }} value={channelId} onChange={(e) => pickChannel(e.target.value)}>
          {channels.length === 0 && <option value="">No channels</option>}
          {channels.map((c) => <option key={c.id} value={c.id}>{c.code}{c.name && c.name !== c.code ? ` · ${c.name}` : ''}</option>)}
        </select>
      </div>

      <div className="screen" style={{ paddingTop: 12, paddingBottom: 96 }}>
        {!channelId ? (
          <div className="empty"><div className="big">💬</div>No channels available</div>
        ) : messages.length === 0 ? (
          <div className="empty"><div className="big">✨</div>No messages in {channel?.code} yet</div>
        ) : messages.map((m) => {
          const day = dayKey(m.timestamp);
          const showDivider = day && day !== lastDay;
          lastDay = day;
          const mine = m.senderId === profile?.id;
          return (
            <div key={m.id}>
              {showDivider && <div className="day-divider"><span>{dayDivider(m.timestamp)}</span></div>}
              <div className={`msg ${mine ? 'out' : 'in'}`}>
                {!mine && <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>{m.senderCode}</div>}
                {m.type === 'voice'
                  ? <audio src={m.content} controls style={{ maxWidth: 200, height: 36 }} />
                  : <span>{renderContent(m.content)}</span>}
                <div className="meta">{formatTime(m.timestamp)}</div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {showTagger && (
        <div className="modal-back" onClick={() => setShowTagger(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Tag an order</h3>
            {activeOrders.length === 0 ? <p className="faint">No active orders in this channel.</p> : activeOrders.map((o) => (
              <div key={o.id} className="card card-tight" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => insertTag(o.appOrderNo)}>
                <span className="order-no" style={{ fontSize: 16 }}>{o.appOrderNo}</span>
                <span style={{ flex: 1 }}>{o.itemName}</span>
                <span className="chip spec-chip">{o.stage}</span>
              </div>
            ))}
            <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={() => setShowTagger(false)}>Close</button>
          </div>
        </div>
      )}

      {channelId && (
        <div className="input-bar">
          <button className="round-btn soft" onClick={() => setShowTagger(true)} title="Tag an order" style={{ fontWeight: 800 }}>@</button>
          <input ref={inputRef} className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message ${channel?.code || ''}…`} onKeyDown={(e) => e.key === 'Enter' && send()} />
          <button className={`round-btn ${recording ? 'primary' : 'soft'}`} onClick={toggleRec} style={recording ? { color: '#fff' } : {}}>{recording ? '⏹' : <IcMic size={20} />}</button>
          <button className="round-btn primary" onClick={send}><IcSend size={18} /></button>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
