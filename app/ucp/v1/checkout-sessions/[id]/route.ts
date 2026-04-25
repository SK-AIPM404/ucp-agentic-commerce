import { getSession, recomputeTotals, saveSession } from "@/lib/store-cache"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const s = getSession(id)
  if (!s) return Response.json({ error: "Not found" }, { status: 404 })
  return Response.json(s)
}

type UpdateBody = {
  discount_code?: string | null
  shipping_estimate?: number
  shipping_eta?: string
}

/**
 * Toy discount engine — fixed codes for the demo.
 *  WELCOME10 = 10% off subtotal
 *  FLAT500   = ₹500 / $5 off
 *  FREESHIP  = removes shipping_estimate
 */
function applyDiscount(
  subtotal: number,
  code: string,
): { amount: number; freeShipping: boolean } {
  const c = code.trim().toUpperCase()
  if (c === "WELCOME10") return { amount: Math.round(subtotal * 0.1), freeShipping: false }
  if (c === "FLAT500") return { amount: Math.min(50000, subtotal), freeShipping: false }
  if (c === "FREESHIP") return { amount: 0, freeShipping: true }
  return { amount: 0, freeShipping: false }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const s = getSession(id)
  if (!s) return Response.json({ error: "Not found" }, { status: 404 })

  const body = (await req.json()) as UpdateBody

  if (body.shipping_estimate !== undefined) {
    s.shipping_estimate = body.shipping_estimate
  }
  if (body.shipping_eta) s.shipping_eta = body.shipping_eta

  if (body.discount_code !== undefined) {
    if (!body.discount_code) {
      s.discount_code = null
      s.discount_amount = 0
    } else {
      // recompute subtotal first
      recomputeTotals(s)
      const { amount, freeShipping } = applyDiscount(s.subtotal, body.discount_code)
      if (amount === 0 && !freeShipping) {
        return Response.json(
          { error: `Invalid discount code: ${body.discount_code}`, session: s },
          { status: 400 },
        )
      }
      s.discount_code = body.discount_code.toUpperCase()
      s.discount_amount = amount
      if (freeShipping) s.shipping_estimate = 0
    }
  }

  recomputeTotals(s)
  saveSession(s)
  return Response.json(s)
}
