import { useEffect, useMemo, useRef, useState } from 'react';
import HammerMascot from './HammerMascot';
import { isDone, todayLong } from '../utils/format';

// Time-aware greeting line with the person's name.
function greetLine(name) {
  const n = name || 'there';
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return `Good morning, ${n}!`;
  if (h >= 12 && h < 17) return `Good afternoon, ${n}!`;
  if (h >= 17 && h < 22) return `Good evening, ${n}!`;
  return `Working late, ${n}?`; // 22–5
}

// Dashboard mascot + greeting. `orders` must be decorated (has isOverdue).
// Mood is a priority ladder (first match wins) over the user's order scope.
export default function GreetingMascot({ profile, orders = [] }) {
  const name = profile?.name || profile?.code || 'there';

  // Momentary "celebrating" when an order was JUST marked Ready / Handed over.
  const completionAt = useMemo(() => {
    let max = 0;
    orders.forEach((o) => (o.stageHistory || []).forEach((h) => {
      if ((h.stage === 'ready' || h.stage === 'handedover') && h.at > max) max = h.at;
    }));
    return max;
  }, [orders]);

  const [celebrate, setCelebrate] = useState(false);
  const prev = useRef(null);
  useEffect(() => {
    if (prev.current === null) { prev.current = completionAt; return undefined; } // ignore initial load
    if (completionAt > prev.current) {
      prev.current = completionAt;
      if (Date.now() - completionAt < 5000) {
        setCelebrate(true);
        const t = setTimeout(() => setCelebrate(false), 3000); // play ~3s, then fall through
        return () => clearTimeout(t);
      }
    }
    return undefined;
  }, [completionAt]);

  const mood = useMemo(() => {
    const overdue = orders.some((o) => o.isOverdue);
    const pending = orders.filter((o) => !isDone(o.stage));
    const inProgress = orders.some((o) => o.stage === 'inprogress');
    const h = new Date().getHours();
    const late = h >= 22 || h < 5;

    if (celebrate) return 'celebrating';              // just completed something
    if (overdue) return 'encouraging';                 // overdue — positive nudge
    if (orders.length > 0 && pending.length === 0) return 'proud'; // all clear
    if (inProgress) return 'working';                  // work underway
    if (late) return 'sleepy';                         // late night, nothing else
    return 'greeting';                                 // default
  }, [orders, celebrate]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <HammerMascot mood={mood} size={64} />
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>{greetLine(name)}</div>
        <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>{todayLong()}</div>
      </div>
    </div>
  );
}
