/**
 * Process-wide cache for ingested store snapshots and checkout sessions.
 *
 * IMPORTANT: On Vercel's serverless runtime, every request can land on a
 * different lambda instance, so a pure in-memory Map is not visible across
 * cold starts. We therefore expose `resolveStore(domain)` which transparently
 * re-ingests the catalog from the live Shopify storefront on a cache miss
 * and warms the local Map for subsequent calls on the same instance.
 *
 * Keyed by store domain (host).
 */

import { fetchShopifyCatalog, type StoreSnapshot, type UCPItem } from "./shopify"

type Globals = typeof globalThis & {
  __aiShelfStores?: Map<string, StoreSnapshot>
  __aiShelfSessions?: Map<string, CheckoutSession>
  __aiShelfInflight?: Map<string, Promise<StoreSnapshot | undefined>>
}

const g = globalThis as Globals

export function getStores(): Map<string, StoreSnapshot> {
  if (!g.__aiShelfStores) g.__aiShelfStores = new Map()
  return g.__aiShelfStores
}

export function saveStore(snapshot: StoreSnapshot): void {
  getStores().set(snapshot.domain, snapshot)
}

/** Synchronous in-memory lookup. Returns undefined on cold lambdas. Prefer
 * `resolveStore` for any code path that runs on the server, since the cache
 * is not durable across serverless invocations. */
export function getStore(domain: string): StoreSnapshot | undefined {
  return getStores().get(domain)
}

/** Async lookup with serverless-safe fallback: if the in-memory cache is
 * empty (cold lambda or freshly-deployed instance), re-ingest the catalog
 * from the live Shopify storefront and warm the cache. Returns `undefined`
 * only if the domain genuinely doesn't expose a Shopify catalog.
 *
 * This is what every API route and the chat handler should call. */
export async function resolveStore(
  domain: string,
): Promise<StoreSnapshot | undefined> {
  const cached = getStores().get(domain)
  if (cached) return cached

  // Coalesce concurrent rehydration requests for the same domain so we don't
  // hit /products.json N times when N tools fire in parallel.
  if (!g.__aiShelfInflight) g.__aiShelfInflight = new Map()
  const inflight = g.__aiShelfInflight
  const existing = inflight.get(domain)
  if (existing) return existing

  const promise = (async () => {
    try {
      const candidate = domain.startsWith("http")
        ? domain
        : `https://${domain}`
      const { snapshot } = await fetchShopifyCatalog(candidate, {
        maxPages: 2,
      })
      saveStore(snapshot)
      return snapshot
    } catch {
      return undefined
    } finally {
      inflight.delete(domain)
    }
  })()

  inflight.set(domain, promise)
  return promise
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
