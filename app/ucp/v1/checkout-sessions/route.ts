import {
  resolveStore,
  saveSession,
  recomputeTotals,
  type CheckoutSession,
  type CheckoutLineItem,
} from "@/lib/store-cache"

type IncomingLine = {
  product_id: string
  variant_id?: string
  quantity?: number
}

export async function POST(req: Request) {
  const url = new URL(req.url)
  const store = url.searchParams.get("store")
  const body = (await req.json()) as { line_items?: IncomingLine[] }

  if (!store) {
    return Response.json({ error: "Missing ?store" }, { status: 400 })
  }
  const snapshot = await resolveStore(store)
  if (!snapshot) {
    return Response.json({ error: "Store not found" }, { status: 404 })
  }

  const incoming = body.line_items || []
  const lineItems: CheckoutLineItem[] = []

  for (const li of incoming) {
    const product = snapshot.items.find((i) => i.id === li.product_id)
    if (!product) continue
    const variant =
      product.variants.find((v) => v.id === li.variant_id) ||
      product.variants[0]
    if (!variant) continue
    lineItems.push({
      product_id: product.id,
      variant_id: variant.id,
      product_title: product.title,
      variant_title: variant.title,
      image_url: product.image_url,
      quantity: Math.max(1, li.quantity || 1),
      unit_price: variant.price,
      handle: product.handle,
    })
  }

  const id = `cs_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(
    36,
  )}`

  const session: CheckoutSession = {
    id,
    storeDomain: snapshot.domain,
    state: lineItems.length ? "ready_for_complete" : "incomplete",
    currency: snapshot.currency,
    line_items: lineItems,
    discount_code: null,
    discount_amount: 0,
    shipping_estimate: 0,
    shipping_eta: "3–5 business days",
    subtotal: 0,
    total: 0,
    continue_url: `${snapshot.storeUrl}/cart`,
    created_at: Date.now(),
    completed_at: null,
    order_id: null,
  }
  recomputeTotals(session)
  saveSession(session)

  return Response.json(session)
}
