"use client"

import { CheckCircle2, Loader2, Truck } from "lucide-react"
import { cn } from "@/lib/utils"

export type CheckoutSessionView = {
  session_id: string
  state: "incomplete" | "requires_escalation" | "ready_for_complete" | "completed"
  currency: string
  line_items: {
    product_id: string
    variant_id: string
    product_title: string
    variant_title: string
    image_url: string | null
    quantity: number
    unit_price_display: string
    line_total_display: string
  }[]
  discount_code: string | null
  discount_display: string | null
  shipping_display: string
  shipping_eta: string
  subtotal_display: string
  total_display: string
}

type Props = {
  session: CheckoutSessionView
  onConfirm: (sessionId: string) => void
  onApplyCode: (sessionId: string, code: string) => void
  pending?: boolean
}

export function CheckoutCard({
  session,
  onConfirm,
  onApplyCode,
  pending,
}: Props) {
  const isComplete = session.state === "completed"

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              isComplete ? "bg-primary" : "bg-amber-400",
            )}
          />
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {isComplete ? "order placed" : "checkout summary"}
          </span>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground/80">
          {session.session_id.slice(0, 14)}…
        </span>
      </div>

      <div className="divide-y divide-border/50">
        {session.line_items.map((li) => (
          <div key={li.variant_id} className="flex items-center gap-3 px-4 py-3">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted/30">
              {li.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={li.image_url}
                  alt={li.product_title}
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="line-clamp-1 text-sm font-medium">
                {li.product_title}
              </div>
              <div className="font-mono text-[11px] text-muted-foreground">
                {li.variant_title} · qty {li.quantity}
              </div>
            </div>
            <div className="text-right text-sm font-medium">
              {li.line_total_display}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-1.5 border-t border-border/50 px-4 py-3 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span className="font-mono">{session.subtotal_display}</span>
        </div>
        {session.discount_display ? (
          <div className="flex justify-between" style={{ color: "#1D9E75" }}>
            <span>
              Discount
              {session.discount_code ? (
                <span className="ml-1 font-mono text-[10px] uppercase tracking-wider">
                  {session.discount_code}
                </span>
              ) : null}
            </span>
            <span className="font-mono">−{session.discount_display}</span>
          </div>
        ) : null}
        <div className="flex justify-between text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Truck className="h-3 w-3" />
            Shipping · {session.shipping_eta}
          </span>
          <span className="font-mono">{session.shipping_display}</span>
        </div>
        <div className="mt-2 flex items-baseline justify-between border-t border-border/50 pt-2">
          <span className="text-sm font-medium">Total</span>
          <span className="text-base font-medium">{session.total_display}</span>
        </div>
      </div>

      {!isComplete && !session.discount_code ? (
        <DiscountInput
          onApply={(code) => onApplyCode(session.session_id, code)}
          disabled={pending}
        />
      ) : null}

      <div className="border-t border-border/50 p-3">
        {isComplete ? (
          <div className="flex items-center justify-center gap-2 rounded-md bg-accent px-3 py-2.5 text-sm font-medium text-accent-foreground">
            <CheckCircle2 className="h-4 w-4" />
            Order confirmed · {session.total_display}
          </div>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => onConfirm(session.session_id)}
            className={cn(
              "inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Confirming…
              </>
            ) : (
              <>Confirm order · {session.total_display}</>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

function DiscountInput({
  onApply,
  disabled,
}: {
  onApply: (code: string) => void
  disabled?: boolean
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        const code = String(fd.get("code") || "").trim()
        if (code) onApply(code)
      }}
      className="flex items-center gap-2 border-t border-border/50 px-3 py-2"
    >
      <input
        name="code"
        placeholder="Discount code"
        disabled={disabled}
        className="flex-1 rounded-md border border-border bg-secondary/40 px-2 py-1.5 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none"
      />
      <button
        type="submit"
        disabled={disabled}
        className="rounded-md border border-border bg-secondary/60 px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 disabled:opacity-50"
      >
        Apply
      </button>
    </form>
  )
}
