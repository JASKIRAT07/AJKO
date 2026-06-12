import { STAGE_ORDER, STAGES } from '../utils/format';

export default function StagePipeline({ stage, compact }) {
  const currentIdx = STAGE_ORDER.indexOf(stage);
  return (
    <div className="pipeline">
      {STAGE_ORDER.map((s, i) => {
        const active = i <= currentIdx;
        return (
          <div className="pipe-step" key={s} style={{ flex: i === STAGE_ORDER.length - 1 ? '0 0 auto' : 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span className={`pipe-dot ${i === currentIdx ? 'active' : active ? 'active' : ''} s-${s}`} />
              {!compact && <span className="pipe-label" style={i === currentIdx ? { color: STAGES[s].color, fontWeight: 800 } : {}}>{STAGES[s].label}</span>}
            </div>
            {i < STAGE_ORDER.length - 1 && <span className={`pipe-line ${i < currentIdx ? 'done' : ''}`} />}
          </div>
        );
      })}
    </div>
  );
}
