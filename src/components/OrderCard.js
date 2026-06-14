import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  stageInfo, countdownLabel, formatDateTime, allowedTransitions,
} from '../utils/format';
import { setStage } from '../utils/actions';
import { shareOrder } from '../utils/share';
import { StageBadge, UrgencyBadge } from './Badges';
import StagePipeline from './StagePipeline';
import MediaStrip from './MediaStrip';
import { IcWhatsApp } from './Icons';

export default function OrderCard({ order, channelCode, createdByName, inFeed }) {
  const { profile, isVendor, isAdmin, isTeam } = useAuth();
  const nav = useNavigate();
  const urg = order.urgency;
  const glow = urg?.overdue ? 'glow-red' : stageInfo(order.stage).glow;
  const ownChannel = order.channelId === profile?.channelId;
  const canAct = isAdmin || isTeam || (isVendor && ownChannel);
  const canShare = isVendor || isAdmin; // team members cannot share
  const transitions = canAct ? allowedTransitions(order.stage, profile?.role) : [];
  const primary = transitions.find((t) => t.kind === 'primary');
  const danger = transitions.find((t) => t.kind === 'danger');

  const go = () => nav(`/order/${order.id}`);

  return (
    <div className={`card ${glow}`} style={{ marginBottom: 12 }}>
      <div className="row-between" onClick={go} style={{ cursor: 'pointer' }}>
        <div>
          <div className="order-no">{order.appOrderNo}</div>
          <div className="faint" style={{ fontSize: 12, marginTop: 1 }}>Store #{order.storeOrderNo}</div>
        </div>
        <UrgencyBadge urgency={urg} />
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }} onClick={go}>
        {channelCode && <span className="chip spec-chip" style={{ fontWeight: 700 }}>💬 {channelCode}</span>}
        <span style={{ fontWeight: 700, fontSize: 16 }}>{order.itemName}</span>
      </div>

      {order.images?.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <MediaStrip media={order.images} />
        </div>
      )}

      <div className="pill-row" style={{ marginTop: 10 }} onClick={go}>
        {order.weight && <span className="chip spec-chip">⚖️ {order.weight} gms</span>}
        {order.purity && <span className="chip spec-chip">✨ {order.purity}</span>}
        {order.look && <span className="chip spec-chip">🎨 {order.look}</span>}
        {order.dueDate && <span className="chip spec-chip">📅 {countdownLabel(order.dueDate)}</span>}
      </div>

      <div style={{ margin: '12px 0 6px' }} onClick={go}><StagePipeline stage={order.stage} compact /></div>
      <div className="row-between"><StageBadge stage={order.stage} /></div>

      {createdByName && (
        <div className="faint" style={{ fontSize: 11, marginTop: 8 }}>
          Created by {createdByName} · {formatDateTime(order.createdAt)}
        </div>
      )}

      {(primary || danger || canShare) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {danger && (
            <button className="btn btn-danger" style={{ flex: '0 0 auto' }}
              onClick={(e) => { e.stopPropagation(); setStage(order, danger.to, profile); }}>{danger.label}</button>
          )}
          {primary && (
            <button className="btn btn-primary" style={{ flex: 1, minWidth: 120 }}
              onClick={(e) => { e.stopPropagation(); setStage(order, primary.to, profile); }}>{primary.label}</button>
          )}
          {canShare && (
            <button className="btn btn-wa" style={{ flex: primary ? '0 0 auto' : 1 }}
              onClick={(e) => { e.stopPropagation(); shareOrder(order); }}>
              <IcWhatsApp size={18} /> {primary ? '' : 'Share'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
