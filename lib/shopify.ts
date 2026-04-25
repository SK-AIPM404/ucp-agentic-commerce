/**
 * Shopify products.json fetcher and UCP catalog transformer.
 * Public Shopify stores expose /products.json with no auth.
 */

export type ShopifyVariant = {
  id: number
  title: string
  price: string
  compare_at_price: string | null
  sku: string
  available: boolean
  option1: string | null
  option2: string | null
  option3: string | null
  inventory_quantity?: number
  requires_shipping?: boolean
}

export type ShopifyImage = {
  src: string
  width?: number
  height?: number
  variant_ids?: number[]
}

export type ShopifyOption = {
  name: string
  values: string[]
}

export type ShopifyProduct = {
  id: number
  title: string
  handle: string
  body_html: string
  vendor: string
  product_type: string
  tags: string | string[]
  variants: ShopifyVariant[]
  options: ShopifyOption[]
  images: ShopifyImage[]
  image: ShopifyImage | null
  published_at?: string
}

export type UCPVariant = {
  id: string
  title: string
  price: number // smallest currency unit (paise/cents)
  original_price: number | null
  available: boolean
  options: { name: string; value: string }[]
}

export type UCPItem = {
  id: string
  title: string
  description: string
  brand: string
  category: string
  tags: string[]
  price: number // lowest variant in smallest currency unit
  original_price: number | null
  available: boolean
  image_url: string | null
  url: string
  handle: string
  variants: UCPVariant[]
}

export type BrandProfile = {
  /** Country/region the brand is rooted in, e.g. "India", "USA", "UK". */
  origin: string
  /** Short positioning, e.g. "luxury Ayurvedic skincare". */
  positioning: string
  /** Top buyer-facing categories: ["serums", "ubtans", "face oils"]. */
  signature_categories: string[]
  /** Approximate price tier label, e.g. "premium ₹1,000–₹3,000". */
  price_tier: string
}

export type StoreAnalysis = {
  tagline: string // 6–10 word brand summary, derived from real catalog
  prompts: string[] // 5 brand-specific suggested prompts
  brand?: BrandProfile
}

export type StoreSnapshot = {
  domain: string // myshopify domain or canonical
  storeUrl: string // full https URL
  storeName: string
  currency: string // "INR" | "USD" — best guess from products
  ingestedAt: number
  items: UCPItem[]
  analysis?: StoreAnalysis
}

/** Normalize raw user input into a clean origin.
 * Accepts: bare domains, https URLs, markdown-formatted links like
 * "[www.allbirds.com](http://www.allbirds.com)", trailing slashes, and paths.
 * Strips trailing slashes and paths so callers can always append /products.json.
 */
export function normalizeStoreUrl(input: string): string {
  let url = (input ?? "").trim()
  if (!url) throw new Error("Please enter a store URL.")

  // Strip markdown link wrapper "[label](href)" → take the href.
  const md = url.match(/^\[[^\]]+\]\((https?:\/\/[^)]+)\)$/i)
  if (md) url = md[1]

  // Strip surrounding angle brackets, quotes, or whitespace.
  url = url.replace(/^[<"'\s]+|[>"'\s]+$/g, "")

  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url
  }
  const u = new URL(url)
  return `${u.protocol}//${u.hostname}${u.port ? ":" + u.port : ""}`
}

/** Build the ordered list of candidate origins to try for a given user input.
 * 1. The user's actual domain as given (e.g. https://allbirds.com).
 * 2. The myshopify.com variant derived from the brand label
 *    (e.g. https://allbirds.myshopify.com).
 * Duplicates and the literal "myshopify.com" host are filtered out.
 */
export function buildOriginCandidates(input: string): string[] {
  const primary = normalizeStoreUrl(input)
  const candidates = new Set<string>([primary])

  try {
    const host = new URL(primary).hostname.toLowerCase()
    if (!host.endsWith(".myshopify.com")) {
      // Derive brand label: drop "www.", drop public TLD parts, take first label.
      const noWww = host.replace(/^www\./, "")
      const brand = noWww.split(".")[0]
      if (brand && brand !== "myshopify") {
        candidates.add(`https://${brand}.myshopify.com`)
      }
    }
  } catch {
    /* ignore */
  }

  return [...candidates]
}

/** Strip simple HTML tags to derive plain text descriptions. */
function stripHtml(html: string): string {
  if (!html) return ""
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

function toMinor(priceStr: string | null | undefined): number {
  if (!priceStr) return 0
  const f = Number.parseFloat(priceStr)
  if (Number.isNaN(f)) return 0
  return Math.round(f * 100)
}

function inferStoreName(storeUrl: string): string {
  try {
    const host = new URL(storeUrl).hostname.replace(/^www\./, "")
    // strip myshopify.com → first label
    const base = host.replace(/\.myshopify\.com$/, "")
    const root = base.split(".")[0]
    return root
      .split("-")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ")
  } catch {
    return "Store"
  }
}

/** Authoritative currency lookup using Shopify's public /cart.js endpoint.
 * Every Shopify storefront exposes this — no auth needed — and the response
 * includes the shop's true presentment currency, which products.json does not.
 * Falls back to TLD-based heuristic if /cart.js is unreachable.
 */
async function detectCurrency(
  origin: string,
  signal?: AbortSignal,
): Promise<string> {
  // Try /cart.js first — fast, public, authoritative.
  try {
    const res = await fetch(`${origin}/cart.js`, {
      signal,
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (compatible; Caravel/1.0; +https://caravel.commerce)",
      },
      redirect: "follow",
      cache: "no-store",
    })
    if (res.ok) {
      const text = await res.text()
      try {
        const data = JSON.parse(text) as {
          currency?: string
          presentment_currency?: string
        }
        const cur = data.presentment_currency || data.currency
        if (cur && /^[A-Z]{3}$/.test(cur)) return cur
      } catch {
        /* fall through */
      }
    }
  } catch {
    /* fall through */
  }

  // Fallback: TLD/host heuristic. Indian-domain heuristic catches `.in`,
  // ".in.", and "myshopify.com" subdomains we can't introspect.
  const host = origin.toLowerCase()
  if (/\.in($|\/|:)/.test(host)) return "INR"
  return "USD"
}

export function transformProductsToUCP(
  products: ShopifyProduct[],
): UCPItem[] {
  return products.map((p) => {
    const tags = Array.isArray(p.tags)
      ? p.tags
      : typeof p.tags === "string"
        ? p.tags.split(",").map((t) => t.trim()).filter(Boolean)
        : []

    const optionNames = (p.options || []).map((o) => o.name)

    const variants: UCPVariant[] = (p.variants || []).map((v) => {
      const optVals = [v.option1, v.option2, v.option3]
      const options = optionNames
        .map((name, i) => ({ name, value: optVals[i] || "" }))
        .filter((o) => o.value)

      return {
        id: String(v.id),
        title: v.title,
        price: toMinor(v.price),
        original_price: v.compare_at_price ? toMinor(v.compare_at_price) : null,
        available: !!v.available,
        options,
      }
    })

    const lowest = variants.reduce(
      (min, v) => (min === null || v.price < min ? v.price : min),
      null as number | null,
    )
    const lowestOrig = variants.reduce(
      (min, v) =>
        v.original_price !== null && (min === null || v.original_price < min)
          ? v.original_price
          : min,
      null as number | null,
    )
    const anyAvailable = variants.some((v) => v.available)
    const firstImage = p.image?.src || p.images?.[0]?.src || null

    return {
      id: String(p.id),
      title: p.title,
      description: stripHtml(p.body_html).slice(0, 600),
      brand: p.vendor || "",
      category: p.product_type || "",
      tags,
      price: lowest ?? 0,
      original_price: lowestOrig,
      available: anyAvailable,
      image_url: firstImage,
      url: `/products/${p.handle}`,
      handle: p.handle,
      variants,
    }
  })
}

/** Fetch a public Shopify catalog. Pulls page 1 with limit=250; if page 1
 * returns exactly 250 products, also pulls page 2. Hard-capped at 500 total.
 */
const MAX_PRODUCTS = 500
const PAGE_SIZE = 250

/** Fetch products.json from a single candidate origin. Returns null on
 * 4xx/non-JSON so callers can try the next candidate; throws on transport
 * errors only when no candidate has succeeded.
 */
async function fetchProductsFromOrigin(
  origin: string,
  maxPages: number,
  signal?: AbortSignal,
): Promise<ShopifyProduct[] | null> {
  const all: ShopifyProduct[] = []
  for (let page = 1; page <= maxPages; page++) {
    const url = `${origin}/products.json?limit=${PAGE_SIZE}&page=${page}`
    let res: Response
    try {
      res = await fetch(url, {
        signal,
        headers: {
          Accept: "application/json",
          // Some Shopify edges 403 the default Node UA.
          "User-Agent":
            "Mozilla/5.0 (compatible; Caravel/1.0; +https://caravel.commerce)",
        },
        redirect: "follow",
        cache: "no-store",
      })
    } catch {
      // Network/DNS error on this candidate — let the caller try the next.
      return null
    }

    if (!res.ok) return null

    const text = await res.text()
    let data: { products?: ShopifyProduct[] }
    try {
      data = JSON.parse(text) as { products?: ShopifyProduct[] }
    } catch {
      // Not JSON — site isn't Shopify, try next candidate.
      return null
    }
    const products = data.products || []
    all.push(...products)

    // Page-2 rule: only fetch a second page if page 1 returned exactly PAGE_SIZE.
    if (products.length < PAGE_SIZE) break
    if (all.length >= MAX_PRODUCTS) break
  }
  if (all.length > MAX_PRODUCTS) all.length = MAX_PRODUCTS
  return all
}

export async function fetchShopifyCatalog(
  storeUrl: string,
  opts?: { maxPages?: number; signal?: AbortSignal },
): Promise<{ snapshot: StoreSnapshot; raw: ShopifyProduct[] }> {
  const maxPages = Math.min(opts?.maxPages ?? 2, MAX_PRODUCTS / PAGE_SIZE)

  // Try the user's domain first, then the derived myshopify.com variant.
  const candidates = buildOriginCandidates(storeUrl)

  let resolvedOrigin: string | null = null
  let raw: ShopifyProduct[] = []

  for (const origin of candidates) {
    const products = await fetchProductsFromOrigin(
      origin,
      maxPages,
      opts?.signal,
    )
    if (products && products.length > 0) {
      resolvedOrigin = origin
      raw = products
      break
    }
  }

  if (!resolvedOrigin) {
    throw new Error(
      `Could not find a public Shopify catalog at ${candidates.join(" or ")}. Confirm this site is powered by Shopify.`,
    )
  }

  const items = transformProductsToUCP(raw)
  const currency = await detectCurrency(resolvedOrigin, opts?.signal)
  // Plain hostname only — no port, no protocol, no markdown wrapping.
  const domain = new URL(resolvedOrigin).hostname

  const snapshot: StoreSnapshot = {
    domain,
    storeUrl: resolvedOrigin,
    storeName: inferStoreName(resolvedOrigin),
    currency,
    ingestedAt: Date.now(),
    items,
  }
  return { snapshot, raw }
}

const SYMBOLS: Record<string, string> = {
  USD: "$",
  INR: "₹",
  GBP: "£",
  EUR: "€",
  AUD: "A$",
  CAD: "C$",
  JPY: "¥",
  AED: "د.إ ",
  SGD: "S$",
}

/** Format a minor-unit integer to a display string. Uses locale-aware
 * thousands grouping — Indian (lakh/crore) for INR, Western for everything
 * else. JPY is rendered with no decimals.
 */
export function formatPrice(minor: number, currency: string): string {
  const symbol = SYMBOLS[currency] ?? `${currency} `
  const isJPY = currency === "JPY"
  const major = isJPY ? Math.round(minor / 100) : minor / 100

  if (currency === "INR") {
    // Indian numbering: 1,00,000 not 100,000
    const formatted = new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(major)
    return `${symbol}${formatted}`
  }

  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: isJPY ? 0 : 2,
    maximumFractionDigits: isJPY ? 0 : 2,
  }).format(major)
  return `${symbol}${formatted}`
}
