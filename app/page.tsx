"use client"

import { useState } from "react"
import { Onboarding, type IngestResult } from "@/components/onboarding"
import { ChatPanel } from "@/components/chat-panel"
import { StoreRail } from "@/components/store-rail"

export default function HomePage() {
  const [store, setStore] = useState<IngestResult | null>(null)

  if (!store) {
    return <Onboarding onConnected={setStore} />
  }

  return (
    <main className="flex h-[100dvh] w-full flex-col bg-background">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 md:px-6">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 4h10M3 8h10M3 12h6" strokeLinecap="round" />
            </svg>
          </span>
          <span className="text-sm font-medium tracking-tight">Caravel</span>
          <span className="hidden font-mono text-[10px] uppercase tracking-widest text-muted-foreground sm:inline">
            · agentic storefront
          </span>
        </div>
        <a
          href={store.manifestUrl}
          target="_blank"
          rel="noreferrer"
          className="hidden rounded-md border border-border bg-secondary/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:border-primary/40 hover:text-foreground sm:inline-block"
        >
          UCP manifest
        </a>
      </header>

      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col">
          <ChatPanel storeDomain={store.domain} />
        </section>
        <div className="hidden w-[320px] shrink-0 md:block">
          <StoreRail store={store} onReset={() => setStore(null)} />
        </div>
      </div>
    </main>
  )
}
