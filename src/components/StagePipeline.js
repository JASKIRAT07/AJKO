import { STAGE_ORDER, STAGES } from '../utils/format';

export default function StagePipeline({ stage, compact }) {
  const isRework = stage === 'rework';
  const isEdited = stage === 'newedited';
  const effective = isRework ? 'inprogress' : (isEdited ? 'new' : stage);
  const currentIdx = STAGE_ORDER.indexOf(effective);
  const last = STAGE_ORDER.length - 1;

  return (
    <div className="pipeline">
      {STAGE_ORDER.map((s, i) => {
        const reached = i <= currentIdx;
        const isCurrent = i === currentIdx;
        const color = isRework && isCurrent ? STAGES.rework.color
          : (isEdited && isCurrent ? STAGES.newedited.color : STAGES[s].color);
        const label = isRework && isCurrent ? STAGES.rework.label
          : (isEdited && isCurrent ? STAGES.newedited.label : STAGES[s].label);
        return (
          <div className="pipe-step" key={s} style={{ flex: i === last ? '0 0 auto' : 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span
                className={`pipe-dot ${isCurrent ? 'live' : ''}`}
                style={{ background: reached ? color : '#e5e1dc', '--c': `${color}66` }}
              />
              {!compact && (
                <span className="pipe-label" style={isCurrent ? { color, fontWeight: 800 } : {}}>{label}</span>
              )}
            </div>
            {i < last && (
              <span className="pipe-line" style={{ background: i < currentIdx ? STAGES.ready.color : '#e5e1dc' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
