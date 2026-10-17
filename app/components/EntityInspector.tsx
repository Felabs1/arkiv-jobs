"use client";

import { useEffect, useState, type ReactNode } from "react";
import { findCreationTx } from "@/lib/arkiv";
import { BLOCK_TIME_SEC } from "@/lib/rules";
import type { ChainOrder } from "@/lib/types";
import { IconBlocks, IconCheck, IconX } from "./icons";

const EXPLORER = "https://tiramisu.explorer.arkiv.network";

export interface InspectTarget {
  title: string;
  type: string;
  entity: {
    key: string;
    creator: string;
    owner: string;
    order: ChainOrder;
    expiresAt: number;
    attrs: Record<string, { type: string; value: string }>;
  };
  /** The Arkiv query that surfaced this entity, as the node sees it. */
  query: string;
  /** Why this entity type is on Arkiv and what its lifetime means. */
  why: string;
  extra?: ReactNode;
}

function duration(sec: number) {
  if (sec <= 0) return "expired";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

/** Shows exactly what is stored on Arkiv for one entity, so the trust and lifetime rules are visible. */
export function EntityInspector({ target, block, onClose }: { target: InspectTarget | null; block: number; onClose: () => void }) {
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, onClose]);

  // Entity metadata has no tx hash; find the creation tx from its EntityCreated log.
  const [tx, setTx] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setTx(undefined);
    if (!target) return;
    let live = true;
    findCreationTx(target.entity.key as `0x${string}`, target.entity.order.block)
      .then((h) => live && setTx(h))
      .catch(() => live && setTx(null));
    return () => {
      live = false;
    };
  }, [target?.entity.key, target?.entity.order.block]);

  if (!target) return null;
  const { entity } = target;
  const leftSec = entity.expiresAt && block ? (entity.expiresAt - block) * BLOCK_TIME_SEC : null;
  const transferred = entity.owner && entity.owner !== entity.creator;
  const attrs = Object.entries(entity.attrs).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <aside className="glass-strong modal inspector" onClick={(e) => e.stopPropagation()} aria-label="Arkiv entity">
        <header className="card-title split">
          <span className="row-center">
            <span className="ico">
              <IconBlocks />
            </span>
            <span>
              On Arkiv <span className="muted small">· {target.type}</span>
            </span>
          </span>
          <button type="button" className="round" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </header>
        <p className="insp-title">{target.title}</p>

        <dl className="insp-grid">
          <dt>Entity key</dt>
          <dd className="mono">{entity.key}</dd>

          <dt>$creator</dt>
          <dd>
            <a className="mono" href={`${EXPLORER}/address/${entity.creator}`} target="_blank" rel="noreferrer">
              {entity.creator}
            </a>
            <span className="verified">
              <IconCheck /> signed by this wallet; can't be changed (link opens the wallet)
            </span>
          </dd>

          <dt>$owner</dt>
          <dd className="mono">
            {entity.owner || "—"}
            {transferred && <span className="muted small"> (transferred; the board ignores this for trust)</span>}
          </dd>

          <dt>Created</dt>
          <dd>block {entity.order.block.toLocaleString()}</dd>

          <dt>Created in tx</dt>
          <dd>
            {tx === undefined ? (
              <span className="muted">looking up…</span>
            ) : tx ? (
              <a className="mono" href={`${EXPLORER}/tx/${tx}`} target="_blank" rel="noreferrer">
                {tx}
              </a>
            ) : (
              <span className="muted">not found</span>
            )}
          </dd>

          <dt>Expires</dt>
          <dd>
            {entity.expiresAt ? (
              <>
                block {entity.expiresAt.toLocaleString()} ·{" "}
                <b className={leftSec !== null && leftSec < 120 ? "warn" : ""}>
                  {leftSec === null ? "…" : leftSec > 0 ? `in ${duration(leftSec)}` : "expired"}
                </b>
              </>
            ) : (
              "—"
            )}
          </dd>
        </dl>

        <h4>Typed attributes</h4>
        <table className="insp-attrs">
          <tbody>
            {attrs.map(([k, v]) => (
              <tr key={k}>
                <td className="mono">{k}</td>
                <td className="type">{v.type}</td>
                <td className="mono val">{v.value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h4>Query that found it</h4>
        <pre className="insp-query">{target.query}</pre>

        <h4>Why it's on Arkiv</h4>
        <p className="small insp-why">{target.why}</p>
        {target.extra}
      </aside>
    </div>
  );
}
