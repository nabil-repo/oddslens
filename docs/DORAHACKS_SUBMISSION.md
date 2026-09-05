# DoraHacks Submission Details — OddsLens

## 1. Project Information
- **Project Name:** OddsLens — Inline DreamDEX Odds Browser Extension
- **Tagline:** Bringing live DreamDEX Event Contract odds on Somnia directly inline wherever sports fans, crypto traders, and news readers are already reading — with a 1-click path to trade.
- **Hackathon:** Somnia × DreamDEX Event Contracts Hackathon (DoraHacks)
- **Primary Tags:** `DeFi`, `Event Contracts`, `Prediction Markets`, `Consumer-First Apps`, `Somnia Network`, `DreamDEX`
- **Networks Used:** Somnia Shannon Testnet (Chain ID `50312`), DreamDEX Public WebSocket (`wss://stg.api.dreamdex.io/v0/ws/public`)
- **Live dApp App Reference:** [https://app.dreamdex.io](https://app.dreamdex.io)
- **Demo Hub & Walkthrough:** `http://localhost:3000/demo/index.html` (Local preview)

---

## 2. Short Pitch (100 words)
Event contracts only reach people who already know they exist and actively open a decentralized exchange. The millions of sports fans reading match previews, citizens following elections, and crypto enthusiasts tracking breaking headlines never see live market probabilities where they are already engaged.

**OddsLens** bridges this gap. It is a Manifest V3 browser extension that brings DreamDEX Event Contracts inline across the entire web. Featuring both reliable manual right-click selection and zero-friction URL auto-detection, OddsLens embeds broadcast-quality odds widgets with real-time WebSocket feeds, order book spreads, and a 1-click trade route directly into the reader's native viewport.

---

## 3. Detailed Project Description

### The Problem
Across the 26+ BUIDLs submitted to this hackathon, nearly every team builds **inward** — designing automated trading agents, volatility scanners, hedging engines, or terminal interfaces for experienced DeFi traders. 

However, prediction markets live and die by **liquidity, market participation, and new-user acquisition**. The vast majority of potential bettors never open a DEX; they read ESPN, CoinDesk, Bloomberg, and Twitter. Without distribution to non-crypto audiences, prediction markets remain isolated niche tools.

### The Solution: OddsLens
OddsLens transforms every webpage into an interactive, real-time storefront for DreamDEX Event Contracts.

It operates in two complementary modes:
1. **Manual Selection Mode (100% Reliable & Defensible):**
   - Highlight any text on **any webpage** (e.g., *"Bitcoin"*, *"Real Madrid"*, *"Federal Reserve"*).
   - Right-click and choose **"🔍 Check DreamDEX odds for this"**.
   - OddsLens matches the text against the on-chain manifest and renders a sleek, floating odds card directly beside the content.
2. **Curated Auto-Detect Mode (Zero-Friction UX):**
   - On configured URL patterns (e.g., curated news portals or sports recaps), OddsLens automatically recognizes the topic on page load and slides in an interactive odds widget with zero required user action.

---

## 4. Key Features & Innovation

- **Broadcast-Grade Shadow DOM Widget:**
  - Injected via an open Shadow Root (`attachShadow({ mode: 'open' })`), guaranteeing 100% style isolation from host website CSS (Tailwind, Bootstrap, or custom resets).
  - Dual-fill animated odds probability bar (% UP vs % DOWN) with real-time green/red pulse flashes on price ticks.
  - Order book touch depth preview: Best Bid, Best Ask, 24h Traded Volume, and Open Interest.
  - Dynamic resolution countdown timer ticking down to market settlement.
  - **Quick Bet Calculator:** Interactive `$5`, `$10`, `$25`, `$50` chips displaying expected gross payout and ROI in real-time.
  - Draggable header and minimize-to-pill mode.
- **Dual-Feed Streaming Architecture:**
  - Connects to DreamDEX's real WebSocket feed (`wss://stg.api.dreamdex.io/v0/ws/public`) with ping/pong heartbeats and exponential backoff.
  - Resilient Brownian-motion volatility streamer that maintains micro-ticks during quiet testnet periods or offline video recording, ensuring 0% demo failure risk.
  - Direct Somnia Shannon Testnet RPC connection querying block heights (`50312`).
- **Ecosystem Extensibility & Options Dashboard:**
  - Dedicated management dashboard where DAOs, event creators, sports bloggers, and publishers can map custom URLs, contracts, and trigger keywords.
  - Full JSON manifest Export & Import for community sharing.
  - Built-in Live Matcher Sandbox for testing keyword and URL relevance.

---

## 5. Technical Implementation Details

- **Extension Framework:** Chrome Extension Manifest V3 (compatible with Chrome, Brave, Edge).
- **Background Worker:** Pure ES Module service worker managing WebSocket streams, Somnia JSON-RPC, context menus, and storage state.
- **Data Encapsulation:** Native Web Component `<odds-lens-overlay>` with Shadow DOM.
- **Contract Integration:**
  - Core protocol proxy addresses mapped (`BinaryMarketsModule`, `MarketsCore`, `BinarySettlement`, `OutcomeToken6909`).
  - Testnet collateral token scaled to 6 decimals (`tUSDC` `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E`).
  - Deep linking into `https://app.dreamdex.io`.

---

## 6. Business & Ecosystem Impact

1. **Top-of-Funnel User Acquisition:** Converts passive content consumers into active DreamDEX traders without requiring app-switching.
2. **Publisher Affiliate Monetization (Roadmap):** News outlets and bloggers can embed their referral key into the widget, earning a share of trade volume originated from their articles.
3. **Liquidity Expansion:** Increased directional volume improves CLOB order book depth on the Somnia blockchain.
