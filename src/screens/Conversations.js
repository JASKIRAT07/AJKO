import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  useChannels, useChannelMessages, useOrders, decorateOrders,
} from '../hooks/useCollections';
import { dayKey, dayDivider, formatTime, isDone } from '../utils/format';
import { sendMessage, deleteMessageAsAdmin } from '../utils/actions';
import { uploadFile, uploadBlob, supportedAudioMime } from '../utils/upload';
import BottomNav from '../components/BottomNav';
import { IcSend, IcMic, IcImage } from '../components/Icons';

const MENTION = /(@(?:AO|APP)-\d+)/g;

export default function Conversations() {
  const { profile, isAdmin } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data: channels } = useChannels(profile);
  const { data: rawOrders } = useOrders(profile);
  const orders = useMemo(() => decorateOrders(rawOrders), [rawOrders]);

  const [channelId, setChannelId] = useState(params.get('channel') || '');
  const [text, setText] = useState('');
  const [showTagger, setShowTagger] = useState(false);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!channelId && channels.length) setChannelId(channels[0].id);
  }, [channels, channelId]);

  const { data: rawMessages } = useChannelMessages(channelId);
  // Real chat content only — never stage/order system entries.
  const messages = useMemo(
    () => rawMessages.filter((m) => m.type !== 'stage' && m.type !== 'order'),
    [rawMessages]
  );
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

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !channelId) return;
    setUploading(true);
    try {
      // Smaller/faster for chat than order media.
      const { url, type } = await uploadFile(file, 'chat', { maxDim: 1000, quality: 0.55 });
      await sendMessage({ channelId, sender: profile, content: url, type });
    } catch (err) { alert('Upload failed. Check your connection.'); }
    finally { setUploading(false); }
  };

  const toggleRec = async () => {
    if (!channelId) return;
    if (recording) { recRef.current?.stop(); setRecording(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = supportedAudioMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => chunksRef.current.push(ev.data);
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || mime || 'audio/mp4' });
        stream.getTracks().forEach((t) => t.stop());
        setUploading(true);
        try {
          const url = await uploadBlob(blob, 'voice');
          await sendMessage({ channelId, sender: profile, content: url, type: 'voice' });
        } catch { alert('Could not send voice message.'); }
        finally { setUploading(false); }
      };
      rec.start(); recRef.current = rec; setRecording(true);
    } catch { alert('Microphone permission needed.'); }
  };

  const renderContent = (body) => String(body || '').split(MENTION).map((p, i) => {
    if (/^@(?:AO|APP)-\d+$/.test(p)) {
      const no = p.slice(1);
      const o = orderByNo[no];
      return <span key={i} className="mention" onClick={() => o && nav(`/order/${o.id}`)}>{p}</span>;
    }
    return p;
  });

  const renderMessage = (m) => {
    if (m.deleted) return <span style={{ fontStyle: 'italic', opacity: 0.7 }}>Message deleted by admin</span>;
    if (m.type === 'voice') return <audio src={m.content} controls style={{ width: 220, maxWidth: '100%', height: 38 }} />;
    if (m.type === 'image') return <img src={m.content} alt="" onClick={() => setLightbox({ url: m.content, video: false })} style={{ maxWidth: 220, borderRadius: 12, cursor: 'pointer', display: 'block' }} />;
    if (m.type === 'video') return <video src={m.content} controls playsInline style={{ maxWidth: 220, borderRadius: 12, display: 'block' }} />;
    return <span>{renderContent(m.content)}</span>;
  };

  const deleteMsg = async (m) => {
    if (!isAdmin || m.deleted) return;
    if (!window.confirm('Delete this message for everyone? It will show as “Message deleted by admin”.')) return;
    try { await deleteMessageAsAdmin(m.id); } catch { alert('Could not delete message.'); }
  };

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

      <div className="screen" style={{ paddingTop: 12, paddingBottom: 156 }}>
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
                {renderMessage(m)}
                <div className="meta" style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                  <span>{formatTime(m.timestamp)}</span>
                  {isAdmin && !m.deleted && (
                    <button onClick={() => deleteMsg(m)} title="Delete message"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 11, padding: 0, opacity: 0.8 }}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {uploading && <div className="faint" style={{ textAlign: 'center', fontSize: 13 }}>Sending…</div>}
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

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <button className="lightbox-close" aria-label="Close">✕</button>
          <img src={lightbox.url} alt="full size" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {channelId && (
        <div className="input-bar above-nav">
          <button className="round-btn soft" onClick={() => setShowTagger(true)} title="Tag an order" style={{ fontWeight: 800 }}>@</button>
          <button className="round-btn soft" onClick={() => fileRef.current?.click()} title="Photo or video"><IcImage size={20} /></button>
          <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={onPickFile} />
          <input ref={inputRef} className="input" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message ${channel?.code || ''}…`} onKeyDown={(e) => e.key === 'Enter' && send()} />
          <button className={`round-btn ${recording ? 'primary' : 'soft'}`} onClick={toggleRec} title="Voice message" style={recording ? { color: '#fff' } : {}}>{recording ? '⏹' : <IcMic size={20} />}</button>
          <button className="round-btn primary" onClick={send}><IcSend size={18} /></button>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
