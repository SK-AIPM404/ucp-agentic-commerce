/**
 * Brand-specific catalog analysis.
 *
 * Given an ingested StoreSnapshot, runs a single LLM call to produce:
 *   - a 6–10 word tagline summarizing the brand's positioning
 *   - 5 suggested prompts a real shopper would type, using actual
 *     categories, product types, and price ranges from THIS catalog
 *
 * The output is grounded: the system prompt sees real product titles,
 * categories, and price stats, and the model is instructed to never
 * invent products outside the catalog.
 */

import { generateText, Output } from "ai"
import { openrouter } from "@openrouter/ai-sdk-provider"
import { z } from "zod"
import { formatPrice, type StoreAnalysis, type StoreSnapshot } from "./shopify"

const BrandProfileSchema = z.object({
  origin: z
    .string()
    .describe(
      "Country/region the brand is rooted in, inferred from currency, store name, product names (e.g. 'ubtan' → India), and language signals. One word or short phrase like 'India', 'USA', 'UK'.",
    ),
  positioning: z
    .string()
    .describe(
      "5–8 word positioning summary, e.g. 'luxury Ayurvedic skincare with cold-pressed oils'.",
    ),
  signature_categories: z
    .array(z.string())
    .min(2)
    .max(5)
    .describe(
      "Top 2–5 buyer-facing category labels actually represented in the catalog, lowercase, plural where natural.",
    ),
  price_tier: z
    .string()
    .describe(
      "One-line price tier label using the catalog's actual currency, e.g. 'premium ₹1,000–₹3,000' or 'mid-range $80–$200'.",
    ),
})

const AnalysisSchema = z.object({
  tagline: z
    .string()
    .describe("6–10 word brand positioning derived from the real catalog."),
  prompts: z
    .array(z.string())
    .length(5)
    .describe(
      "Five short, specific prompts a real shopper would type. Each must reference a real category, product type, or price tier from the supplied catalog. No generic phrases like 'show me bestsellers'.",
    ),
  brand: BrandProfileSchema,
})

/** Words to exclude from product-noun extraction — they're either generic
 * filler, brand/marketing modifiers, or color/material adjectives that don't
 * read as a buyer noun on their own. */
const NOUN_STOPWORDS = new Set<string>([
  "the",
  "a",
  "an",
  "and",
  "or",
  "with",
  "for",
  "of",
  "in",
  "to",
  "by",
  "at",
  "on",
  "new",
  "limited",
  "edition",
  "sale",
  "exclusive",
  "premium",
  "classic",
  "essential",
  "fresh",
  "natural",
  "organic",
  "handmade",
  "luxury",
  "free",
  "fast",
  "long",
  "short",
  "small",
  "medium",
  "large",
  "men",
  "mens",
  "men's",
  "women",
  "womens",
  "women's",
  "kids",
  "kids'",
  "unisex",
])

/** Pull concrete singular/plural nouns from product titles. Returns up to
 * 18 of the most frequent terms, lowercased, deduped, longer than 3 chars,
 * and not in the stopword list. */
function extractProductNouns(titles: string[]): string[] {
  const counts = new Map<string, number>()
  for (const title of titles) {
    if (!title) continue
    const tokens = title
      .toLowerCase()
      .replace(/[®™©]/g, "")
      .split(/[^\p{L}']+/u)
      .filter(Boolean)
    for (const t of tokens) {
      if (t.length <= 3) continue
      if (NOUN_STOPWORDS.has(t)) continue
      if (/^\d+$/.test(t)) continue
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 18)
    .map(([word]) => word)
}

/** Heuristic local fallback used when the LLM call fails. Always grammatical
 * because it composes a real product noun (from titles) with a category, and
 * never falls back to demographic-only fragments like "show me womens". */
function fallbackAnalysis(snapshot: StoreSnapshot): StoreAnalysis {
  const cats = [
    ...new Set(
      snapshot.items
        .map((i) => i.category)
        .filter((c): c is string => Boolean(c && c.trim())),
    ),
  ]
  const nouns = extractProductNouns(snapshot.items.map((i) => i.title))
  const prices = snapshot.items
    .map((i) => i.price)
    .filter((p) => p > 0)
    .sort((a, b) => a - b)
  const median = prices[Math.floor(prices.length / 2)] || 0

  // Pick a "primary noun" the brand sells — the most common title word.
  // This guarantees every prompt has a concrete subject.
  const primaryNoun = nouns[0] ?? "items"
  const secondNoun = nouns[1] ?? primaryNoun
  const thirdNoun = nouns[2] ?? primaryNoun

  const priceLabel = formatPrice(median, snapshot.currency)

  const prompts: string[] = [
    `show me your best ${primaryNoun}`,
    `which ${primaryNoun} are under ${priceLabel}?`,
    `what ${secondNoun} do you recommend for everyday wear?`,
    `compare your top two ${primaryNoun}`,
    `help me pick a ${thirdNoun} as a gift`,
  ]

  return {
    tagline: cats.length
      ? `${snapshot.storeName} — ${cats.slice(0, 2).join(" & ")} essentials`
      : `${snapshot.storeName} catalog`,
    prompts: prompts.slice(0, 5),
  }
}

/** Run the AI analysis. Falls back to a deterministic heuristic if the
 * LLM call fails for any reason — the storefront should never block on this.
 */
export async function analyzeCatalog(
  snapshot: StoreSnapshot,
): Promise<StoreAnalysis> {
  // Build a compact, grounded summary of the catalog.
  const cats = [
    ...new Set(
      snapshot.items
        .map((i) => i.category)
        .filter((c): c is string => Boolean(c && c.trim())),
    ),
  ].slice(0, 20)

  // Some stores use demographic labels ("Mens", "Womens") as product_type,
  // which produce ungrammatical prompts on their own. Extract concrete buyer
  // nouns from product titles so the model can phrase prompts naturally
  // (e.g. "women's runners" instead of just "womens").
  const productNouns = extractProductNouns(snapshot.items.map((i) => i.title))

  const prices = snapshot.items.map((i) => i.price).filter((p) => p > 0)
  const min = prices.length ? Math.min(...prices) : 0
  const max = prices.length ? Math.max(...prices) : 0
  const median = prices.length
    ? [...prices].sort((a, b) => a - b)[Math.floor(prices.length / 2)]
    : 0

  const sample = snapshot.items.slice(0, 30).map((i) => ({
    title: i.title,
    category: i.category,
    price: formatPrice(i.price, snapshot.currency),
  }))

  const sys = `You are a retail merchandising analyst. You will be given a real product catalog from a single brand. Your job is to produce four things, all grounded in the supplied catalog:

1. **brand profile** — origin country/region, positioning summary, 2–5 signature category labels, and a one-line price tier using the catalog's actual currency. Infer origin from clear signals: the currency, store name, product naming (e.g. words like "ubtan", "kurta", "ghee" → India; "kilt", "tartan" → Scotland), language, and ingredient lists. Do not default to USA.
2. **tagline** — a tight 6–10 word brand positioning derived from the real categories.
3. **5 suggested prompts** a real shopper for THIS brand would type to start a conversation with an AI shopping assistant.

ABSOLUTE RULES for prompts (a violation = automatic rejection):

GRAMMAR
- Every prompt MUST be a complete, grammatical English phrase that names a concrete product noun (e.g. "shoes", "runners", "serums", "kurtas", "luggage"). NEVER end with a demographic label alone.
- Never write fragments like "show me womens", "what's new in mens", or "best mens". If the category is "Mens" or "Womens", combine it with a real product noun extracted from titles: "show me women's runners", "what's new in men's sneakers".
- Use possessives correctly: "men's", "women's", "kids'" — not "mens", "womens".

CONTENT
- Each prompt MUST reference a real, store-specific product type (from the supplied product nouns or categories), material, occasion, or price tier. Generic phrases like "two top picks", "bestsellers", "what's trending", "most popular item", or "compare two products" are BANNED.
- Comparisons must name a category: "compare your top wool runners" — not "compare two top picks".
- Every prompt must feel like something a real customer would type — lowercase, concise, conversational. Max 12 words.

INTENT MIX (one of each):
1. Discovery — names a specific product type ("show me your wool sneakers")
2. Budget — uses a real price from the catalog's currency ("which runners under ₹1,500")
3. Occasion / use-case ("what works for marathon training", "gift ideas for a runner")
4. Comparison — names a real product category ("compare your mizzles vs runners")
5. Styling / recommendation — names a category ("help me pick a daily sneaker")

CURRENCY
- All prices use the catalog's actual currency symbol (${snapshot.currency} → ${snapshot.currency === "INR" ? "₹" : snapshot.currency === "USD" ? "$" : snapshot.currency === "GBP" ? "£" : snapshot.currency === "EUR" ? "€" : snapshot.currency}). Indian-rupee prompts use Indian numbering (e.g. "₹1,000").
- If the brand origin is India, lean into Indian shopping idioms ("Diwali", "festive gifting", "wedding season") when natural.`

  const user = `Brand: ${snapshot.storeName}
Domain: ${snapshot.domain}
Currency: ${snapshot.currency}
Total products: ${snapshot.items.length}
Price range: ${formatPrice(min, snapshot.currency)} – ${formatPrice(max, snapshot.currency)} (median ${formatPrice(median, snapshot.currency)})

Real categories present (from product_type):
${cats.length ? cats.join(", ") : "(none labeled)"}

Concrete product nouns extracted from titles (use THESE, not just the categories above, when categories are demographic labels like "Mens"/"Womens"):
${productNouns.length ? productNouns.join(", ") : "(none extracted)"}

Sample of ${sample.length} real products:
${sample.map((s) => `• ${s.title} — ${s.category || "—"} — ${s.price}`).join("\n")}`

  try {
    const { experimental_output } = await generateText({
      model: openrouter("anthropic/claude-sonnet-4"),
      system: sys,
      prompt: user,
      experimental_output: Output.object({ schema: AnalysisSchema }),
    })

    if (
      experimental_output &&
      typeof experimental_output.tagline === "string" &&
      Array.isArray(experimental_output.prompts) &&
      experimental_output.prompts.length === 5
    ) {
      return {
        tagline: experimental_output.tagline.trim(),
        prompts: experimental_output.prompts.map((p) => p.trim()),
        brand: experimental_output.brand
          ? {
              origin: experimental_output.brand.origin.trim(),
              positioning: experimental_output.brand.positioning.trim(),
              signature_categories:
                experimental_output.brand.signature_categories.map((c) =>
                  c.trim(),
                ),
              price_tier: experimental_output.brand.price_tier.trim(),
            }
          : undefined,
      }
    }
    return fallbackAnalysis(snapshot)
  } catch (err) {
    console.warn("[analyze] LLM analysis failed, using fallback:", err)
    return fallbackAnalysis(snapshot)
  }
}
