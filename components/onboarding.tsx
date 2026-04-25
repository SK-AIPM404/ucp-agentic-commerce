"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export type IngestAnalysis = {
  tagline: string
  prompts: string[]
}

export type IngestResult = {
  ok: true
  domain: string
  storeUrl: string
  storeName: string
  currency: string
  productCount: number
  sampleTitles: string[]
  categories: string[]
  analysis?: IngestAnalysis
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

type AuditStep = {
  id: string
  label: string
}

const AUDIT_STEPS: AuditStep[] = [
  { id: "fetch", label: "Fetching /products.json" },
  { id: "transform", label: "Transforming variants → UCP items" },
  { id: "manifest", label: "Generating /.well-known/ucp manifest" },
  { id: "capabilities", label: "Auditing capabilities (catalog, checkout, fulfillment)" },
  { id: "analyze", label: "Running brand AI analysis (tagline + suggested prompts)" },
  { id: "ready", label: "Storefront ready" },
]

// Hardcoded teal so the CTA can never look "disabled" because of a token issue.
const TEAL = "oklch(0.7 0.16 162)"
const TEAL_HOVER = "oklch(0.62 0.16 162)"

export function Onboarding({ onConnected }: Props) {
  const [url, setUrl] = useState("")
  const [status, setStatus] = useState<
    "idle" | "running" | "success" | "error"
  >("idle")
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<IngestResult | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current)
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [])

  async function start(target: string) {
    // Pass through whatever the user typed — let /api/ingest handle parsing,
    // normalization, and Shopify-vs-not-Shopify fallback logic.
    const raw = target ?? ""
    if (status === "running" || status === "success") return

    setUrl(raw)
    setStatus("running")
    setError(null)
    setStepIndex(0)
    setResult(null)

    if (tickRef.current) clearInterval(tickRef.current)
    tickRef.current = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, AUDIT_STEPS.length - 2))
    }, 550)

    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeUrl: raw }),
      })

      if (tickRef.current) clearInterval(tickRef.current)

      console.log("[v0] /api/ingest status:", res.status)

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const msg = (data && data.error) || `Failed (${res.status})`
        console.log("[v0] ingest failed:", msg)
        throw new Error(msg)
      }

      const data = (await res.json()) as IngestResult
      console.log("[v0] ingest ok:", data.storeName, data.productCount)
      setResult(data)
      setStepIndex(AUDIT_STEPS.length - 1)
      setStatus("success")

      advanceTimer.current = setTimeout(() => {
        console.log("[v0] auto-advancing into chat")
        onConnected(data)
      }, 1600)
    } catch (err) {
      if (tickRef.current) clearInterval(tickRef.current)
      const message = err instanceof Error ? err.message : String(err)
      console.log("[v0] start() error:", message)
      setError(message)
      setStatus("error")
    }
  }

  // Per spec: button is active on page load. Only disable while a request is
  // in flight or after success (so users don't double-submit). Empty/invalid
  // URL handling is delegated to /api/ingest.
  const ctaDisabled = status === "running" || status === "success"

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <div className="absolute inset-0 dot-grid opacity-40 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/40 to-background pointer-events-none" />

      <div className="relative mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16">
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
          Paste your Shopify URL. We pull your catalog, run a quick audit, and
          drop you straight into an AI storefront where buyers shop in chat.
        </p>

        {/* URL input + Start (no form, plain onClick — bulletproof) */}
        <div className="mt-10 w-full max-w-xl">
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
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void start(url)
                }
              }}
              disabled={status === "running" || status === "success"}
              className="flex-1 bg-transparent px-3 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => {
                if (!ctaDisabled) void start(url)
              }}
              disabled={ctaDisabled}
              style={
                ctaDisabled
                  ? undefined
                  : {
                      backgroundColor: TEAL,
                      color: "white",
                    }
              }
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors",
                "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
                !ctaDisabled && "hover:brightness-110",
              )}
              onMouseEnter={(e) => {
                if (!ctaDisabled) e.currentTarget.style.backgroundColor = TEAL_HOVER
              }}
              onMouseLeave={(e) => {
                if (!ctaDisabled) e.currentTarget.style.backgroundColor = TEAL
              }}
            >
              {status === "running" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Auditing…
                </>
              ) : status === "success" ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Done
                </>
              ) : (
                <>
                  Start
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>

          {status === "error" && error ? (
            <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        {/* Demo stores */}
        {(status === "idle" || status === "error") && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              Try a demo store:
            </span>
            {DEMO_STORES.map((s) => (
              <button
                key={s.url}
                type="button"
                onClick={() => void start(s.url)}
                className="rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs text-foreground/80 transition-colors hover:border-primary/50 hover:text-foreground"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Live audit log */}
        {(status === "running" || status === "success") && (
          <div className="mt-10 w-full max-w-xl rounded-xl border border-border/70 bg-card/60 p-5 backdrop-blur">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Live audit
              </span>
              {status === "success" && result ? (
                <span className="font-mono text-[10px] uppercase tracking-widest text-primary">
                  {result.productCount.toLocaleString()} products · ready
                </span>
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  in progress
                </span>
              )}
            </div>

            <ul className="space-y-2 font-mono text-xs">
              {AUDIT_STEPS.map((step, i) => {
                const done = status === "success" ? true : i < stepIndex
                const active = status === "running" && i === stepIndex
                const pending = !done && !active
                return (
                  <li
                    key={step.id}
                    className={cn(
                      "flex items-center gap-3 transition-opacity",
                      pending && "opacity-40",
                    )}
                  >
                    {done ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                    ) : active ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                    ) : (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                    )}
                    <span
                      className={cn(
                        done
                          ? "text-foreground/90"
                          : active
                            ? "text-foreground"
                            : "text-muted-foreground",
                      )}
                    >
                      {step.label}
                    </span>
                  </li>
                )
              })}
            </ul>

            {status === "success" && result && (
              <div className="mt-5 border-t border-border/50 pt-4">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-base font-medium">{result.storeName}</span>
                  <span className="font-mono text-[11px] text-muted-foreground/80">
                    {result.domain}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {result.capabilities.map((c) => (
                    <span
                      key={c}
                      className="rounded-md bg-accent px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent-foreground"
                    >
                      {c}
                    </span>
                  ))}
                </div>
                {result.categories && result.categories.length > 0 && (
                  <div className="mt-3">
                    <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Real categories from product_type
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {result.categories.slice(0, 8).map((c) => (
                        <span
                          key={c}
                          className="rounded-full border border-border/60 bg-secondary/40 px-2 py-0.5 font-mono text-[10px] text-foreground/80"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {result.sampleTitles.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-card-foreground/70">
                    {result.sampleTitles.slice(0, 3).map((t, i) => (
                      <li key={i} className="truncate">
                        · {t}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 flex items-center gap-2 font-mono text-[11px] text-primary">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Entering storefront…
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
