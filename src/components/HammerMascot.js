import { useId } from 'react';
import './HammerMascot.css';

// AJKO hammer mascot. Reuses the reference shapes/gradients/animations verbatim;
// only the mood prop swaps eyes / mouth / cheeks / accents / animation class.
//
// mood: 'greeting' | 'working' | 'celebrating' | 'proud' | 'encouraging' | 'sleepy'

const HAPPY = new Set(['greeting', 'celebrating', 'proud', 'encouraging']);

// Pupil offset (px, py) per mood. Sleepy uses closed-arc eyes instead.
const PUPIL = {
  working: [0, 1],
  celebrating: [0, -1.5],
  proud: [0, -1],
  greeting: [1, 0],
  encouraging: [0, 0],
};

export default function HammerMascot({ mood = 'greeting', size = 120, className = '', ...rest }) {
  // Unique gradient/filter IDs so multiple mascots on a page never collide.
  const uid = useId().replace(/:/g, '');
  const ids = {
    metal: `metal-${uid}`,
    metalSide: `metalSide-${uid}`,
    wood: `wood-${uid}`,
    cheek: `cheek-${uid}`,
    soft: `soft-${uid}`,
  };
  const url = (k) => `url(#${ids[k]})`;

  const sleepy = mood === 'sleepy';
  const happy = HAPPY.has(mood);
  const [px, py] = PUPIL[mood] || [0, 0];

  const Eye = ({ cx }) => (
    <>
      <ellipse cx={cx} cy={42} rx={7.5} ry={8.5} className="eye-white" />
      <circle cx={cx + px} cy={42 + py} r={4.2} className="pupil" />
      <circle cx={cx + px + 1.6} cy={42 + py - 2} r={1.5} className="catch" />
      <rect x={cx - 8} y={33.5} width={16} height={9} rx={4.5} className="lid" />
    </>
  );

  return (
    <svg
      viewBox="0 0 100 108"
      width={size}
      height={size * 1.08}
      className={`hammer-mascot ${className}`.trim()}
      role="img"
      aria-label={`AJKO mascot — ${mood}`}
      {...rest}
    >
      <defs>
        <linearGradient id={ids.metal} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eef0f4" /><stop offset=".45" stopColor="#c9ccd4" /><stop offset="1" stopColor="#9aa0ab" />
        </linearGradient>
        <linearGradient id={ids.metalSide} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b9bdc6" /><stop offset="1" stopColor="#8b909b" />
        </linearGradient>
        <linearGradient id={ids.wood} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#d8a05c" /><stop offset=".5" stopColor="#c88a4a" /><stop offset="1" stopColor="#a96f36" />
        </linearGradient>
        <radialGradient id={ids.cheek} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ff9a6b" stopOpacity=".55" /><stop offset="1" stopColor="#ff9a6b" stopOpacity="0" />
        </radialGradient>
        <filter id={ids.soft} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#5a3a1a" floodOpacity=".18" />
        </filter>
      </defs>

      {/* floating accents — OUTSIDE .char so they don't inherit its motion */}
      {mood === 'celebrating' && (
        <>
          <g className="spark"><path d="M12 16 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2Z" fill="#ffd23f" /></g>
          <g className="spark" style={{ animationDelay: '.15s' }}><path d="M86 14 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6Z" fill="#ff6b35" /></g>
        </>
      )}
      {mood === 'proud' && (
        <g className="spark"><path d="M85 20 l1.4 3.5 3.5 1.4 -3.5 1.4 -1.4 3.5 -1.4 -3.5 -3.5 -1.4 3.5 -1.4Z" fill="#ffd23f" /></g>
      )}
      {sleepy && (
        <g className="zz">
          <text x="78" y="24" fontFamily="Inter" fontWeight="800" fontSize="12" fill="#b7ada6">z</text>
          <text x="85" y="15" fontFamily="Inter" fontWeight="800" fontSize="9" fill="#ccc3bc">z</text>
        </g>
      )}

      <g className={`char breathe blink m-${mood}`}>
        {/* hammer body — same for every mood */}
        <ellipse cx="50" cy="103" rx="20" ry="4" fill="#000" opacity=".10" />
        <g filter={url('soft')}>
          {/* handle */}
          <rect x="44" y="54" width="12" height="46" rx="6" fill={url('wood')} />
          <rect x="45.5" y="56" width="3" height="42" rx="1.5" fill="#f0c48a" opacity=".5" />
          {/* head: top face + front face */}
          <path d="M20 22 h60 a8 8 0 0 1 8 8 v6 H12 v-6 a8 8 0 0 1 8 -8Z" fill={url('metalSide')} />
          <rect x="12" y="30" width="76" height="26" rx="8" fill={url('metal')} />
          {/* gloss highlight */}
          <rect x="18" y="33" width="52" height="6" rx="3" fill="#fff" opacity=".35" />
          {/* claw */}
          <path d="M12 40 q-9 3 -10 15 q7 -4 11 -7Z" fill={url('metalSide')} />
          {/* striking face */}
          <rect x="80" y="32" width="9" height="22" rx="3" fill={url('metalSide')} />
        </g>

        {/* blush cheeks — happy moods only */}
        {happy && (
          <>
            <circle cx="33" cy="49" r="6" fill={url('cheek')} />
            <circle cx="67" cy="49" r="6" fill={url('cheek')} />
          </>
        )}

        {/* eyes */}
        {sleepy ? (
          <>
            <path d="M36 42 Q42 38 48 42" stroke="#241c19" strokeWidth="2.6" fill="none" strokeLinecap="round" />
            <path d="M52 42 Q58 38 64 42" stroke="#241c19" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <Eye cx={41} />
            <Eye cx={59} />
          </>
        )}

        {/* mouth */}
        {mood === 'greeting' && <path d="M44 50 Q50 55 56 50" stroke="#241c19" strokeWidth="2.8" fill="none" strokeLinecap="round" />}
        {mood === 'working' && <path d="M46 51 L54 51" stroke="#241c19" strokeWidth="2.8" fill="none" strokeLinecap="round" />}
        {mood === 'celebrating' && (
          <>
            <path d="M42 49 Q50 59 58 49 Z" fill="#241c19" />
            <path d="M45 51 Q50 55 55 51" fill="#ff8a6b" />
          </>
        )}
        {mood === 'proud' && <path d="M43 50 Q50 57 57 50" stroke="#241c19" strokeWidth="3" fill="none" strokeLinecap="round" />}
        {mood === 'encouraging' && <path d="M44 50 Q50 54 56 50" stroke="#241c19" strokeWidth="2.8" fill="none" strokeLinecap="round" />}
        {sleepy && <ellipse cx="50" cy="50" rx="3.5" ry="4.5" fill="#241c19" opacity=".5" />}
      </g>
    </svg>
  );
}
