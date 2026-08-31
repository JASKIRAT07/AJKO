import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useChannels } from '../hooks/useCollections';
import {
  PURITY_OPTIONS, LOOK_OPTIONS, whatsappMessage, countdownLabel,
} from '../utils/format';
import {
  createOrder, updateOrder, getNextOrderNoPreview, addUserToChannel,
} from '../utils/actions';
import { uploadFile, uploadBlob, supportedAudioMime } from '../utils/upload';
import { uploadVideoToStream } from '../utils/stream';
import { IcBack, IcImage, IcMic } from '../components/Icons';

const blank = {
  storeOrderNo: '', itemName: '', weight: '', purity: '', look: '',
  size: '', width: '', pieces: '', designDetails: '', extraDetails: '',
  sampleTaken: false, dueDate: '', channelId: '',
};

export default function CreateOrder() {
  const { id } = useParams();
  const editing = Boolean(id);
  const { profile, isAdmin } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { data: channels } = useChannels(profile);

  const [form, setForm] = useState({ ...blank, channelId: params.get('channel') || '' });
  const [appOrderNo, setAppOrderNo] = useState('AO-…');
  const [customPurity, setCustomPurity] = useState(false);
  const [customLook, setCustomLook] = useState(false);
  const [images, setImages] = useState([]);
  const [videos, setVideos] = useState([]); // {uid} (existing) or {url,_file} (new, Cloudflare Stream)
  // Single voice note per order: existing {url,name} OR a new local {url(blob),_blob}.
  const [voiceNote, setVoiceNote] = useState(null);
  const [recording, setRecording] = useState(false);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const [busy, setBusy] = useState(false);
  const [original, setOriginal] = useState(null); // pristine doc, for edit diffing
  // Edit forms must wait for the order's values before rendering fields, or the
  // first open (before the doc is cached) paints a blank form. Create = ready now.
  const [loaded, setLoaded] = useState(!editing);

  useEffect(() => {
    if (editing) {
      getDoc(doc(db, 'orders', id)).then((s) => {
        if (s.exists()) {
          const d = s.data();
          setOriginal({ id: s.id, ...d });
          setForm({ ...blank, ...d, dueDate: d.dueDate?.toDate ? d.dueDate.toDate().toISOString().slice(0, 10) : (d.dueDate || '') });
          setAppOrderNo(d.appOrderNo);
          setImages(d.images || []);
          setVideos(d.videos || []);
          setVoiceNote(d.voiceNote || null);
          if (d.purity && !PURITY_OPTIONS.includes(d.purity)) setCustomPurity(true);
          if (d.look && !LOOK_OPTIONS.includes(d.look)) setCustomLook(true);
        }
      }).catch((e) => console.error('Edit load failed', e)).finally(() => setLoaded(true));
    } else {
      getNextOrderNoPreview().then(setAppOrderNo).catch(() => setAppOrderNo('AO-001'));
    }
  }, [editing, id]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const preview = useMemo(() => whatsappMessage({ ...form, appOrderNo, images }), [form, appOrderNo, images]);
  const valid = form.storeOrderNo && form.itemName && form.weight && form.purity && form.look && form.dueDate && form.channelId;

  const onPickFiles = async (e) => {
    // 4-item cap is shared across images + videos.
    const files = Array.from(e.target.files || []).slice(0, Math.max(0, 4 - images.length - videos.length));
    for (const f of files) {
      const localUrl = URL.createObjectURL(f);
      if (f.type?.startsWith('video')) {
        // Videos go to Cloudflare Stream on save (not Firebase Storage).
        setVideos((prev) => [...prev, { url: localUrl, _file: f }]);
      } else {
        setImages((prev) => [...prev, { url: localUrl, type: 'image', _file: f }]);
      }
    }
    e.target.value = '';
  };
  const removeVideo = (i) => setVideos((prev) => prev.filter((_, idx) => idx !== i));
  const removeImage = (i) => setImages((prev) => prev.filter((_, idx) => idx !== i));

  // Voice note — reuse the proven chat recorder. Records in-app; the blob is
  // kept locally (preview) and only uploaded to Firebase Storage on save.
  const toggleRec = async () => {
    if (recording) { recRef.current?.stop(); setRecording(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = supportedAudioMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => chunksRef.current.push(ev.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || mime || 'audio/mp4' });
        stream.getTracks().forEach((t) => t.stop());
        setVoiceNote({ url: URL.createObjectURL(blob), _blob: blob });
      };
      rec.start(); recRef.current = rec; setRecording(true);
    } catch { alert('Microphone permission needed.'); }
  };
  const removeVoice = () => { if (recording) { recRef.current?.stop(); setRecording(false); } setVoiceNote(null); };

  const save = async (asDraft) => {
    if (!asDraft && !valid) return;
    setBusy(true);
    try {
      // Media uploads are best-effort: a Storage hiccup must not block the order.
      const uploaded = [];
      const uploadWarnings = [];
      for (const im of images) {
        try {
          if (im._file) uploaded.push(await uploadFile(im._file));
          else uploaded.push({ url: im.url, type: im.type || 'image' });
        } catch (e) {
          console.error('Image upload failed', e);
          uploadWarnings.push('an image');
        }
      }

      // Videos → Cloudflare Stream (keep existing {uid} entries, upload new files).
      const videosOut = [];
      for (const v of videos) {
        try {
          if (v.uid) videosOut.push({ uid: v.uid });
          else if (v._file) { const { uid } = await uploadVideoToStream(v._file); videosOut.push({ uid }); }
        } catch (e) {
          console.error('Video upload failed', e);
          uploadWarnings.push('a video');
        }
      }

      // Voice note → Firebase Storage (upload only on save; keep existing as-is).
      let voiceNoteOut = null;
      try {
        if (voiceNote && voiceNote._blob) {
          const url = await uploadBlob(voiceNote._blob, 'voice');
          voiceNoteOut = { url, name: 'Voice note' };
        } else if (voiceNote && voiceNote.url) {
          voiceNoteOut = { url: voiceNote.url, name: voiceNote.name || 'Voice note' };
        }
      } catch (e) {
        console.error('Voice note upload failed', e);
        uploadWarnings.push('a voice note');
        // Preserve an already-saved note if the (re)upload failed.
        voiceNoteOut = voiceNote && voiceNote.url && !voiceNote._blob
          ? { url: voiceNote.url, name: voiceNote.name || 'Voice note' } : null;
      }

      const channelId = form.channelId;

      const payload = {
        storeOrderNo: form.storeOrderNo,
        appOrderNo,
        itemName: form.itemName,
        weight: form.weight,
        purity: form.purity,
        look: form.look,
        size: form.size,
        width: form.width,
        pieces: form.pieces,
        designDetails: form.designDetails,
        extraDetails: form.extraDetails,
        sampleTaken: form.sampleTaken,
        dueDate: form.dueDate ? new Date(form.dueDate) : null,
        channelId,
        vendorId: null,
        images: uploaded,
        videos: videosOut,
        voiceNote: voiceNoteOut,
        isDraft: !!asDraft,
      };

      if (editing) {
        // Diff against the pristine doc: material changes log a trail, flip the
        // Edited badge, and pull the order back to "New (Edited)".
        await updateOrder(id, payload, { original, actor: profile });
        if (uploadWarnings.length) alert(`Order saved, but ${uploadWarnings.join(' and ')} could not be uploaded (check Firebase Storage).`);
        nav(`/order/${id}`);
        return;
      }

      // Creating the order is the only critical write.
      const { id: newId } = await createOrder({
        ...payload,
        createdBy: profile.id,
        createdByCode: profile.code || profile.name,
        createdByName: profile.name,
      });

      // Creator joins the channel so they can keep chatting in it. The new-order
      // notification to the channel's vendors is handled server-side by the
      // notifyOnOrder Cloud Function (scoped, leak-proof).
      try {
        await addUserToChannel(channelId, profile.id);
      } catch (e) {
        console.error('Post-create step failed (order was still created)', e);
      }

      if (uploadWarnings.length) alert(`Order created, but ${uploadWarnings.join(' and ')} could not be uploaded (check Firebase Storage).`);
      nav(channelId && !asDraft ? `/order/${newId}` : '/');
    } catch (e) {
      console.error('Order save failed', e);
      alert(`Could not save order: ${e.code || e.message || 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const noChannels = channels.length === 0;

  // Don't render the fields until the order's values are in — avoids the blank
  // form on the first Edit open (before the doc is cached).
  if (editing && !loaded) {
    return (
      <div className="app-shell">
        <div className="topbar">
          <button className="icon-btn" onClick={() => nav(-1)}><IcBack size={18} /></button>
          <h1>Edit order</h1>
        </div>
        <div className="full-center" style={{ minHeight: '60vh' }}><div className="spinner" /></div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <button className="icon-btn" onClick={() => nav(-1)}><IcBack size={18} /></button>
        <h1>{editing ? 'Edit order' : 'New order'}</h1>
        <button className="btn btn-ghost" style={{ padding: '8px 12px' }} disabled={busy} onClick={() => save(true)}>Save draft</button>
      </div>

      <div className="screen" style={{ paddingBottom: 110 }}>
        {noChannels && (
          <div className="card glow-orange" style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 700 }}>No channels available</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              {isAdmin
                ? 'Create a vendor channel first (Members → Channels), then add vendors to it.'
                : 'You haven’t been added to any channel yet. Ask your admin to add you to a channel.'}
            </div>
            {isAdmin && <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={() => nav('/members')}>Go to Members</button>}
          </div>
        )}

        <div className="row-2">
          <div className="field"><label>Store order no. <span className="req">*</span></label>
            <input className="input" autoComplete="off" value={form.storeOrderNo} onChange={(e) => set('storeOrderNo', e.target.value)} placeholder="e.g. 4821" /></div>
          <div className="field"><label>App order no.</label>
            <input className="input" autoComplete="off" value={appOrderNo} disabled /></div>
        </div>

        <div className="field"><label>Item name <span className="req">*</span></label>
          <input className="input" autoComplete="off" value={form.itemName} onChange={(e) => set('itemName', e.target.value)} placeholder="Tikka, Passa, Set…" /></div>

        <div className="row-2">
          <div className="field"><label>Weight (gms) <span className="req">*</span></label>
            <input className="input" autoComplete="off" type="number" value={form.weight} onChange={(e) => set('weight', e.target.value)} placeholder="0" /></div>
          <div className="field"><label>Pieces (pcs)</label>
            <input className="input" autoComplete="off" type="number" value={form.pieces} onChange={(e) => set('pieces', e.target.value)} placeholder="—" /></div>
        </div>

        <DropdownField label="Purity" req options={PURITY_OPTIONS} value={form.purity} custom={customPurity}
          onSelect={(v) => { if (v === '__custom') { setCustomPurity(true); set('purity', ''); } else { setCustomPurity(false); set('purity', v); } }}
          onCustom={(v) => set('purity', v)} placeholder="e.g. 23kt" />

        <DropdownField label="Look / finish" req options={LOOK_OPTIONS} value={form.look} custom={customLook}
          onSelect={(v) => { if (v === '__custom') { setCustomLook(true); set('look', ''); } else { setCustomLook(false); set('look', v); } }}
          onCustom={(v) => set('look', v)} placeholder="Custom finish" />

        <div className="row-2">
          <div className="field"><label>Size</label><input className="input" autoComplete="off" value={form.size} onChange={(e) => set('size', e.target.value)} placeholder="—" /></div>
          <div className="field"><label>Width</label><input className="input" autoComplete="off" value={form.width} onChange={(e) => set('width', e.target.value)} placeholder="—" /></div>
        </div>

        <div className="field"><label>Due date <span className="req">*</span></label>
          <input className="input" autoComplete="off" type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
          {form.dueDate && <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>{countdownLabel(new Date(form.dueDate))}</div>}
        </div>

        <div className="field"><label>Assign to channel <span className="req">*</span></label>
          <select className="select" value={form.channelId} onChange={(e) => set('channelId', e.target.value)}>
            <option value="">Select channel…</option>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.code}{c.name && c.name !== c.code ? ` · ${c.name}` : ''}</option>)}
          </select>
        </div>

        <div className="field"><label>Design details</label>
          <textarea className="textarea" autoComplete="off" value={form.designDetails} onChange={(e) => set('designDetails', e.target.value)} placeholder="Design notes…" /></div>
        <div className="field"><label>Extra details</label>
          <textarea className="textarea" autoComplete="off" value={form.extraDetails} onChange={(e) => set('extraDetails', e.target.value)} placeholder="Anything else…" /></div>

        <div className="field row-between" style={{ alignItems: 'center' }}>
          <label style={{ margin: 0 }}>Sample taken</label>
          <div className="toggle">
            <button type="button" className={!form.sampleTaken ? 'on' : ''} onClick={() => set('sampleTaken', false)}>No</button>
            <button type="button" className={form.sampleTaken ? 'on' : ''} onClick={() => set('sampleTaken', true)}>Yes</button>
          </div>
        </div>

        <div className="section-title">Photos & videos ({images.length + videos.length}/4)</div>
        <div className="specs-grid">
          {images.map((im, i) => (
            <div key={`img-${i}`} style={{ position: 'relative', height: 110, borderRadius: 14, overflow: 'hidden', background: '#f0ece7' }}>
              <img src={im.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button type="button" onClick={() => removeImage(i)} style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,.55)', color: '#fff', borderRadius: 8, width: 26, height: 26 }}>✕</button>
            </div>
          ))}
          {videos.map((v, i) => (
            <div key={`vid-${i}`} style={{ position: 'relative', height: 110, borderRadius: 14, overflow: 'hidden', background: '#000' }}>
              {v.url
                ? <video src={v.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline />
                : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 13 }}>🎥 Video</div>}
              <span style={{ position: 'absolute', bottom: 6, left: 6, background: 'rgba(0,0,0,.55)', color: '#fff', borderRadius: 6, fontSize: 11, padding: '2px 6px' }}>🎥 Video</span>
              <button type="button" onClick={() => removeVideo(i)} style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,.55)', color: '#fff', borderRadius: 8, width: 26, height: 26 }}>✕</button>
            </div>
          ))}
          {(images.length + videos.length) < 4 && (
            <label className="card" style={{ height: 110, display: 'grid', placeItems: 'center', cursor: 'pointer', border: '1.5px dashed var(--line)', boxShadow: 'none' }}>
              <div style={{ textAlign: 'center', color: 'var(--ink-faint)' }}><IcImage size={26} /><div style={{ fontSize: 12, marginTop: 4 }}>Add media</div></div>
              <input type="file" accept="image/*,video/*" multiple hidden onChange={onPickFiles} />
            </label>
          )}
        </div>

        <div className="section-title">Voice note</div>
        {voiceNote ? (
          <div className="card card-tight" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <audio src={voiceNote.url} controls preload="none" style={{ flex: 1, height: 38, maxWidth: '100%' }} />
            <button type="button" className="btn btn-danger" style={{ flex: '0 0 auto', padding: '9px 12px' }} onClick={removeVoice}>Delete</button>
          </div>
        ) : (
          <button type="button" className={`btn ${recording ? 'btn-danger' : 'btn-ghost'} btn-block`} onClick={toggleRec} style={{ gap: 8 }}>
            <IcMic size={18} /> {recording ? 'Stop recording' : 'Record voice note 🎤'}
          </button>
        )}

        <div className="section-title">WhatsApp preview</div>
        <div className="card" style={{ background: '#e7ffe9', whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6 }}>{preview}</div>
      </div>

      <div className="input-bar" style={{ gap: 10, padding: '12px 16px max(12px, env(safe-area-inset-bottom))' }}>
        <button className="btn btn-ghost" style={{ flex: '0 0 auto' }} onClick={() => nav(-1)}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy || !valid} onClick={() => save(false)}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Create & send to channel'}
        </button>
      </div>
    </div>
  );
}

function DropdownField({ label, req, options, value, custom, onSelect, onCustom, placeholder }) {
  return (
    <div className="field">
      <label>{label} {req && <span className="req">*</span>}</label>
      <select className="select" value={custom ? '__custom' : value} onChange={(e) => onSelect(e.target.value)}>
        <option value="">Select…</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value="__custom">+ Add custom</option>
      </select>
      {custom && <input className="input" autoComplete="off" style={{ marginTop: 8 }} value={value} onChange={(e) => onCustom(e.target.value)} placeholder={placeholder} />}
    </div>
  );
}
