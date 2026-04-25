import { fetchShopifyCatalog } from "@/lib/shopify"
import { saveStore } from "@/lib/store-cache"

export const maxDuration = 30

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      storeUrl?: string
    }
    const storeUrl = (body.storeUrl ?? "").trim()

    if (!storeUrl) {
      return Response.json(
        { error: "Please enter a store URL." },
        { status: 400 },
      )
    }

    // fetchShopifyCatalog handles:
    //   • normalizing the user's input (markdown, trailing slash, missing protocol)
    //   • trying the given domain first
    //   • falling back to <brand>.myshopify.com if /products.json 404s
    //   • capping at 500 products across two pages of 250
    const { snapshot } = await fetchShopifyCatalog(storeUrl, { maxPages: 2 })
    saveStore(snapshot)

    return Response.json({
      ok: true,
      domain: snapshot.domain,
      storeUrl: snapshot.storeUrl,
      storeName: snapshot.storeName,
      currency: snapshot.currency,
      productCount: snapshot.items.length,
      sampleTitles: snapshot.items.slice(0, 5).map((i) => i.title),
      capabilities: ["catalog", "checkout", "fulfillment"],
      manifestUrl: `/api/well-known/ucp?store=${encodeURIComponent(snapshot.domain)}`,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return Response.json({ error: message }, { status: 400 })
  }
}
