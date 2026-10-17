"use client";

import { useMemo } from "react";
import type { Bid } from "@/lib/types";
import { IconChart, IconBlocks } from "./icons";

/** Glowing line of recent bid prices, newest on the right, with a callout on the latest. */
export function BidsChart({ bids, block }: { bids: Bid[]; block: number }) {
  const points = useMemo(
    () => [...bids].sort((a, b) => a.order.block - b.order.block || (a.key < b.key ? -1 : 1)).slice(-14),
    [bids],
  );

  const W = 720;
  const H = 210;
  const padL = 64;
  const padR = 24;
  const padT = 40;
  const padB = 26;
  const max = Math.max(10, ...points.map((p) => p.price));
  const x = (i: number) => (points.length <= 1 ? padL + (W - padL - padR) / 2 : padL + (i / (points.length - 1)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const line = points.map((p, i) => `${i ? "L" : "M"} ${x(i).toFixed(1)} ${y(p.price).toFixed(1)}`).join(" ");
  const last = points.at(-1);
  const lastI = points.length - 1;

  return (
    <section className="glass card-pad chart-card">
      <header className="card-title split">
        <span className="row-center">
          <span className="ico">
            <IconChart />
          </span>
          Bids Over Time
        </span>
        <span className="pill-glass">
          <IconBlocks /> Block {block ? block.toLocaleString() : "…"}
        </span>
      </header>
      {points.length === 0 ? (
        <div className="chart-empty muted">Bids appear here as agents compete for tasks.</div>
      ) : (
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Recent bid prices">
          <defs>
            <linearGradient id="chartLine" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#3aa7ff" />
              <stop offset="1" stopColor="#7ee8ff" />
            </linearGradient>
            <linearGradient id="chartBars" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5fd8ff" stopOpacity=".35" />
              <stop offset="1" stopColor="#5fd8ff" stopOpacity="0" />
            </linearGradient>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {[
            ["High", max],
            ["Mid", max / 2],
            ["Low", 0],
          ].map(([label, v]) => (
            <g key={label as string}>
              <line x1={padL} x2={W - padR} y1={y(v as number)} y2={y(v as number)} className="grid-line" />
              <text x={8} y={y(v as number) + 4} className="axis">
                {label}
              </text>
            </g>
          ))}
          {/* Thin vertical hatching under the line, like an equalizer. */}
          {points.length > 1 &&
            Array.from({ length: 90 }, (_, k) => {
              const t = k / 89;
              const fx = padL + t * (W - padL - padR);
              const fi = t * lastI;
              const i0 = Math.floor(fi);
              const i1 = Math.min(lastI, i0 + 1);
              const v = points[i0].price + (points[i1].price - points[i0].price) * (fi - i0);
              return <line key={k} x1={fx} x2={fx} y1={y(v) + 6} y2={H - padB} stroke="url(#chartBars)" strokeWidth="1.6" />;
            })}
          <path d={line} fill="none" stroke="url(#chartLine)" strokeWidth="2.4" filter="url(#glow)" />
          {points.map((p, i) => (
            <circle key={p.key} cx={x(i)} cy={y(p.price)} r={i === lastI ? 6 : 3.6} className={i === lastI ? "dot hot" : "dot"} />
          ))}
          {last && (
            <g>
              <line x1={x(lastI)} x2={x(lastI)} y1={y(last.price)} y2={14 + 22} className="callout-line" />
              <g transform={`translate(${Math.min(W - padR - 150, Math.max(padL, x(lastI) - 75))}, 6)`}>
                <rect width="150" height="30" rx="10" className="callout" />
                <text x="75" y="20" textAnchor="middle" className="callout-text">
                  {last.agent}: {last.price} pts
                </text>
              </g>
            </g>
          )}
        </svg>
      )}
    </section>
  );
}
