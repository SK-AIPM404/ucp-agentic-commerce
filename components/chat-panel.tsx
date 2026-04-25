"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { ArrowUp, Loader2 } from "lucide-react"
import { ProductCard, type ProductCardItem } from "@/components/product-card"
import {
  CheckoutCard,
  type CheckoutSessionView,
} from "@/components/checkout-card"
import { cn } from "@/lib/utils"

type Props = {
  storeDomain: string
}

const TOOL_LABELS: Record<string, string> = {
  search_catalog: "Querying catalog",
  create_checkout_session: "Creating checkout session",
  apply_discount: "Applying discount",
  complete_order: "Placing order",
}

/* ------------------------ Helpers to read tool parts ----------------------- */

type ToolPart = {
  type: string
  toolCallId?: string
  state?: string
  input?: unknown
  output?: unknown
}

function isToolPart(part: { type: string }): part is ToolPart {
  return part.type.startsWith("tool-")
}

function getToolName(part: { type: string }) {
  return part.type.replace(/^tool-/, "")
}

/* ------------------------------- Chat panel ------------------------------- */

export function ChatPanel({ storeDomain }: Props) {
  const [input, setInput] = useState("")
  const [pendingTool, setPendingTool] = useState(false)

  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ messages }) => ({
        body: { messages, storeDomain },
      }),
    }),
  })

  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, status])

  // Listen for sample prompt clicks from the side rail
  useEffect(() => {
    function onSample(e: Event) {
      const detail = (e as CustomEvent<string>).detail
      if (typeof detail === "string") {
        void sendMessage({ text: detail })
      }
    }
    window.addEventListener("caravel:sample-prompt", onSample as EventListener)
    return () =>
      window.removeEventListener(
        "caravel:sample-prompt",
        onSample as EventListener,
      )
  }, [sendMessage])

  // Greet on first mount
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          parts: [
            {
              type: "text",
              text: `Hi — I'm Caravel for ${storeDomain.replace(/^www\./, "")}. Tell me what you're looking for and I'll find it from the catalog.`,
            },
          ],
        } as UIMessage,
      ])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeDomain])

  const isStreaming = status === "streaming" || status === "submitted"

  function handleSubmit(text: string) {
    const t = text.trim()
    if (!t) return
    setInput("")
    void sendMessage({ text: t })
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages scroll area */}
      <div
        ref={scrollRef}
        className="chat-scroll flex-1 overflow-y-auto px-4 py-6 md:px-8"
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-5">
          {messages.map((m) => (
            <MessageRow
              key={m.id}
              message={m}
              isStreaming={isStreaming}
              storeDomain={storeDomain}
              onAddToCart={(productId, variantId) => {
                handleSubmit(
                  `Add product_id ${productId} variant_id ${variantId} to a checkout session.`,
                )
              }}
              onApplyCode={(sessionId, code) => {
                setPendingTool(true)
                handleSubmit(
                  `Apply discount code ${code} to session_id ${sessionId}.`,
                )
              }}
              onConfirmOrder={(sessionId) => {
                setPendingTool(true)
                handleSubmit(`Confirm and complete session_id ${sessionId}.`)
              }}
              pendingTool={pendingTool}
              onToolDone={() => setPendingTool(false)}
            />
          ))}

          {isStreaming &&
            messages[messages.length - 1]?.role === "user" && (
              <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                Thinking…
              </div>
            )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-background/80 px-4 py-3 backdrop-blur md:px-8">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSubmit(input)
          }}
          className="mx-auto flex max-w-2xl items-end gap-2"
        >
          <div className="flex-1 rounded-xl border border-border bg-input/40 focus-within:border-primary/60">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit(input)
                }
              }}
              rows={1}
              placeholder="Ask for anything in the catalog…"
              disabled={isStreaming}
              className="block w-full resize-none bg-transparent px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-60"
            />
          </div>
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className={cn(
              "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
            aria-label="Send"
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </form>
        <div className="mx-auto mt-2 max-w-2xl text-center font-mono text-[10px] text-muted-foreground/70">
          Powered by UCP · Anthropic Claude via Vercel AI Gateway
        </div>
      </div>
    </div>
  )
}

/* ------------------------------ Message row ------------------------------ */

function MessageRow({
  message,
  isStreaming,
  onAddToCart,
  onApplyCode,
  onConfirmOrder,
  pendingTool,
  onToolDone,
}: {
  message: UIMessage
  isStreaming: boolean
  storeDomain: string
  onAddToCart: (productId: string, variantId: string) => void
  onApplyCode: (sessionId: string, code: string) => void
  onConfirmOrder: (sessionId: string) => void
  pendingTool: boolean
  onToolDone: () => void
}) {
  const isUser = message.role === "user"
  const parts = message.parts || []

  // After tool calls finish, clear the pending state
  useEffect(() => {
    const hasOutput = parts.some(
      (p) => isToolPart(p) && p.state === "output-available",
    )
    if (hasOutput && pendingTool) onToolDone()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts.length])

  // Combine consecutive text parts
  const textBlocks = useMemo(
    () =>
      parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join(""),
    [parts],
  )

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-card px-4 py-2.5 text-sm text-card-foreground">
          {textBlocks}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Tool status lines */}
      {parts.map((part, i) => {
        if (!isToolPart(part)) return null
        const name = getToolName(part)
        const label = TOOL_LABELS[name] || name
        const done = part.state === "output-available"
        return (
          <div
            key={part.toolCallId || `tool-${i}`}
            className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground"
          >
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                done ? "bg-primary" : "bg-amber-400 animate-pulse",
              )}
            />
            <span>
              {label}
              {done ? " · done" : "…"}
            </span>
          </div>
        )
      })}

      {/* Text response */}
      {textBlocks ? (
        <div className="max-w-full rounded-2xl rounded-bl-md bg-secondary/40 px-4 py-2.5 text-sm leading-relaxed text-foreground">
          {textBlocks}
          {isStreaming && message.id !== "welcome" ? <span className="caret" /> : null}
        </div>
      ) : null}

      {/* Render tool outputs as cards */}
      {parts.map((part, i) => {
        if (!isToolPart(part)) return null
        if (part.state !== "output-available") return null
        const name = getToolName(part)
        const out = part.output as Record<string, unknown> | null
        if (!out) return null

        if (name === "search_catalog") {
          const items = (out.items as ProductCardItem[]) || []
          if (items.length === 0) {
            return (
              <div
                key={part.toolCallId || `out-${i}`}
                className="rounded-lg border border-border bg-card/50 px-3 py-2 font-mono text-xs text-muted-foreground"
              >
                No matches in catalog. Try a different query.
              </div>
            )
          }
          return (
            <div
              key={part.toolCallId || `out-${i}`}
              className="grid grid-cols-2 gap-3 sm:grid-cols-3"
            >
              {items.slice(0, 6).map((item) => (
                <ProductCard
                  key={item.id}
                  item={item}
                  onAdd={onAddToCart}
                  disabled={isStreaming}
                />
              ))}
            </div>
          )
        }

        if (
          name === "create_checkout_session" ||
          name === "apply_discount"
        ) {
          if ((out as { error?: string }).error) {
            return (
              <div
                key={part.toolCallId || `out-${i}`}
                className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive-foreground"
              >
                {(out as { error: string }).error}
              </div>
            )
          }
          return (
            <CheckoutCard
              key={part.toolCallId || `out-${i}`}
              session={out as unknown as CheckoutSessionView}
              onConfirm={onConfirmOrder}
              onApplyCode={onApplyCode}
              pending={pendingTool}
            />
          )
        }

        if (name === "complete_order") {
          if ((out as { error?: string }).error) {
            return (
              <div
                key={part.toolCallId || `out-${i}`}
                className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-xs"
              >
                {(out as { error: string }).error}
              </div>
            )
          }
          const conf = out as {
            order_id: string
            total_display: string
            estimated_delivery: string
          }
          return (
            <div
              key={part.toolCallId || `out-${i}`}
              className="overflow-hidden rounded-xl border border-primary/30 bg-card text-card-foreground"
            >
              <div className="border-b border-border/60 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    order confirmed
                  </span>
                </div>
              </div>
              <div className="space-y-1.5 px-4 py-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Order ID</span>
                  <span className="font-mono">{conf.order_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-medium">{conf.total_display}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivery</span>
                  <span>{conf.estimated_delivery}</span>
                </div>
              </div>
            </div>
          )
        }

        return null
      })}
    </div>
  )
}
