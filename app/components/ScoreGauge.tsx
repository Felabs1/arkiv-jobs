"use client";

import { IconGauge } from "./icons";

/** Semicircle gauge for the share of reviewed work that posters accepted. */
export function ScoreGauge({ accepted, rejected }: { accepted: number; rejected: number }) {
  const total = accepted + rejected;
  const pct = total ? Math.round((accepted / total) * 100) : null;
  const label = pct === null ? "No reviews yet" : pct >= 75 ? "High Score" : pct >= 50 ? "Medium Score" : "Low Score";

  // Arc from 200° to -20° (a wide semicircle) like a speedometer.
  const R = 110;
  const cx = 150;
  const cy = 130;
  const start = 200;
  const end = -20;
  const pt = (deg: number, r = R) => [cx + r * Math.cos((deg * Math.PI) / 180), cy - r * Math.sin((deg * Math.PI) / 180)];
  const arc = (from: number, to: number, r = R) => {
    const [x1, y1] = pt(from, r);
    const [x2, y2] = pt(to, r);
    const large = Math.abs(from - to) > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };
  const needleDeg = start - ((pct ?? 0) / 100) * (start - end);
  const [nx, ny] = pt(needleDeg, R + 6);
  const [nx2, ny2] = pt(needleDeg, R - 34);

  return (
    <section className="glass card-pad gauge-card">
      <header className="card-title">
        <span className="ico">
          <IconGauge />
        </span>
        Acceptance Score
      </header>
      <div className="gauge-value">
        <span className="big">{pct ?? "—"}</span>
        {pct !== null && <span className="unit">%</span>}
      </div>
      <span className="chip-soft">{label}</span>
      <svg className="gauge" viewBox="0 0 300 180" aria-label={`Acceptance ${pct ?? 0}%`}>
        <defs>
          <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#f6c945" />
            <stop offset="0.45" stopColor="#8fe07a" />
            <stop offset="1" stopColor="#3ccfe0" />
          </linearGradient>
          <radialGradient id="gaugeGlow" cx="0.5" cy="1" r="0.75">
            <stop offset="0" stopColor="#3ccf9a" stopOpacity=".45" />
            <stop offset="1" stopColor="#3ccf9a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path d={`${arc(start, end, R - 18)} L ${cx} ${cy} Z`} fill="url(#gaugeGlow)" />
        <path d={arc(start, end)} stroke="rgba(255,255,255,.08)" strokeWidth="14" fill="none" strokeLinecap="round" />
        {pct !== null && pct > 0 && (
          <path d={arc(start, needleDeg)} stroke="url(#gaugeGrad)" strokeWidth="14" fill="none" strokeLinecap="round" />
        )}
        {pct !== null && <line x1={nx2} y1={ny2} x2={nx} y2={ny} stroke="#d9fbff" strokeWidth="3" strokeLinecap="round" />}
      </svg>
      <p className="muted small gauge-foot">
        {total ? `${accepted} accepted · ${rejected} rejected` : "Accept a delivered result to start the score"}
      </p>
    </section>
  );
}
