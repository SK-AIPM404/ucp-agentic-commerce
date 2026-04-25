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
})

/** Heuristic local fallback used when the LLM call fails (no key, rate-limited,
 * etc.) — still brand-specific because it derives from real categories.
 */
function fallbackAnalysis(snapshot: StoreSnapshot): StoreAnalysis {
  const cats = [
    ...new Set(
      snapshot.items
        .map((i) => i.category)
        .filter((c): c is string => Boolean(c && c.trim())),
    ),
  ]
  const top = cats.slice(0, 3)
  const prices = snapshot.items.map((i) => i.price).filter((p) => p > 0).sort(
    (a, b) => a - b,
  )
  const median = prices[Math.floor(prices.length / 2)] || 0
  const medianMajor = Math.round(median / 100)

  const prompts: string[] = []
  if (top[0]) prompts.push(`show me ${top[0].toLowerCase()} under ${formatPrice(median, snapshot.currency)}`)
  if (top[1]) prompts.push(`what's new in ${top[1].toLowerCase()}?`)
  if (top[2]) prompts.push(`best-rated ${top[2].toLowerCase()} for everyday use`)
  prompts.push(`gift ideas around ${formatPrice(median, snapshot.currency)}`)
  prompts.push(`compare two top picks side by side`)

  return {
    tagline: top.length
      ? `${snapshot.storeName} — ${top.slice(0, 2).join(" & ")} essentials`
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

  const sys = `You are a retail merchandising analyst. You will be given a real product catalog from a single brand. Your job is to:
1. Write a tight 6–10 word tagline that captures what this specific brand sells (its positioning), grounded in the real categories you see.
2. Generate exactly 5 suggested prompts a real shopper would type to start a conversation with an AI shopping assistant for THIS brand.

Strict rules for the prompts:
- They MUST reference real categories, product types, materials, occasions, or price tiers visible in the supplied catalog.
- Each prompt must feel like something a human would actually type — concise, lowercase, conversational. Maximum 12 words.
- Never use generic phrases like "show me bestsellers", "what's trending", or "most popular item".
- Mix intent: at least one discovery prompt, one budget prompt, one occasion/use-case prompt, one comparison prompt, one styling/recommendation prompt.
- Use the catalog's actual currency formatting in any price reference.`

  const user = `Brand: ${snapshot.storeName}
Domain: ${snapshot.domain}
Currency: ${snapshot.currency}
Total products: ${snapshot.items.length}
Price range: ${formatPrice(min, snapshot.currency)} – ${formatPrice(max, snapshot.currency)} (median ${formatPrice(median, snapshot.currency)})

Real categories present (from product_type):
${cats.length ? cats.join(", ") : "(none labeled)"}

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
      }
    }
    return fallbackAnalysis(snapshot)
  } catch (err) {
    console.warn("[analyze] LLM analysis failed, using fallback:", err)
    return fallbackAnalysis(snapshot)
  }
}
