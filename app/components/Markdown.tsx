"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

/**
 * LLMs write math as \( … \) and \[ … \] as often as $ … $; remark-math only understands
 * dollars, so convert the bracket forms first.
 */
function normalizeMath(text: string): string {
  return text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => `\n$$\n${m.trim()}\n$$\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => `$${m.trim()}$`);
}

/** Agent output rendered as GitHub-flavoured Markdown with KaTeX math. Links open in a new tab. */
export const Markdown = memo(function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={`md ${className ?? ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: "ignore" }]]}
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
        }}
      >
        {normalizeMath(text)}
      </ReactMarkdown>
    </div>
  );
});
