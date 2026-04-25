"use client"

import { useState } from "react"
import { Copy, ExternalLink, RotateCcw, Store } from "lucide-react"
import type { IngestResult } from "@/components/onboarding"

const SAMPLE_PROMPTS = [
  "what's trending right now?",
  "show me bestsellers under $100",
  "I need a gift for a runner",
  "what's the most popular item?",
  "find something blue and casual",
]

type Props = {
  store: IngestResult
  onReset: () => void
}

export function StoreRail({ store, onReset }: Props) {
  const [manifestOpen, setManifestOpen] = useState(false)
  const [manifestJson, setManifestJson] = useState<string>("")
  const [copied, setCopied] = useState(false)

  async function loadManifest() {
    setManifestOpen((v) => !v)
    if (!manifestJson) {
      try {
        const res = await fetch(store.manifestUrl)
        const data = await res.json()
        setManifestJson(JSON.stringify(data, null, 2))
      } catch {
        setManifestJson("{ /* failed to load manifest */ }")
      }
    }
  }

  async function copyManifest() {
    if (!manifestJson) return
    await navigator.clipboard.writeText(manifestJson)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <aside className="flex h-full flex-col overflow-y-auto chat-scroll border-l border-border bg-background/40 p-5">
      {/* Store header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-card-foreground">
            <Store className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{store.storeName}</div>
            <a
              href={store.storeUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 truncate font-mono text-[11px] text-muted-foreground hover:text-primary"
            >
              {store.domain} <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          aria-label="Disconnect store"
          title="Disconnect"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="Products" value={store.productCount.toLocaleString()} />
        <Stat label="Currency" value={store.currency} />
      </div>

      {/* Capabilities */}
      <div className="mt-5">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          UCP Capabilities
        </div>
        <div className="flex flex-wrap gap-1.5">
          {store.capabilities.map((c) => (
            <span
              key={c}
              className="rounded-md bg-accent px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent-foreground"
            >
              {c}
            </span>
          ))}
        </div>
      </div>

      {/* Sample prompts */}
      <div className="mt-6">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Try a prompt
        </div>
        <div className="flex flex-col gap-1.5">
          {SAMPLE_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                // Dispatch a custom event the chat panel can hook into.
                window.dispatchEvent(
                  new CustomEvent("ai-shelf:sample-prompt", { detail: p }),
                )
              }}
              className="text-left rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-foreground/80 transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Discount codes hint */}
      <div className="mt-6 rounded-lg border border-border bg-card/40 p-3">
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Demo discount codes
        </div>
        <ul className="space-y-1 font-mono text-[11px] text-card-foreground/90">
          <li>
            <span className="text-primary">WELCOME10</span> · 10% off
          </li>
          <li>
            <span className="text-primary">FLAT500</span> · flat off
          </li>
          <li>
            <span className="text-primary">FREESHIP</span> · free shipping
          </li>
        </ul>
      </div>

      {/* Manifest viewer */}
      <div className="mt-6">
        <button
          type="button"
          onClick={loadManifest}
          className="w-full rounded-md border border-border bg-secondary/40 px-3 py-2 text-left font-mono text-[11px] text-foreground/80 hover:border-primary/40"
        >
          {manifestOpen ? "− Hide" : "+ View"} /.well-known/ucp
        </button>
        {manifestOpen ? (
          <div className="mt-2 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground">
            <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                manifest
              </span>
              <button
                type="button"
                onClick={copyManifest}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
              >
                <Copy className="h-3 w-3" />
                {copied ? "copied" : "copy"}
              </button>
            </div>
            <pre className="max-h-72 overflow-auto p-3 font-mono text-[10px] leading-relaxed text-popover-foreground">
              {manifestJson || "loading…"}
            </pre>
          </div>
        ) : null}
      </div>

      <div className="mt-auto pt-6 text-center font-mono text-[10px] text-muted-foreground/60">
        AI Shelf · UCP 2026-04-08
      </div>
    </aside>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-medium text-foreground">{value}</div>
    </div>
  )
}
