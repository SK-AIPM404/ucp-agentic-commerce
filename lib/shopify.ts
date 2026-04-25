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

export type StoreSnapshot = {
  domain: string // myshopify domain or canonical
  storeUrl: string // full https URL
  storeName: string
  currency: string // "INR" | "USD" — best guess from products
  ingestedAt: number
  items: UCPItem[]
}

/** Normalize raw user input into a clean Shopify origin.
 * Accepts: bare domains, https URLs, markdown-formatted links like
 * "[www.allbirds.com](http://www.allbirds.com)", and trailing slashes/paths.
 */
export function normalizeStoreUrl(input: string): string {
  let url = input.trim()
  if (!url) throw new Error("Empty URL")

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

/** Heuristic: detect currency from store. Defaults to INR. */
function inferCurrency(_products: ShopifyProduct[], storeUrl: string): string {
  // Most demo stores will be USD; allbirds, kith etc. — but our spec leans INR.
  // Use simple host hint.
  const host = storeUrl.toLowerCase()
  if (host.endsWith(".in") || host.includes(".in/")) return "INR"
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

export async function fetchShopifyCatalog(
  storeUrl: string,
  opts?: { maxPages?: number; signal?: AbortSignal },
): Promise<{ snapshot: StoreSnapshot; raw: ShopifyProduct[] }> {
  const maxPages = Math.min(opts?.maxPages ?? 2, MAX_PRODUCTS / PAGE_SIZE)
  const origin = normalizeStoreUrl(storeUrl)

  const all: ShopifyProduct[] = []
  for (let page = 1; page <= maxPages; page++) {
    const url = `${origin}/products.json?limit=${PAGE_SIZE}&page=${page}`
    let res: Response
    try {
      res = await fetch(url, {
        signal: opts?.signal,
        headers: {
          Accept: "application/json",
          // Some Shopify edges 403 the default Node UA.
          "User-Agent":
            "Mozilla/5.0 (compatible; AI-Shelf/1.0; +https://ai-shelf.dev)",
        },
        redirect: "follow",
        cache: "no-store",
      })
    } catch (err) {
      throw new Error(
        `Could not reach ${origin}. ${err instanceof Error ? err.message : ""}`.trim(),
      )
    }

    if (!res.ok) {
      if (page === 1) {
        throw new Error(
          `${origin}/products.json returned ${res.status}. This site may not be a public Shopify store.`,
        )
      }
      break
    }

    const text = await res.text()
    let data: { products?: ShopifyProduct[] }
    try {
      data = JSON.parse(text) as { products?: ShopifyProduct[] }
    } catch {
      throw new Error(
        `${origin}/products.json did not return JSON. This site is likely not powered by Shopify.`,
      )
    }
    const products = data.products || []
    all.push(...products)
    // Stop if this page wasn't full (no more pages to fetch) or we've hit the cap.
    if (products.length < PAGE_SIZE) break
    if (all.length >= MAX_PRODUCTS) break
  }
  // Ensure we never exceed the hard cap.
  if (all.length > MAX_PRODUCTS) all.length = MAX_PRODUCTS

  if (all.length === 0) {
    throw new Error(
      "No products returned. Confirm this is a public Shopify storefront.",
    )
  }

  const items = transformProductsToUCP(all)
  const currency = inferCurrency(all, origin)
  // Plain hostname only — no port, no protocol, no markdown wrapping.
  const domain = new URL(origin).hostname

  const snapshot: StoreSnapshot = {
    domain,
    storeUrl: origin,
    storeName: inferStoreName(origin),
    currency,
    ingestedAt: Date.now(),
    items,
  }
  return { snapshot, raw: all }
}

/** Format a minor-unit integer to a display string. */
export function formatPrice(minor: number, currency: string): string {
  const major = (minor / 100).toFixed(2)
  const symbol =
    currency === "INR" ? "₹" : currency === "USD" ? "$" : currency + " "
  // Add thousands separators
  const [whole, frac] = major.split(".")
  const withSep = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return `${symbol}${withSep}.${frac}`
}
