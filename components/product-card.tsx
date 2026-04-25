"use client"

import { useMemo, useState } from "react"
import { ShoppingBag } from "lucide-react"
import { cn } from "@/lib/utils"

export type ProductCardItem = {
  id: string
  title: string
  brand: string
  category: string
  price_minor: number
  price_display: string
  original_price_display: string | null
  image_url: string | null
  handle: string
  tags: string[]
  variants: {
    id: string
    title: string
    available: boolean
    options: { name: string; value: string }[]
  }[]
}

type Props = {
  item: ProductCardItem
  onAdd: (productId: string, variantId: string) => void
  disabled?: boolean
}

export function ProductCard({ item, onAdd, disabled }: Props) {
  const firstAvailable =
    item.variants.find((v) => v.available)?.id || item.variants[0]?.id || ""
  const [selectedId, setSelectedId] = useState<string>(firstAvailable)

  const variant = useMemo(
    () => item.variants.find((v) => v.id === selectedId) || item.variants[0],
    [item.variants, selectedId],
  )

  const hasVariantChoices =
    item.variants.length > 1 ||
    (variant && variant.options && variant.options.length > 0)

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
      <div className="relative aspect-square w-full overflow-hidden bg-muted/30">
        {item.image_url ? (
          // Using a plain img to avoid next/image domain config in the demo
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt={item.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            no image
          </div>
        )}
        {item.original_price_display ? (
          <span className="absolute left-2 top-2 rounded-md bg-card/90 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-card-foreground backdrop-blur">
            sale
          </span>
        ) : null}
      </div>

      <div className="p-3">
        {item.brand ? (
          <div className="mb-0.5 truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {item.brand}
          </div>
        ) : null}
        <div className="line-clamp-2 text-sm font-medium leading-snug text-card-foreground">
          {item.title}
        </div>

        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-sm font-medium text-card-foreground">
            {item.price_display}
          </span>
          {item.original_price_display ? (
            <span className="text-xs text-muted-foreground line-through">
              {item.original_price_display}
            </span>
          ) : null}
        </div>

        {hasVariantChoices && item.variants.length > 1 ? (
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={disabled}
            className="mt-3 w-full rounded-md border border-border bg-secondary/40 px-2 py-1.5 text-xs text-foreground focus:border-primary/60 focus:outline-none"
          >
            {item.variants.map((v) => (
              <option key={v.id} value={v.id} disabled={!v.available}>
                {v.title}
                {!v.available ? " · sold out" : ""}
              </option>
            ))}
          </select>
        ) : null}

        <button
          type="button"
          disabled={disabled || !variant?.available}
          onClick={() => variant && onAdd(item.id, variant.id)}
          className={cn(
            "mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <ShoppingBag className="h-3.5 w-3.5" />
          {variant?.available ? "Add to cart" : "Sold out"}
        </button>
      </div>
    </div>
  )
}

