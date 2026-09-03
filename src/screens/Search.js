import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOrders, useChannels, decorateOrders } from '../hooks/useCollections';
import { PURITY_OPTIONS } from '../utils/format';
import OrderCard from '../components/OrderCard';
import { IcBack, IcSearch } from '../components/Icons';

export default function Search() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const { data: rawOrders } = useOrders(profile);
  const { data: channels } = useChannels(profile);
  const orders = useMemo(() => decorateOrders(rawOrders), [rawOrders]);
  const channelCode = (id) => channels.find((c) => c.id === id)?.code || '';

  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const [purity, setPurity] = useState('');
  const [sample, setSample] = useState('');
  const [channel, setChannel] = useState('');

  const results = orders.filter((o) => {
    if (q) {
      const hay = `${o.appOrderNo} ${o.storeOrderNo} ${o.itemName} ${channelCode(o.channelId)}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    if (stage && o.stage !== stage) return false;
    if (purity && o.purity !== purity) return false;
    if (sample && String(!!o.sampleTaken) !== (sample === 'yes' ? 'true' : 'false')) return false;
    if (channel && o.channelId !== channel) return false;
    return true;
  });

  const anyFilter = q || stage || purity || sample || channel;

  // Render a page at a time; search still matches across ALL loaded orders.
  const [shown, setShown] = useState(20);
  useEffect(() => { setShown(20); }, [q, stage, purity, sample, channel]);

  return (
    <div className="app-shell">
      <div className="topbar">
        <button className="icon-btn" onClick={() => nav(-1)}><IcBack size={18} /></button>
        <h1 style={{ fontSize: 18 }}>Search</h1>
      </div>
      <div className="screen screen-pad-bottom">
        <div className="card card-tight" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <IcSearch size={18} color="var(--ink-faint)" />
          <input className="input" autoComplete="off" style={{ border: 'none', padding: 4 }} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order no, item, store ref, vendor…" />
        </div>

        <div className="section-title">Filters</div>
        <div className="stack" style={{ gap: 10 }}>
          <ChipGroup label="Stage" value={stage} onChange={setStage} options={[['new', 'New'], ['inprogress', 'In progress'], ['rework', 'Rework'], ['ready', 'Ready'], ['handedover', 'Handed over']]} />
          <ChipGroup label="Purity" value={purity} onChange={setPurity} options={PURITY_OPTIONS.map((p) => [p, p])} />
          <ChipGroup label="Sample taken" value={sample} onChange={setSample} options={[['yes', 'Yes'], ['no', 'No']]} />
          <ChipGroup label="Channel" value={channel} onChange={setChannel} options={channels.map((c) => [c.id, c.code])} />
        </div>

        <div className="section-title">{anyFilter ? `${results.length} result${results.length === 1 ? '' : 's'}` : 'All orders'}</div>
        {results.slice(0, shown).map((o) => <OrderCard key={o.id} order={o} channelCode={channelCode(o.channelId)} />)}
        {results.length > shown && (
          <button className="btn btn-ghost btn-block" style={{ marginTop: 4 }} onClick={() => setShown((n) => n + 20)}>
            Load more ({results.length - shown} more)
          </button>
        )}
        {results.length === 0 && <div className="empty"><div className="big">🔍</div>No matches</div>}
      </div>
    </div>
  );
}

function ChipGroup({ label, value, onChange, options }) {
  return (
    <div>
      <div className="faint" style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div className="pill-row">
        {options.map(([v, l]) => (
          <button key={v} className={`chip ${value === v ? 'chip-active' : ''}`} onClick={() => onChange(value === v ? '' : v)}>{l}</button>
        ))}
      </div>
    </div>
  );
}
