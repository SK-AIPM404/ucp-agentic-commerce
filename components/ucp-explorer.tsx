"use client"

import { useMemo, useState } from "react"
import { ChevronDown, Copy, ExternalLink, Play } from "lucide-react"
import type { IngestResult } from "@/components/onboarding"
import { cn } from "@/lib/utils"

type Method = "GET" | "POST" | "PUT"

type Endpoint = {
  /** Stable id used for expand state. */
  id: string
  /** Display label in the list. */
  label: string
  method: Method
  /** Path with placeholders filled in. */
  path: string
  /** Short description. */
  description: string
  /** Optional body for POST/PUT. */
  body?: unknown
  /** Optional placeholder shown when the endpoint can't be exercised yet. */
  unavailableReason?: string
}

type Props = {
  store: IngestResult
  /** Optional checkout session id once a buyer has created one. */
  sessionId?: string
}

export function UcpExplorer({ store, sessionId }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [responses, setResponses] = useState<
    Record<string, { status: number; body: string; loading?: boolean }>
  >({})
  const [copied, setCopied] = useState<string | null>(null)

  // The first product id from the audit acts as a real example for the
  // product-detail and checkout-create endpoints.
  const sampleProductId = useMemo(() => {
    // sampleTitles is provided in IngestResult — but the product id isn't.
    // We use a deterministic placeholder if the explorer was opened before
    // a real session exists; the manifest itself doesn't expose ids either.
    return "<product_id>"
  }, [])

  const storeQs = `?store=${encodeURIComponent(store.domain)}`

  const endpoints: Endpoint[] = [
    {
      id: "manifest",
      label: "UCP Manifest",
      method: "GET",
      path: `/.well-known/ucp${storeQs}`,
      description:
        "Public capability advertisement. The single entry point an AI agent reads to discover what this storefront supports.",
    },
    {
      id: "search",
      label: "Catalog Search",
      method: "GET",
      path: `/ucp/v1/catalog/search${storeQs}&q=&limit=6`,
      description:
        "Free-text + faceted search over the ingested catalog. Supports q, min_price, max_price, category, limit.",
    },
    {
      id: "product",
      label: "Product Detail",
      method: "GET",
      path: `/ucp/v1/catalog/products/${sampleProductId}${storeQs}`,
      description:
        "Returns a single UCP item with all variants, options, images, and a normalized price.",
    },
    {
      id: "checkout-create",
      label: "Create Checkout Session",
      method: "POST",
      path: `/ucp/v1/checkout-sessions${storeQs}`,
      description:
        "Opens a buyer-bound session containing line items, discount, shipping, and totals.",
      body: {
        line_items: [
          { product_id: "<product_id>", variant_id: "<variant_id>", quantity: 1 },
        ],
      },
    },
    {
      id: "checkout-get",
      label: "Get Checkout Session",
      method: "GET",
      path: sessionId
        ? `/ucp/v1/checkout-sessions/${sessionId}`
        : `/ucp/v1/checkout-sessions/<session_id>`,
      description: "Returns the live session — totals are recomputed on each fetch.",
      unavailableReason: sessionId
        ? undefined
        : "Create a session in chat first (e.g. ask the AI to add an item to cart).",
    },
    {
      id: "checkout-update",
      label: "Update Session (discount / shipping)",
      method: "PUT",
      path: sessionId
        ? `/ucp/v1/checkout-sessions/${sessionId}`
        : `/ucp/v1/checkout-sessions/<session_id>`,
      description:
        "Apply a discount code (WELCOME10, FLAT500, FREESHIP) or override shipping fields.",
      body: { discount_code: "WELCOME10" },
      unavailableReason: sessionId
        ? undefined
        : "Create a session in chat first.",
    },
    {
      id: "checkout-complete",
      label: "Complete Order",
      method: "POST",
      path: sessionId
        ? `/ucp/v1/checkout-sessions/${sessionId}/complete`
        : `/ucp/v1/checkout-sessions/<session_id>/complete`,
      description:
        "Marks the session completed and returns an order_id. continue_url points back to the merchant cart.",
      unavailableReason: sessionId
        ? undefined
        : "Create a session in chat first.",
    },
  ]

  async function runEndpoint(ep: Endpoint) {
    if (ep.unavailableReason) return
    setResponses((r) => ({
      ...r,
      [ep.id]: { status: 0, body: "", loading: true },
    }))

    try {
      const init: RequestInit = {
        method: ep.method,
        headers: ep.body ? { "Content-Type": "application/json" } : undefined,
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      }
      const res = await fetch(ep.path, init)
      const text = await res.text()
      let pretty = text
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2)
      } catch {
        /* not JSON, leave as-is */
      }
      setResponses((r) => ({
        ...r,
        [ep.id]: { status: res.status, body: pretty },
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setResponses((r) => ({
        ...r,
        [ep.id]: { status: 0, body: `// network error: ${message}` },
      }))
    }
  }

  async function copyText(id: string, text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 1200)
  }

  return (
    <div className="space-y-1.5">
      {endpoints.map((ep) => {
        const open = openId === ep.id
        const resp = responses[ep.id]
        const disabled = Boolean(ep.unavailableReason)

        return (
          <div
            key={ep.id}
            className="overflow-hidden rounded-md border border-border bg-secondary/30"
          >
            <button
              type="button"
              onClick={() => setOpenId(open ? null : ep.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-secondary/60"
            >
              <MethodTag method={ep.method} />
              <span className="flex-1 truncate font-mono text-[11px] text-foreground/85">
                {ep.label}
              </span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-muted-foreground transition-transform",
                  open && "rotate-180",
                )}
              />
            </button>

            {open ? (
              <div className="border-t border-border/60 bg-background/60 p-3">
                <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
                  {ep.description}
                </p>

                {/* Path */}
                <div className="flex items-center gap-1.5">
                  <code className="flex-1 truncate rounded bg-secondary/70 px-2 py-1 font-mono text-[10px] text-foreground/90">
                    {ep.path}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyText(`${ep.id}-path`, ep.path)}
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                    aria-label="Copy path"
                    title="Copy path"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                  {ep.method === "GET" ? (
                    <a
                      href={ep.path}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                      aria-label="Open in new tab"
                      title="Open in new tab"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>

                {/* Body preview for POST/PUT */}
                {ep.body ? (
                  <pre className="mt-2 max-h-36 overflow-auto rounded bg-secondary/70 p-2 font-mono text-[10px] leading-relaxed text-foreground/85">
                    {JSON.stringify(ep.body, null, 2)}
                  </pre>
                ) : null}

                {/* Run button */}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {ep.unavailableReason ?? "click run to fetch live response"}
                  </span>
                  <button
                    type="button"
                    onClick={() => runEndpoint(ep)}
                    disabled={disabled || resp?.loading}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors",
                      disabled
                        ? "cursor-not-allowed border-border/60 text-muted-foreground/60"
                        : "border-primary/40 text-primary hover:bg-primary/10",
                    )}
                  >
                    <Play className="h-2.5 w-2.5" />
                    {resp?.loading ? "running" : "run"}
                  </button>
                </div>

                {/* Response */}
                {resp && !resp.loading ? (
                  <div className="mt-2 overflow-hidden rounded border border-border/70 bg-popover">
                    <div className="flex items-center justify-between border-b border-border/60 px-2 py-1">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        status{" "}
                        <span
                          className={cn(
                            "font-medium",
                            resp.status >= 200 && resp.status < 300
                              ? "text-primary"
                              : "text-destructive",
                          )}
                        >
                          {resp.status || "—"}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => copyText(`${ep.id}-resp`, resp.body)}
                        className="inline-flex items-center gap-1 rounded px-1 font-mono text-[9px] text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="h-2.5 w-2.5" />
                        {copied === `${ep.id}-resp` ? "copied" : "copy"}
                      </button>
                    </div>
                    <pre className="max-h-60 overflow-auto p-2 font-mono text-[10px] leading-relaxed text-popover-foreground">
                      {resp.body || "// (empty)"}
                    </pre>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function MethodTag({ method }: { method: Method }) {
  const styles =
    method === "GET"
      ? "border-primary/40 text-primary"
      : method === "POST"
        ? "border-amber-500/40 text-amber-400"
        : "border-blue-500/40 text-blue-400"
  return (
    <span
      className={cn(
        "inline-flex w-11 shrink-0 justify-center rounded-sm border bg-background/40 px-1 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider",
        styles,
      )}
    >
      {method}
    </span>
  )
}
