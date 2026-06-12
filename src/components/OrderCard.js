import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { stageInfo, countdownLabel, whatsappUrl, formatDateTime, STAGE_ORDER } from '../utils/format';
import { moveStage } from '../utils/actions';
import { StageBadge, UrgencyBadge } from './Badges';
import StagePipeline from './StagePipeline';
import MediaStrip from './MediaStrip';
import { IcWhatsApp } from './Icons';

function stageActionLabel(stage) {
  if (stage === 'new') return 'Start work';
  if (stage === 'inprogress') return 'Mark ready';
  return null;
}

export default function OrderCard({ order, channelCode, createdByName, inFeed }) {
  const { profile, isVendor, isAdmin } = useAuth();
  const nav = useNavigate();
  const urg = order.urgency;
  const glow = urg?.overdue ? 'glow-red' : stageInfo(order.stage).glow;
  const canMove = isVendor && order.channelId === profile?.channelId;
  const canShare = isVendor || isAdmin; // not team members
  const idx = STAGE_ORDER.indexOf(order.stage);

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

      {(canMove || canShare) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {canMove && idx > 0 && (
            <button className="btn btn-ghost" style={{ flex: '0 0 auto', padding: '10px 12px' }}
              onClick={(e) => { e.stopPropagation(); moveStage(order, -1, profile); }}>↩︎ Move back</button>
          )}
          {canMove && stageActionLabel(order.stage) && (
            <button className="btn btn-primary" style={{ flex: 1 }}
              onClick={(e) => { e.stopPropagation(); moveStage(order, 1, profile); }}>
              {stageActionLabel(order.stage)}
            </button>
          )}
          {canShare && (
            <a className="btn btn-wa" style={{ flex: canMove ? '0 0 auto' : 1 }}
              href={whatsappUrl(order)} target="_blank" rel="noreferrer"
              onClick={(e) => e.stopPropagation()}>
              <IcWhatsApp size={18} /> {canMove ? '' : 'Share'}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
