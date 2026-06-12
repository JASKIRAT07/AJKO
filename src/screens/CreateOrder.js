import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useUsers, useChannels } from '../hooks/useCollections';
import {
  PURITY_OPTIONS, LOOK_OPTIONS, nextAppOrderNo, whatsappMessage, countdownLabel,
} from '../utils/format';
import {
  createOrder, updateOrder, fetchAllOrderNumbers, addUserToChannel, notify, sendMessage,
} from '../utils/actions';
import { uploadFile, uploadBlob } from '../utils/upload';
import { IcBack, IcImage } from '../components/Icons';
import VoiceRecorder from '../components/VoiceRecorder';

const blank = {
  storeOrderNo: '', itemName: '', weight: '', purity: '', look: '',
  size: '', width: '', pieces: '', designDetails: '', extraDetails: '',
  sampleTaken: false, dueDate: '', channelId: '',
};

export default function CreateOrder() {
  const { id } = useParams();
  const editing = Boolean(id);
  const { profile } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { data: users } = useUsers();
  const { data: channels } = useChannels(profile);

  const [form, setForm] = useState({ ...blank, channelId: params.get('channel') || '' });
  const [appOrderNo, setAppOrderNo] = useState('#APP-…');
  const [customPurity, setCustomPurity] = useState(false);
  const [customLook, setCustomLook] = useState(false);
  const [images, setImages] = useState([]);
  const [voiceBlob, setVoiceBlob] = useState(null);
  const [voiceUrl, setVoiceUrl] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (editing) {
      getDoc(doc(db, 'orders', id)).then((s) => {
        if (s.exists()) {
          const d = s.data();
          setForm({ ...blank, ...d, dueDate: d.dueDate?.toDate ? d.dueDate.toDate().toISOString().slice(0, 10) : (d.dueDate || '') });
          setAppOrderNo(d.appOrderNo);
          setImages(d.images || []);
          setVoiceUrl(d.voiceNote || null);
          if (d.purity && !PURITY_OPTIONS.includes(d.purity)) setCustomPurity(true);
          if (d.look && !LOOK_OPTIONS.includes(d.look)) setCustomLook(true);
        }
      });
    } else {
      fetchAllOrderNumbers().then((nums) => setAppOrderNo(nextAppOrderNo(nums)));
    }
  }, [editing, id]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const preview = useMemo(() => whatsappMessage({ ...form, appOrderNo, images }), [form, appOrderNo, images]);
  const valid = form.storeOrderNo && form.itemName && form.weight && form.purity && form.look && form.dueDate && form.channelId;

  const onPickFiles = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, 4 - images.length);
    for (const f of files) {
      const localUrl = URL.createObjectURL(f);
      setImages((prev) => [...prev, { url: localUrl, type: f.type?.startsWith('video') ? 'video' : 'image', _file: f }]);
    }
  };
  const removeImage = (i) => setImages((prev) => prev.filter((_, idx) => idx !== i));

  const save = async (asDraft) => {
    if (!asDraft && !valid) return;
    setBusy(true);
    try {
      // Media + voice uploads are best-effort: a Storage hiccup must not block
      // the order from being created.
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
      let voiceNote = voiceUrl;
      if (voiceBlob) {
        try { voiceNote = await uploadBlob(voiceBlob); }
        catch (e) { console.error('Voice upload failed', e); uploadWarnings.push('the voice note'); }
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
        voiceNote: voiceNote || null,
        isDraft: !!asDraft,
      };

      if (editing) {
        await updateOrder(id, payload);
        if (uploadWarnings.length) alert(`Order saved, but ${uploadWarnings.join(' and ')} could not be uploaded (check Firebase Storage).`);
        nav(`/order/${id}`);
        return;
      }

      // Creating the order is the only critical write.
      const newId = await createOrder({
        ...payload,
        createdBy: profile.id,
        createdByCode: profile.code || profile.name,
        createdByName: profile.name,
      });

      // Everything after is best-effort — the order already exists, so a failure
      // here should never look like "order creation failed".
      try {
        await addUserToChannel(channelId, profile.id);
        if (!asDraft && channelId) {
          await sendMessage({ channelId, orderId: newId, sender: profile, content: `New order ${appOrderNo} — ${form.itemName}`, type: 'order' });
          const vendorMembers = users.filter((u) => u.role === 'vendor' && u.channelId === channelId);
          await Promise.all(vendorMembers.map((v) => notify({ userId: v.id, type: 'new', title: 'New order assigned', body: `${appOrderNo} · ${form.itemName}`, orderId: newId })));
        }
      } catch (e) {
        console.error('Post-create steps failed (order was still created)', e);
      }

      if (uploadWarnings.length) alert(`Order created, but ${uploadWarnings.join(' and ')} could not be uploaded (check Firebase Storage).`);
      nav(channelId && !asDraft ? `/channel/${channelId}` : '/');
    } catch (e) {
      console.error('Order save failed', e);
      alert(`Could not save order: ${e.code || e.message || 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const noChannels = channels.length === 0;

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
            <div style={{ fontWeight: 700 }}>No channels yet</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Create a vendor channel first, then add vendors to it.</div>
            <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={() => nav('/members')}>Go to Members</button>
          </div>
        )}

        <div className="row-2">
          <div className="field"><label>Store order no. <span className="req">*</span></label>
            <input className="input" value={form.storeOrderNo} onChange={(e) => set('storeOrderNo', e.target.value)} placeholder="e.g. 4821" /></div>
          <div className="field"><label>App order no.</label>
            <input className="input" value={appOrderNo} disabled /></div>
        </div>

        <div className="field"><label>Item name <span className="req">*</span></label>
          <input className="input" value={form.itemName} onChange={(e) => set('itemName', e.target.value)} placeholder="Tikka, Passa, Set…" /></div>

        <div className="row-2">
          <div className="field"><label>Weight (gms) <span className="req">*</span></label>
            <input className="input" type="number" value={form.weight} onChange={(e) => set('weight', e.target.value)} placeholder="0" /></div>
          <div className="field"><label>Pieces (pcs)</label>
            <input className="input" type="number" value={form.pieces} onChange={(e) => set('pieces', e.target.value)} placeholder="—" /></div>
        </div>

        <DropdownField label="Purity" req options={PURITY_OPTIONS} value={form.purity} custom={customPurity}
          onSelect={(v) => { if (v === '__custom') { setCustomPurity(true); set('purity', ''); } else { setCustomPurity(false); set('purity', v); } }}
          onCustom={(v) => set('purity', v)} placeholder="e.g. 23kt" />

        <DropdownField label="Look / finish" req options={LOOK_OPTIONS} value={form.look} custom={customLook}
          onSelect={(v) => { if (v === '__custom') { setCustomLook(true); set('look', ''); } else { setCustomLook(false); set('look', v); } }}
          onCustom={(v) => set('look', v)} placeholder="Custom finish" />

        <div className="row-2">
          <div className="field"><label>Size</label><input className="input" value={form.size} onChange={(e) => set('size', e.target.value)} placeholder="—" /></div>
          <div className="field"><label>Width</label><input className="input" value={form.width} onChange={(e) => set('width', e.target.value)} placeholder="—" /></div>
        </div>

        <div className="field"><label>Due date <span className="req">*</span></label>
          <input className="input" type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
          {form.dueDate && <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>{countdownLabel(new Date(form.dueDate))}</div>}
        </div>

        <div className="field"><label>Assign to channel <span className="req">*</span></label>
          <select className="select" value={form.channelId} onChange={(e) => set('channelId', e.target.value)}>
            <option value="">Select channel…</option>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.code}{c.name && c.name !== c.code ? ` · ${c.name}` : ''}</option>)}
          </select>
        </div>

        <div className="field"><label>Design details</label>
          <textarea className="textarea" value={form.designDetails} onChange={(e) => set('designDetails', e.target.value)} placeholder="Design notes…" /></div>
        <div className="field"><label>Extra details</label>
          <textarea className="textarea" value={form.extraDetails} onChange={(e) => set('extraDetails', e.target.value)} placeholder="Anything else…" /></div>

        <div className="field row-between" style={{ alignItems: 'center' }}>
          <label style={{ margin: 0 }}>Sample taken</label>
          <div className="toggle">
            <button type="button" className={!form.sampleTaken ? 'on' : ''} onClick={() => set('sampleTaken', false)}>No</button>
            <button type="button" className={form.sampleTaken ? 'on' : ''} onClick={() => set('sampleTaken', true)}>Yes</button>
          </div>
        </div>

        <div className="section-title">Photos & videos ({images.length}/4)</div>
        <div className="specs-grid">
          {images.map((im, i) => (
            <div key={i} style={{ position: 'relative', height: 110, borderRadius: 14, overflow: 'hidden', background: '#f0ece7' }}>
              {im.type === 'video'
                ? <video src={im.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <img src={im.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              <button type="button" onClick={() => removeImage(i)} style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,.55)', color: '#fff', borderRadius: 8, width: 26, height: 26 }}>✕</button>
            </div>
          ))}
          {images.length < 4 && (
            <label className="card" style={{ height: 110, display: 'grid', placeItems: 'center', cursor: 'pointer', border: '1.5px dashed var(--line)', boxShadow: 'none' }}>
              <div style={{ textAlign: 'center', color: 'var(--ink-faint)' }}><IcImage size={26} /><div style={{ fontSize: 12, marginTop: 4 }}>Add media</div></div>
              <input type="file" accept="image/*,video/*" multiple hidden onChange={onPickFiles} />
            </label>
          )}
        </div>

        <div className="section-title">Voice note</div>
        <VoiceRecorder value={voiceBlob || voiceUrl} onRecorded={setVoiceBlob} onClear={() => { setVoiceBlob(null); setVoiceUrl(null); }} />

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
      {custom && <input className="input" style={{ marginTop: 8 }} value={value} onChange={(e) => onCustom(e.target.value)} placeholder={placeholder} />}
    </div>
  );
}
