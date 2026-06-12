import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOrders, useUsers, decorateOrders } from '../hooks/useCollections';
import { PURITY_OPTIONS } from '../utils/format';
import OrderCard from '../components/OrderCard';
import { IcBack, IcSearch } from '../components/Icons';

export default function Search() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const { data: rawOrders } = useOrders(profile);
  const { data: users } = useUsers();
  const orders = useMemo(() => decorateOrders(rawOrders), [rawOrders]);
  const vendors = users.filter((u) => u.role === 'vendor');
  const vendorName = (id) => users.find((u) => u.id === id)?.code || '';

  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const [purity, setPurity] = useState('');
  const [sample, setSample] = useState('');
  const [vendor, setVendor] = useState('');

  const results = orders.filter((o) => {
    if (q) {
      const hay = `${o.appOrderNo} ${o.storeOrderNo} ${o.itemName} ${vendorName(o.vendorId)}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    if (stage && o.stage !== stage) return false;
    if (purity && o.purity !== purity) return false;
    if (sample && String(!!o.sampleTaken) !== (sample === 'yes' ? 'true' : 'false')) return false;
    if (vendor && o.vendorId !== vendor) return false;
    return true;
  });

  const anyFilter = q || stage || purity || sample || vendor;

  return (
    <div className="app-shell">
      <div className="topbar">
        <button className="icon-btn" onClick={() => nav(-1)}><IcBack size={18} /></button>
        <h1 style={{ fontSize: 18 }}>Search</h1>
      </div>
      <div className="screen screen-pad-bottom">
        <div className="card card-tight" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <IcSearch size={18} color="var(--ink-faint)" />
          <input className="input" style={{ border: 'none', padding: 4 }} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order no, item, store ref, vendor…" />
        </div>

        <div className="section-title">Filters</div>
        <div className="stack" style={{ gap: 10 }}>
          <ChipGroup label="Stage" value={stage} onChange={setStage} options={[['new', 'New'], ['inprogress', 'In progress'], ['ready', 'Ready']]} />
          <ChipGroup label="Purity" value={purity} onChange={setPurity} options={PURITY_OPTIONS.map((p) => [p, p])} />
          <ChipGroup label="Sample taken" value={sample} onChange={setSample} options={[['yes', 'Yes'], ['no', 'No']]} />
          <ChipGroup label="Vendor" value={vendor} onChange={setVendor} options={vendors.map((v) => [v.id, v.code])} />
        </div>

        <div className="section-title">{anyFilter ? `${results.length} result${results.length === 1 ? '' : 's'}` : 'All orders'}</div>
        {results.map((o) => <OrderCard key={o.id} order={o} vendorName={vendorName(o.vendorId)} />)}
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
