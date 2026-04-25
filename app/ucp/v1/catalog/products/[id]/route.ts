import { getStore } from "@/lib/store-cache"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const url = new URL(req.url)
  const store = url.searchParams.get("store")
  const { id } = await params

  if (!store) {
    return Response.json({ error: "Missing ?store" }, { status: 400 })
  }
  const snapshot = getStore(store)
  if (!snapshot) {
    return Response.json({ error: "Store not found" }, { status: 404 })
  }

  const item = snapshot.items.find((i) => i.id === id)
  if (!item) {
    return Response.json({ error: "Product not found" }, { status: 404 })
  }
  return Response.json({ currency: snapshot.currency, item })
}
