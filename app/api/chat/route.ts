import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai"
import { z } from "zod"
import {
  getStore,
  getSession,
  saveSession,
  recomputeTotals,
  searchCatalog,
  type CheckoutLineItem,
  type CheckoutSession,
} from "@/lib/store-cache"
import { formatPrice } from "@/lib/shopify"

export const maxDuration = 60

type Body = {
  messages: UIMessage[]
  storeDomain?: string
}

/* ----------------------------- Tool definitions ---------------------------- */

function buildTools(storeDomain: string) {
  const snapshot = getStore(storeDomain)

  const search_catalog = tool({
    description:
      "Search the merchant's catalog for products matching a buyer's intent. Returns at most 6 matching products with image, price, variants. Always call this BEFORE recommending or showing any product.",
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "Free-text search query like 'blue silk kurta' or 'sneakers for running'.",
        ),
      max_price: z
        .number()
        .nullable()
        .describe("Maximum price in major currency units (e.g. rupees or dollars). null if not specified."),
      min_price: z
        .number()
        .nullable()
        .describe("Minimum price in major currency units. null if not specified."),
      category: z
        .string()
        .nullable()
        .describe("Optional category filter, e.g. 'kurta', 'shoes'. null if not specified."),
    }),
    execute: async ({ query, max_price, min_price, category }) => {
      if (!snapshot) {
        return { error: "Store not ingested. Tell the buyer to reconnect." }
      }
      const items = searchCatalog(snapshot.items, {
        query,
        maxPrice: max_price ?? undefined,
        minPrice: min_price ?? undefined,
        category: category ?? undefined,
        limit: 6,
      })
      return {
        currency: snapshot.currency,
        count: items.length,
        items: items.map((i) => ({
          id: i.id,
          title: i.title,
          brand: i.brand,
          category: i.category,
          price_minor: i.price,
          price_display: formatPrice(i.price, snapshot.currency),
          original_price_display: i.original_price
            ? formatPrice(i.original_price, snapshot.currency)
            : null,
          image_url: i.image_url,
          handle: i.handle,
          tags: i.tags.slice(0, 6),
          variants: i.variants.map((v) => ({
            id: v.id,
            title: v.title,
            available: v.available,
            options: v.options,
          })),
        })),
      }
    },
  })

  const create_checkout_session = tool({
    description:
      "Create a checkout session with one or more selected variants. Use this once the buyer confirms what they want. Returns a session id, line items, subtotal and total.",
    inputSchema: z.object({
      line_items: z
        .array(
          z.object({
            product_id: z.string(),
            variant_id: z.string(),
            quantity: z.number().int().min(1).default(1),
          }),
        )
        .min(1),
    }),
    execute: async ({ line_items }) => {
      if (!snapshot) return { error: "Store not ingested." }
      const lis: CheckoutLineItem[] = []
      for (const li of line_items) {
        const product = snapshot.items.find((i) => i.id === li.product_id)
        if (!product) continue
        const variant =
          product.variants.find((v) => v.id === li.variant_id) ||
          product.variants[0]
        if (!variant) continue
        lis.push({
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
      if (lis.length === 0) {
        return { error: "No matching products for the given ids." }
      }

      const id = `cs_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
      const session: CheckoutSession = {
        id,
        storeDomain: snapshot.domain,
        state: "ready_for_complete",
        currency: snapshot.currency,
        line_items: lis,
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
      return summarizeSession(session)
    },
  })

  const apply_discount = tool({
    description:
      "Apply a discount code to an existing checkout session. Valid demo codes: WELCOME10 (10% off), FLAT500 (₹500/$5 off), FREESHIP (free shipping).",
    inputSchema: z.object({
      session_id: z.string(),
      code: z.string(),
    }),
    execute: async ({ session_id, code }) => {
      const s = getSession(session_id)
      if (!s) return { error: "Session not found." }
      const c = code.trim().toUpperCase()
      let amount = 0
      let freeShipping = false
      if (c === "WELCOME10") amount = Math.round(s.subtotal * 0.1)
      else if (c === "FLAT500")
        amount = Math.min(s.currency === "INR" ? 50000 : 500, s.subtotal)
      else if (c === "FREESHIP") freeShipping = true
      else
        return {
          error: `Invalid code "${code}". Try WELCOME10, FLAT500 or FREESHIP.`,
        }

      s.discount_code = c
      s.discount_amount = amount
      if (freeShipping) s.shipping_estimate = 0
      recomputeTotals(s)
      saveSession(s)
      return summarizeSession(s)
    },
  })

  const complete_order = tool({
    description:
      "Complete the checkout session and place the order. Only call this after the buyer has explicitly confirmed they want to place the order.",
    inputSchema: z.object({
      session_id: z.string(),
    }),
    execute: async ({ session_id }) => {
      const s = getSession(session_id)
      if (!s) return { error: "Session not found." }
      if (s.line_items.length === 0)
        return { error: "Cannot complete an empty session." }
      const orderId = `ORD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
      s.state = "completed"
      s.completed_at = Date.now()
      s.order_id = orderId
      saveSession(s)
      return {
        order_id: orderId,
        state: s.state,
        total_display: formatPrice(s.total, s.currency),
        estimated_delivery: s.shipping_eta,
        message:
          "Order placed. The buyer would normally be redirected to Shopify checkout for payment.",
      }
    },
  })

  return {
    search_catalog,
    create_checkout_session,
    apply_discount,
    complete_order,
  }
}

function summarizeSession(s: CheckoutSession) {
  return {
    session_id: s.id,
    state: s.state,
    currency: s.currency,
    line_items: s.line_items.map((li) => ({
      product_id: li.product_id,
      variant_id: li.variant_id,
      product_title: li.product_title,
      variant_title: li.variant_title,
      image_url: li.image_url,
      quantity: li.quantity,
      unit_price_display: formatPrice(li.unit_price, s.currency),
      line_total_display: formatPrice(li.unit_price * li.quantity, s.currency),
    })),
    discount_code: s.discount_code,
    discount_display: s.discount_amount
      ? formatPrice(s.discount_amount, s.currency)
      : null,
    shipping_display: formatPrice(s.shipping_estimate, s.currency),
    shipping_eta: s.shipping_eta,
    subtotal_display: formatPrice(s.subtotal, s.currency),
    total_display: formatPrice(s.total, s.currency),
  }
}

/* ----------------------------------- POST ---------------------------------- */

export async function POST(req: Request) {
  const body = (await req.json()) as Body
  const storeDomain = body.storeDomain

  if (!storeDomain) {
    return new Response("storeDomain is required", { status: 400 })
  }
  const snapshot = getStore(storeDomain)
  if (!snapshot) {
    return new Response(
      `Store ${storeDomain} not ingested. POST /api/ingest first.`,
      { status: 404 },
    )
  }

  const tools = buildTools(storeDomain)

  const system = `You are AI Shelf, a sharp shopping assistant embedded in ${snapshot.storeName}'s storefront.
Your job is to discover relevant products from THIS catalog only, help the buyer pick variants, and complete checkout — all in chat.

Rules:
- Always call the search_catalog tool before recommending a product. Never invent products.
- The catalog has ${snapshot.items.length} products in ${snapshot.currency}. Currency formatting is handled by tools — surface the *_display strings as-is.
- When recommending, mention 2–4 of the strongest matches in 1–2 short sentences each. Be specific about why it fits.
- When the buyer says "I'll take the X" or similar, call create_checkout_session with the right product_id and variant_id.
- If they ask for discounts, mention WELCOME10, FLAT500 or FREESHIP and apply via apply_discount.
- Only call complete_order after explicit confirmation ("place order", "confirm", "go ahead").
- Keep responses tight: short sentences, no bullet salads, no markdown headers. Use a friendly but concise tone.
- After tool calls return, write one short sentence summarizing what happened. The UI renders the products and checkout cards from the tool output — do NOT paste raw JSON or describe the cards in detail.`

  const result = streamText({
    model: "anthropic/claude-opus-4.6",
    system,
    messages: await convertToModelMessages(body.messages),
    tools,
    stopWhen: stepCountIs(8),
  })

  return result.toUIMessageStreamResponse()
}
