import { getStore, searchCatalog } from "@/lib/store-cache"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const store = url.searchParams.get("store")
  const q = url.searchParams.get("q") || ""
  const maxPriceParam = url.searchParams.get("max_price")
  const minPriceParam = url.searchParams.get("min_price")
  const category = url.searchParams.get("category") || undefined
  const limit = Number(url.searchParams.get("limit") || 6)

  if (!store) {
    return Response.json({ error: "Missing ?store" }, { status: 400 })
  }
  const snapshot = getStore(store)
  if (!snapshot) {
    return Response.json({ error: "Store not found" }, { status: 404 })
  }

  const items = searchCatalog(snapshot.items, {
    query: q,
    maxPrice: maxPriceParam ? Number(maxPriceParam) : undefined,
    minPrice: minPriceParam ? Number(minPriceParam) : undefined,
    category,
    limit,
  })

  return Response.json({
    currency: snapshot.currency,
    count: items.length,
    items,
  })
}
