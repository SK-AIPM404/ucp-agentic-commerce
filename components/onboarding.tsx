"use client"

import { useState } from "react"
import { ArrowRight, CheckCircle2, Loader2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

export type IngestResult = {
  ok: true
  domain: string
  storeUrl: string
  storeName: string
  currency: string
  productCount: number
  sampleTitles: string[]
  capabilities: string[]
  manifestUrl: string
}

type Props = {
  onConnected: (result: IngestResult) => void
}

const DEMO_STORES = [
  { label: "Allbirds", url: "https://www.allbirds.com" },
  { label: "Kith", url: "https://kith.com" },
  { label: "Gymshark", url: "https://www.gymshark.com" },
]

export function Onboarding({ onConnected }: Props) {
  const [url, setUrl] = useState("")
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle")
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<IngestResult | null>(null)

  async function connect(target: string) {
    if (!target.trim()) return
    setStatus("loading")
    setError(null)
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeUrl: target }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Failed (${res.status})`)
      }
      const data = (await res.json()) as IngestResult
      setResult(data)
      setStatus("success")
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setStatus("error")
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* subtle dot pattern */}
      <div className="absolute inset-0 dot-grid opacity-40 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/40 to-background pointer-events-none" />

      <div className="relative mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16">
        {/* eyebrow */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-secondary/40 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          UCP 2026-04-08 · Track 2
        </div>

        <h1 className="text-balance text-center text-4xl font-medium leading-tight tracking-tight md:text-5xl">
          Make your store
          <br />
          <span className="text-primary">AI-ready</span> in 60 seconds
        </h1>

        <p className="mt-5 max-w-md text-pretty text-center text-sm leading-relaxed text-muted-foreground">
          Paste your Shopify URL. We pull your catalog, generate a UCP manifest, and
          spin up an AI storefront where buyers shop in chat — no redirect.
        </p>

        {/* URL input */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void connect(url)
          }}
          className="mt-10 w-full max-w-xl"
        >
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl border bg-input/40 p-1.5 backdrop-blur transition-colors",
              status === "error"
                ? "border-destructive/60"
                : "border-border focus-within:border-primary/60",
            )}
          >
            <input
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://your-store.myshopify.com"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                if (status === "error") setStatus("idle")
              }}
              disabled={status === "loading"}
              className="flex-1 bg-transparent px-3 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={status === "loading" || !url.trim()}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {status === "loading" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Ingesting…
                </>
              ) : (
                <>
                  Connect store
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>

          {status === "error" && error ? (
            <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive-foreground">
              {error}
            </div>
          ) : null}
        </form>

        {/* Demo stores */}
        {status !== "success" && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              Try a demo store:
            </span>
            {DEMO_STORES.map((s) => (
              <button
                key={s.url}
                type="button"
                disabled={status === "loading"}
                onClick={() => {
                  setUrl(s.url)
                  void connect(s.url)
                }}
                className="rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs text-foreground/80 transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Loading skeleton */}
        {status === "loading" && (
          <div className="mt-10 w-full max-w-xl">
            <ul className="space-y-2 font-mono text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                Fetching /products.json…
              </li>
              <li className="flex items-center gap-2 opacity-60">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                Transforming variants → UCP items
              </li>
              <li className="flex items-center gap-2 opacity-40">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                Generating /.well-known/ucp manifest
              </li>
            </ul>
          </div>
        )}

        {/* Success state */}
        {status === "success" && result && (
          <div className="mt-10 w-full max-w-xl">
            <div className="rounded-xl border border-primary/30 bg-card p-5 text-card-foreground shadow-lg shadow-primary/5">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-base font-medium">
                      {result.storeName}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground/80">
                      {result.domain}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    UCP manifest ready ·{" "}
                    <span className="font-medium text-foreground">
                      {result.productCount.toLocaleString()} products
                    </span>{" "}
                    indexed
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {result.capabilities.map((c) => (
                      <span
                        key={c}
                        className="rounded-md bg-accent px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent-foreground"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {result.sampleTitles.length > 0 && (
                <div className="mt-4 border-t border-border/50 pt-4">
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Sample products
                  </div>
                  <ul className="space-y-1 text-xs text-card-foreground/80">
                    {result.sampleTitles.map((t, i) => (
                      <li key={i} className="truncate">
                        · {t}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="button"
                onClick={() => onConnected(result)}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Sparkles className="h-4 w-4" />
                Try the storefront
              </button>
            </div>

            <a
              href={result.manifestUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block text-center font-mono text-[11px] text-muted-foreground hover:text-primary"
            >
              View {result.manifestUrl}
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
