/** Decorative Achaemenid motifs shared by the lobby and the table. Pure SVG, no runtime. */

export function Rosette({ size = 48, className = "" }: { size?: number; className?: string }) {
  const petals = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg viewBox="-24 -24 48 48" width={size} height={size} className={className} aria-hidden>
      <circle r="23" fill="none" stroke="var(--gold)" strokeWidth="1.2" />
      <circle r="19" fill="none" stroke="var(--turquoise)" strokeWidth="0.6" opacity="0.8" />
      {petals.map((a) => (
        <ellipse key={a} rx="2.6" ry="8.5" cy="-9" transform={`rotate(${a})`} fill="var(--gold)" />
      ))}
      <circle r="4.5" fill="var(--lapis-dark)" stroke="var(--gold)" strokeWidth="1" />
      <circle r="1.6" fill="var(--turquoise)" />
    </svg>
  );
}

/** Horizontal lotus-and-palmette frieze. */
export function Frieze({ className = "" }: { className?: string }) {
  return (
    <div
      className={`h-6 w-full bg-repeat-x opacity-80 ${className}`}
      style={{ backgroundImage: "url(/ornament/palmette.svg)", backgroundSize: "48px 24px" }}
      aria-hidden
    />
  );
}

/** Eight-pointed star used as a bullet / badge. */
export function Star8({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="-10 -10 20 20" width={size} height={size} className={className} aria-hidden>
      <rect x="-7" y="-7" width="14" height="14" fill="var(--gold)" />
      <rect x="-7" y="-7" width="14" height="14" fill="var(--gold)" transform="rotate(45)" />
      <circle r="2.2" fill="var(--lapis-dark)" />
    </svg>
  );
}

/** Winged sun disc, simplified: the crowning motif of the lobby. */
export function WingedDisc({ width = 260, className = "" }: { width?: number; className?: string }) {
  return (
    <svg viewBox="-130 -30 260 60" width={width} height={(width * 60) / 260} className={className} aria-hidden>
      <defs>
        <linearGradient id="wd-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4dc8a" />
          <stop offset="1" stopColor="#b8871f" />
        </linearGradient>
      </defs>
      {/* wings: layered feathers */}
      {[1, -1].map((dir) => (
        <g key={dir} transform={`scale(${dir} 1)`} fill="url(#wd-gold)" stroke="var(--lapis-dark)" strokeWidth="0.6">
          <path d="M18 -4 C 50 -22 90 -26 126 -14 C 96 -10 66 -2 36 10 Z" />
          <path d="M22 2 C 52 -10 86 -12 118 -4 C 90 2 62 8 40 16 Z" opacity="0.85" />
          <path d="M26 8 C 52 2 78 2 104 6 C 80 12 58 16 42 20 Z" opacity="0.7" />
          {Array.from({ length: 7 }, (_, i) => (
            <line
              key={i}
              x1={40 + i * 12}
              y1={-8 + i * 1.2}
              x2={34 + i * 12}
              y2={14 - i * 0.6}
              stroke="var(--lapis-dark)"
              strokeWidth="0.5"
              opacity="0.6"
            />
          ))}
        </g>
      ))}
      {/* disc */}
      <circle r="17" fill="var(--lapis-dark)" stroke="url(#wd-gold)" strokeWidth="2.5" />
      <circle r="12" fill="none" stroke="var(--turquoise)" strokeWidth="0.8" />
      <g fill="var(--gold)">
        <rect x="-8" y="-8" width="16" height="16" />
        <rect x="-8" y="-8" width="16" height="16" transform="rotate(45)" />
      </g>
      <circle r="3" fill="var(--turquoise)" />
      {/* tail feathers */}
      <g fill="url(#wd-gold)" stroke="var(--lapis-dark)" strokeWidth="0.5">
        <path d="M-7 15 L -9 29 L -3 24 L 0 30 L 3 24 L 9 29 L 7 15 Z" />
      </g>
    </svg>
  );
}
