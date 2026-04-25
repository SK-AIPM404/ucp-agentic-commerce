import { getSession, resolveStore, saveSession } from "@/lib/store-cache"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const s = getSession(id)
  if (!s) return Response.json({ error: "Session not found" }, { status: 404 })
  if (s.state === "completed") return Response.json(s)
  if (s.line_items.length === 0) {
    return Response.json(
      { error: "No line items in session" },
      { status: 400 },
    )
  }

  const snapshot = await resolveStore(s.storeDomain)
  const orderId = `ORD-${Math.random().toString(36).slice(2, 8).toUpperCase()}${Date.now()
    .toString(36)
    .toUpperCase()
    .slice(-3)}`

  s.state = "completed"
  s.completed_at = Date.now()
  s.order_id = orderId
  // Continue URL points to the brand's actual cart so a real Shopify checkout
  // can take over for payment in production. For the demo we just record it.
  s.continue_url = snapshot ? `${snapshot.storeUrl}/cart` : s.continue_url
  saveSession(s)

  return Response.json({
    ...s,
    confirmation: {
      order_id: orderId,
      estimated_delivery: s.shipping_eta,
      tracking_url: null,
    },
  })
}
