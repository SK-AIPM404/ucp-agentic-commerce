/**
 * Process-wide in-memory cache for ingested store snapshots and
 * checkout sessions. This is the simplest possible backend for the
 * hackathon demo — no external DB required.
 *
 * Keyed by store domain (host).
 */

import type { StoreSnapshot, UCPItem } from "./shopify"

type Globals = typeof globalThis & {
  __aiShelfStores?: Map<string, StoreSnapshot>
  __aiShelfSessions?: Map<string, CheckoutSession>
}

const g = globalThis as Globals

export function getStores(): Map<string, StoreSnapshot> {
  if (!g.__aiShelfStores) g.__aiShelfStores = new Map()
  return g.__aiShelfStores
}

export function saveStore(snapshot: StoreSnapshot): void {
  getStores().set(snapshot.domain, snapshot)
}

export function getStore(domain: string): StoreSnapshot | undefined {
  return getStores().get(domain)
}

export function getStoreByUrl(storeUrl: string): StoreSnapshot | undefined {
  try {
    const host = new URL(storeUrl).host
    return getStore(host)
  } catch {
    return undefined
  }
}

/* -------------------- Checkout sessions -------------------- */

export type CheckoutLineItem = {
  product_id: string
  variant_id: string
  product_title: string
  variant_title: string
  image_url: string | null
  quantity: number
  unit_price: number // minor units
  handle: string
}

export type CheckoutSession = {
  id: string
  storeDomain: string
  state: "incomplete" | "requires_escalation" | "ready_for_complete" | "completed"
  currency: string
  line_items: CheckoutLineItem[]
  discount_code: string | null
  discount_amount: number // minor
  shipping_estimate: number // minor
  shipping_eta: string // human readable
  subtotal: number // minor
  total: number // minor
  continue_url: string | null
  created_at: number
  completed_at: number | null
  order_id: string | null
}

export function getSessions(): Map<string, CheckoutSession> {
  if (!g.__aiShelfSessions) g.__aiShelfSessions = new Map()
  return g.__aiShelfSessions
}

export function saveSession(s: CheckoutSession): void {
  getSessions().set(s.id, s)
}

export function getSession(id: string): CheckoutSession | undefined {
  return getSessions().get(id)
}

export function recomputeTotals(s: CheckoutSession): void {
  s.subtotal = s.line_items.reduce(
    (sum, li) => sum + li.unit_price * li.quantity,
    0,
  )
  s.total = Math.max(
    0,
    s.subtotal - s.discount_amount + s.shipping_estimate,
  )
  if (s.line_items.length === 0) {
    s.state = "incomplete"
  } else if (s.state !== "completed") {
    s.state = "ready_for_complete"
  }
}

/* -------------------- Catalog search -------------------- */

export type SearchFilters = {
  query?: string
  maxPrice?: number // major units (e.g. rupees)
  minPrice?: number
  category?: string
  limit?: number
}

/** Lightweight keyword + filter search over UCP items. */
export function searchCatalog(
  items: UCPItem[],
  filters: SearchFilters,
): UCPItem[] {
  const q = (filters.query || "").toLowerCase().trim()
  const tokens = q.split(/\s+/).filter(Boolean)

  const scored = items
    .filter((item) => item.available)
    .map((item) => {
      let score = 0
      const hay =
        (item.title + " " + item.description + " " + item.brand + " " +
          item.category + " " + item.tags.join(" ")).toLowerCase()

      for (const tok of tokens) {
        if (item.title.toLowerCase().includes(tok)) score += 5
        if (item.tags.some((t) => t.toLowerCase().includes(tok))) score += 4
        if (item.category.toLowerCase().includes(tok)) score += 3
        if (item.brand.toLowerCase().includes(tok)) score += 2
        if (hay.includes(tok)) score += 1
      }

      return { item, score }
    })
    .filter(({ score }) => tokens.length === 0 || score > 0)

  let filtered = scored.map((s) => s.item)

  if (filters.category) {
    const cat = filters.category.toLowerCase()
    filtered = filtered.filter(
      (i) =>
        i.category.toLowerCase().includes(cat) ||
        i.tags.some((t) => t.toLowerCase().includes(cat)),
    )
  }
  if (typeof filters.maxPrice === "number") {
    const cap = filters.maxPrice * 100
    filtered = filtered.filter((i) => i.price <= cap)
  }
  if (typeof filters.minPrice === "number") {
    const floor = filters.minPrice * 100
    filtered = filtered.filter((i) => i.price >= floor)
  }

  // Re-sort using the original scores when query is present
  if (tokens.length > 0) {
    const scoreById = new Map(scored.map((s) => [s.item.id, s.score]))
    filtered.sort(
      (a, b) => (scoreById.get(b.id) || 0) - (scoreById.get(a.id) || 0),
    )
  }

  return filtered.slice(0, filters.limit ?? 6)
}
