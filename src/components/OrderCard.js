import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  stageInfo, countdownLabel, whatsappUrl, formatDateTime, allowedTransitions,
} from '../utils/format';
import { setStage } from '../utils/actions';
import { StageBadge, UrgencyBadge } from './Badges';
import StagePipeline from './StagePipeline';
import MediaStrip from './MediaStrip';
import { IcWhatsApp } from './Icons';

export default function OrderCard({ order, channelCode, createdByName, inFeed }) {
  const { profile, isVendor, isAdmin } = useAuth();
  const nav = useNavigate();
  const urg = order.urgency;
  const glow = urg?.overdue ? 'glow-red' : stageInfo(order.stage).glow;
  const ownChannel = order.channelId === profile?.channelId;
  const canMove = isVendor && ownChannel;
  const canShare = isVendor || isAdmin; // not team members
  const transitions = canMove ? allowedTransitions(order.stage, 'vendor') : [];
  const primary = transitions.find((t) => t.kind === 'primary');
  const secondary = transitions.filter((t) => t.kind !== 'primary');

  const go = () => nav(`/order/${order.id}`);

  return (
    <div className={`card ${glow}`} style={{ marginBottom: 12 }}>
      <div className="row-between" onClick={go} style={{ cursor: 'pointer' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{order.itemName}</div>
          <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
            {order.appOrderNo} · Store {order.storeOrderNo}
          </div>
        </div>
        <UrgencyBadge urgency={urg} />
      </div>

      {order.images?.length > 0 && (
        <div onClick={go} style={{ cursor: 'pointer', marginTop: 10 }}>
          <MediaStrip media={order.images} />
        </div>
      )}

      <div className="pill-row" style={{ marginTop: 10 }}>
        {order.weight && <span className="chip spec-chip">⚖️ {order.weight} gms</span>}
        {order.purity && <span className="chip spec-chip">✨ {order.purity}</span>}
        {order.look && <span className="chip spec-chip">🎨 {order.look}</span>}
        {order.dueDate && <span className="chip spec-chip">📅 {countdownLabel(order.dueDate)}</span>}
      </div>

      <div style={{ margin: '12px 0 6px' }}><StagePipeline stage={order.stage} compact /></div>
      <div className="row-between">
        <StageBadge stage={order.stage} />
        {channelCode && <span className="faint" style={{ fontSize: 12 }}>{channelCode}</span>}
      </div>

      {createdByName && (
        <div className="faint" style={{ fontSize: 11, marginTop: 8 }}>
          Created by {createdByName} · {formatDateTime(order.createdAt)}
        </div>
      )}

      {(transitions.length > 0 || canShare) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {secondary.map((t) => (
            <button key={t.to} className="btn btn-ghost" style={{ flex: '0 0 auto', padding: '10px 12px' }}
              onClick={(e) => { e.stopPropagation(); setStage(order, t.to, profile); }}>{t.label}</button>
          ))}
          {primary && (
            <button className="btn btn-primary" style={{ flex: 1, minWidth: 120 }}
              onClick={(e) => { e.stopPropagation(); setStage(order, primary.to, profile); }}>{primary.label}</button>
          )}
          {canShare && (
            <a className="btn btn-wa" style={{ flex: primary ? '0 0 auto' : 1 }}
              href={whatsappUrl(order)} target="_blank" rel="noreferrer"
              onClick={(e) => e.stopPropagation()}>
              <IcWhatsApp size={18} /> {primary ? '' : 'Share'}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
