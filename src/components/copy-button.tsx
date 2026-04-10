"use client";

import { useState } from "react";

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      className="rounded-full border border-[color:var(--border)] px-4 py-2 text-sm font-medium text-black/72 transition hover:bg-black/5"
      onClick={handleCopy}
      type="button"
    >
      {copied ? "Kopiert" : "Text kopieren"}
    </button>
  );
}
