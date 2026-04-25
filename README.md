# Caraveal — Agentic Commerce Agent

> Make any Shopify store transactable through AI agents in 60 seconds.

Built for the Vercel Hackathon · Track 2 (v0 + MCPs) · UCP 2026-04-08

---

## What it does

Caraveal generates a Universal Commerce Protocol (UCP) endpoint from any public Shopify store. Paste a URL — the agent fetches the catalog, builds a compliant manifest, and spins up an AI storefront where buyers can discover products and complete checkout entirely in chat. No browser redirect. No custom integration. No developer required.

```
Paste store URL → fetch /products.json → generate UCP manifest → AI storefront live
```

---

## Demo

1. Go to the app
2. Paste any Shopify store URL (e.g. `https://www.allbirds.com`)
3. Click **Start** — Caraveal ingests the catalog and audits capabilities
4. Chat with the storefront: `"show me running shoes under $100"`
5. Add to cart → apply a discount code → confirm order

Demo discount codes: `WELCOME10` · `FLAT500` · `FREESHIP`

---

## Why UCP

The Universal Commerce Protocol is an open standard co-developed by Shopify and Google (January 2026) that lets AI agents discover, negotiate, and transact with any merchant without custom per-platform integrations.

```
Before UCP  →  every AI agent needs a custom integration per store
After UCP   →  one manifest, any agent, any platform
```

Caraveal implements UCP for any Shopify store in 60 seconds. No engineering team required.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | v0 by Vercel + Tailwind CSS v4 |
| AI | Vercel AI SDK v6 + Claude Sonnet via **OpenRouter** |
| Catalog | Shopify `products.json` (public, no auth) |
| Protocol | Universal Commerce Protocol 2026-04-08 |
| Deployment | Vercel (one-click) |
| Storage | In-memory store cache (no database required) |

---

## Getting started

### Prerequisites

- Node.js 18+
- pnpm
- OpenRouter API key — get one free at [openrouter.ai/keys](https://openrouter.ai/keys)

### Local setup

```bash
# Clone and install
git clone https://github.com/your-org/caraveal
cd caraveal
pnpm install

# Set environment variables
cp .env.example .env.local
# Add your OPENROUTER_API_KEY to .env.local

# Run dev server
pnpm dev
```

Open `http://localhost:3000`, paste any Shopify store URL, and click Start.

### Environment variables

```env
OPENROUTER_API_KEY=sk-or-...
```

Get your key at [openrouter.ai/keys](https://openrouter.ai/keys). OpenRouter's free tier covers the hackathon demo.

### Deploy to Vercel

```bash
vercel deploy
```

Add `OPENROUTER_API_KEY` in your Vercel project → Settings → Environment Variables. The `/.well-known/ucp` manifest automatically uses your deployed URL as the `service_endpoint`.

---

## OpenRouter setup

Caraveal uses `@openrouter/ai-sdk-provider` which plugs directly into the Vercel AI SDK.

```bash
pnpm add @openrouter/ai-sdk-provider
```

In `app/api/chat/route.ts`:

```ts
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { streamText } from "ai"

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

const result = streamText({
  model: openrouter.chat("anthropic/claude-sonnet-4"),
  system: systemPrompt,
  messages,
  tools,
})

return result.toUIMessageStreamResponse()
```

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                     Caraveal                         │
│                                                      │
│  /api/ingest           /api/chat                     │
│  ┌───────────┐        ┌──────────────────────┐       │
│  │ Fetch     │        │ Claude Sonnet        │       │
│  │ products  │        │ via OpenRouter       │       │
│  │ .json     │        │ + 4 tools:           │       │
│  │           │        │  search_catalog      │       │
│  │ Transform │        │  create_checkout     │       │
│  │ → UCP     │        │  apply_discount      │       │
│  │ items     │        │  complete_order      │       │
│  └───────────┘        └──────────────────────┘       │
│        ↓                                             │
│  store-cache.ts  (in-memory Map)                     │
│        ↓                                             │
│  /.well-known/ucp    /ucp/v1/catalog/search          │
│  (UCP manifest)      /ucp/v1/checkout-sessions       │
└──────────────────────────────────────────────────────┘
```

---

## UCP endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/.well-known/ucp` | Merchant capability manifest |
| GET | `/ucp/v1/catalog/search` | Natural language product search |
| GET | `/ucp/v1/catalog/products/:id` | Full product + variant detail |
| POST | `/ucp/v1/checkout-sessions` | Create checkout session |
| PUT | `/ucp/v1/checkout-sessions/:id` | Update — discounts, quantities |
| POST | `/ucp/v1/checkout-sessions/:id/complete` | Complete purchase |
| GET | `/ucp/v1/orders/:id` | Order status + tracking |

---

## Shopify products.json

Every public Shopify store exposes `/products.json` with no auth required.

```
GET https://store.com/products.json?limit=250
```

Key field transforms:

| Shopify field | UCP field | Notes |
|---|---|---|
| `product.id` | `item.id` | Cast to string |
| `product.title` | `item.title` | Direct |
| `product.body_html` | `item.description` | HTML stripped |
| `product.product_type` | `item.category` | Powers catalog search |
| `product.tags` | `item.tags[]` | Comma string → array |
| `product.handle` | `item.url` | `/products/{handle}` |
| `variant.price` | `item.price` | String → float × 100 → minor units |
| `variant.available` | `item.available` | Trust this, not `inventory_quantity` |
| `product.image.src` | `item.image_url` | First image |

---

## Checkout states

| State | Meaning | UI |
|---|---|---|
| `incomplete` | Missing info | Agent resolves via API |
| `requires_escalation` | Buyer input needed | Inline form or continue_url |
| `ready_for_complete` | All info collected | Confirm card |
| `completed` | Order placed | Order confirmation |

---

## Project structure

```
caraveal/
├── app/
│   ├── api/
│   │   ├── ingest/route.ts          # Fetch + transform products.json
│   │   ├── chat/route.ts            # Claude via OpenRouter + 4 tools
│   │   └── well-known/ucp/route.ts  # UCP manifest
│   ├── ucp/v1/
│   │   ├── catalog/search/
│   │   ├── catalog/products/[id]/
│   │   └── checkout-sessions/
│   └── page.tsx
├── components/
│   ├── onboarding.tsx
│   ├── chat-panel.tsx
│   ├── product-card.tsx
│   ├── checkout-card.tsx
│   └── store-rail.tsx
└── lib/
    ├── shopify.ts                   # products.json fetcher + UCP transformer
    └── store-cache.ts               # In-memory catalog + session store
```

---

## The business case

- 91% of Shopify stores are invisible to AI shopping agents
- AI chat shoppers convert at **12.3% vs 3.1%** — a 4× gap
- AI-driven orders on Shopify grew **15× in 2025**
- UCP launched January 2026 — the infrastructure window is open now

Caraveal is the Stripe of AI commerce for Shopify brands.

---

## License

MIT
