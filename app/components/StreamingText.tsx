"use client";

import { useEffect, useRef, useState } from "react";
import { Markdown } from "./Markdown";

/** Re-render about 25 times a second: smooth to the eye, and cheap enough to re-parse Markdown and math. */
const FRAME_MS = 40;

/**
 * Types `text` out smoothly as rendered Markdown. Agents patch their partial output onto Arkiv
 * every block or so; this fills in the gap between patches so the work reads like a live stream.
 */
export function StreamingText({ text, live, className }: { text: string; live: boolean; className?: string }) {
  const [shown, setShown] = useState(text.length);
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    // Text replaced by something shorter (another task, or a reset): don't show past its end.
    if (shownRef.current > text.length) setShown(text.length);
    if (shownRef.current >= text.length) return;
    const id = setInterval(() => {
      setShown((s) => {
        const left = text.length - s;
        if (left <= 0) return s;
        // Speed up when far behind so we never lag more than a second or two.
        return Math.min(text.length, s + Math.max(3, Math.ceil(left / 20)));
      });
    }, FRAME_MS);
    return () => clearInterval(id);
  }, [text]);

  const done = shown >= text.length;
  return (
    <Markdown text={done ? text : text.slice(0, shown)} className={`${className ?? ""} ${live || !done ? "streaming" : ""}`} />
  );
}
