import { getStore } from "@/lib/store-cache"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const store = url.searchParams.get("store")

  if (!store) {
    return Response.json(
      { error: "Missing ?store=<domain>" },
      { status: 400 },
    )
  }

  const snapshot = getStore(store)
  if (!snapshot) {
    return Response.json(
      { error: `Store ${store} not ingested. POST /api/ingest first.` },
      { status: 404 },
    )
  }

  const origin = `${url.protocol}//${url.host}`

  const manifest = {
    ucp_version: "2026-04-08",
    merchant: {
      id: snapshot.domain,
      name: snapshot.storeName,
      home_url: snapshot.storeUrl,
      currency: snapshot.currency,
    },
    service_endpoint: `${origin}/ucp/v1`,
    capabilities: [
      {
        name: "catalog",
        version: "1.0",
        endpoints: [
          { method: "GET", path: "/catalog/search" },
          { method: "GET", path: "/catalog/products/:id" },
        ],
      },
      {
        name: "checkout",
        version: "1.0",
        endpoints: [
          { method: "POST", path: "/checkout-sessions" },
          { method: "PUT", path: "/checkout-sessions/:id" },
          { method: "POST", path: "/checkout-sessions/:id/complete" },
        ],
      },
      {
        name: "fulfillment",
        version: "1.0",
        endpoints: [{ method: "GET", path: "/orders/:id" }],
      },
    ],
    payment_handlers: [
      {
        type: "shopify_checkout",
        url_template: `${snapshot.storeUrl}/checkouts/{{session_id}}`,
      },
    ],
    catalog_summary: {
      product_count: snapshot.items.length,
      categories: Array.from(
        new Set(
          snapshot.items.map((i) => i.category).filter(Boolean),
        ),
      ).slice(0, 20),
    },
    generated_at: new Date(snapshot.ingestedAt).toISOString(),
  }

  return Response.json(manifest, {
    headers: {
      "Cache-Control": "public, max-age=60",
    },
  })
}
