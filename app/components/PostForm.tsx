"use client";

import { useEffect, useState } from "react";
import { CATEGORIES, type Category } from "@/lib/types";
import { IconSparkles, IconX } from "./icons";

export interface NewTask {
  title: string;
  description: string;
  category: Category;
  reward: number;
  minutes: number;
}

/** Post-a-task dialog. The task is signed by the active wallet (test wallet or MetaMask). */
export function PostForm({
  open,
  connected,
  walletBusy,
  onClose,
  onTryIt,
  onConnect,
  onPost,
}: {
  open: boolean;
  connected: boolean;
  walletBusy: boolean;
  onClose: () => void;
  onTryIt: () => void;
  onConnect: () => void;
  onPost: (t: NewTask) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("Summarize this article in 3 bullets");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category>("writing");
  const [reward, setReward] = useState(10);
  const [minutes, setMinutes] = useState(5);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      const ok = await onPost({ title: title.trim(), description: description.trim(), category, reward, minutes });
      if (ok) {
        setDescription("");
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <form className="glass-strong modal" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <header className="card-title split">
          <span className="row-center">
            <span className="ico">
              <IconSparkles />
            </span>
            Post a task
          </span>
          <button type="button" className="round" onClick={onClose} disabled={busy} aria-label="Close">
            <IconX />
          </button>
        </header>
        <label>
          Title
          <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Description
          <textarea
            rows={6}
            value={description}
            placeholder="Paste the article, the question, or the spec…"
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="form-row">
          <label>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Reward
            <input type="number" min={1} max={1000} value={reward} onChange={(e) => setReward(Number(e.target.value))} />
          </label>
          <label>
            Deadline (min)
            <input type="number" min={2} max={120} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
          </label>
        </div>
        <p className="muted small">
          Writing goes to Scribe and Analyst, research to Analyst, code to Coder. The lowest bid in the 20s window wins.
        </p>
        {connected ? (
          <button className="btn-primary wide" disabled={busy}>
            {busy ? "Signing and posting to Arkiv…" : "Post task"}
          </button>
        ) : (
          <div className="wallet-choice">
            <button type="button" className="btn-primary wide" onClick={onTryIt} disabled={walletBusy}>
              {walletBusy ? "Preparing your test wallet…" : "Try it now: no wallet needed"}
            </button>
            <button type="button" className="btn-ghost wide" onClick={onConnect} disabled={walletBusy}>
              Use MetaMask instead
            </button>
            <p className="muted small">
              “Try it now” creates a Tiramisu test wallet in this browser and sends it a little test GLM. Your tasks and
              reviews are signed by that wallet, so Arkiv records you as their creator.
            </p>
          </div>
        )}
      </form>
    </div>
  );
}
