# OddsLens — Inline DreamDEX Odds Browser Extension
### Somnia × DreamDEX Event Contracts Hackathon — Grand Prize Submission

[![Somnia Network](https://img.shields.io/badge/Network-Somnia%20Shannon%20Testnet%20(50312)-7928CA?style=for-the-badge&logo=ethereum)](https://shannon-explorer.somnia.network)
[![DreamDEX](https://img.shields.io/badge/Protocol-DreamDEX%20Event%20Contracts-00F0FF?style=for-the-badge)](https://docs.dreamdex.io/developers/event-contracts)
[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-00FF87?style=for-the-badge)](https://developer.chrome.com/docs/extensions/mv3/intro/)

> **Surfacing live DreamDEX Event Contract odds directly inline wherever sports fans, crypto traders, and news readers are already reading — with a one-click path to trade.**

---

## 1. Problem & Opportunity

Decentralized prediction markets and event contracts typically only reach users who already know about them and actively navigate into a specialized trading terminal. The audiences most likely to care about real-world outcomes — sports fans reading a match preview, voters reading political news, traders reading crypto market breakdowns — **never see live odds where they are already consuming content**.

Across the 26+ BUIDLs submitted to the Somnia × DreamDEX hackathon, virtually every entry builds **inward** (autonomous trading bots, market-making scripts, hedging engines, on-chain Black-Scholes analytics). 

**None solve distribution to people outside of crypto trading apps.**

**OddsLens solves this distribution bottleneck.**

```
[ Traditional Model ]
Real-World Event Happens ──► User Reads News on ESPN / CoinDesk ──► [DISCONNECT: User never sees odds]
                                                                      └──► Trader already inside DreamDEX

[ OddsLens Model ]
Real-World Event Happens ──► User Reads News on ESPN / CoinDesk ──► [OddsLens Inline Widget] ──► 1-Click Trade on DreamDEX!
```

---

## 2. Dual-Mode Architecture

To ensure the product is both commercially defensible and 100% dependable on camera, OddsLens features two complementary modes:

1. **Manual Mode (Core, 100% Defensible):**
   - Select any text on **any webpage** (e.g. *"Bitcoin"*, *"Real Madrid"*, *"Jerome Powell"*).
   - Right-click &rarr; select **"Check DreamDEX odds for this"**.
   - OddsLens scores the selected text against the manifest and instantly mounts a broadcast-quality floating odds widget.
2. **Curated Auto-Detect (Demo Highlight):**
   - On configured URL patterns (e.g. sports recaps, crypto news portals), OddsLens automatically recognizes the context on page load and slides in with real-time streaming odds.

---

## 3. How OddsLens Wins on Judging Criteria

| Hackathon Criterion | Weight | How OddsLens Delivers |
|---|---|---|
| **Innovation & Originality** | 20% | **Zero overlap** with existing submissions. Rather than another trading terminal or arbitrage bot, OddsLens builds outward distribution, transforming the entire web into an interactive DreamDEX storefront — enhanced with **client-side NLP entity extraction and Gemini / OpenRouter AI trading synthesis**. |
| **Technical Implementation** | 25% | Native Manifest V3 service worker, real DreamDEX WebSocket feed (`wss://stg.api.dreamdex.io/v0/ws/public`), Somnia Shannon RPC integration (`50312`), **OpenRouter & Gemini AI API integration**, **AFINN-165 Sentiment Engine**, Shadow DOM CSS isolation, and a resilient Brownian-motion volatility streamer. |
| **UX & Design** | 20% | Cyber dark-mode fintech aesthetic, dual-fill animated odds gauge, orderbook spread readout, **Open Interest (OI) metric**, **Settlement Urgency badge**, **AI Sentiment Pill** (`BULLISH` / `BEARISH`), **dynamic AI Insight card with typewriter reveal**, and quick bet calculator. |
| **Business & Ecosystem Impact** | 20% | Directly drives net-new user acquisition and volume to DreamDEX from non-crypto web traffic. Includes an editable **Options Page** with AI API key configuration, publisher wallet attribution, and custom contract mappings. |
| **Presentation & Demo** | 15% | Rock-solid multi-beat demo (Manual Mode + Curated Auto-Detect + AI Insights) with built-in realistic demo articles and interactive Demo Hub for instant judging reproduction. |

---

## 4. Technical Architecture & AI Engine

```mermaid
graph TD
    A[Webpage / News Article] -->|Text Selection + Right Click| B(Context Menu: Check DreamDEX Odds)
    A -->|Page Load URL Match + DOM Content| C(Curated Auto-Detect Engine)
    
    B --> D[Manifest V3 Background Service Worker]
    C --> D
    
    D <-->|WebSocket wss://stg.api.dreamdex.io| E[DreamDEX Public CLOB Feed]
    D <-->|JSON-RPC 50312 15s Polling| F[Somnia Shannon Testnet RPC]
    D <-->|Brownian Micro-ticks| G[Resilient Simulation Engine]
    D <-->|Gemini 2.5 Flash / AFINN-165| H[AI Engine: Sentiment & NLP Matcher]
    
    D -->|chrome.tabs.sendMessage| I[Content Script]
    I -->|attachShadow| J[OddsLens Shadow DOM Overlay]
    
    J -->|1-Click Trade Deep Link| K[DreamDEX Event Contracts App]
    
    L[Options & AI Config Dashboard] -->|chrome.storage.local| D
    M[Extension Popup Mini-Dashboard] -->|chrome.runtime| D
```

### Key Technical Highlights:
- **Zero-Conflict Shadow DOM**: The widget mounts inside an open Shadow Root (`attachShadow({ mode: 'open' })`), guaranteeing that host page CSS resets (Tailwind, Bootstrap, or custom stylesheets on CoinDesk/ESPN) cannot break the widget's layout.
- **AI-Powered Sentiment & Narrative Analysis**: Built-in `background/ai-engine.js` runs lexical AFINN-165 sentiment scoring directly in the browser, classifying article tone as `BULLISH`, `BEARISH`, or `NEUTRAL` with intensity scores and keyword extraction.
- **Gemini 2.5 Flash Market Synthesis**: Automatically connects to Google Gemini 2.5 Flash to synthesize how the news narrative impacts contract probability, outputting actionable 2-sentence market insights with smart template fallback if offline.
- **Dual-Feed Reliability**: Real connection to the DreamDEX public WebSocket API with automatic exponential backoff reconnects and heartbeat management. If testnet order books are quiet during a demo, a Brownian-motion simulation engine keeps odds and spreads alive.
- **Urgency & Open Interest Indicators**: Real-time resolution countdown highlights expiring windows (<24h yellow, <2h pulsing red), paired with on-chain Open Interest (OI) for market depth visibility.
- **Zero-Build Extension Runtime**: Built with native ES Modules, requiring zero compilation to load directly into Google Chrome, Brave, or Edge.

---

## 5. Somnia & DreamDEX Protocol Integration

### Network Configuration
- **Network Name**: Somnia Shannon Testnet
- **Chain ID**: `50312` (`0xc488`)
- **RPC Endpoint**: `https://api.infra.testnet.somnia.network/`
- **Block Explorer**: [https://shannon-explorer.somnia.network](https://shannon-explorer.somnia.network)
- **DreamDEX App**: [https://app.dreamdex.io](https://app.dreamdex.io)
- **DreamDEX Public WebSocket**: `wss://stg.api.dreamdex.io/v0/ws/public`

### Deployed Core Protocol Contracts
| Contract Name | On-Chain Address (Somnia Shannon Testnet) |
|---|---|
| **BinaryMarketsModule** | `0x3ecC694Cef705358864a646142ac17A90E29e388` |
| **MarketsCore** | `0x2802504314685D89bF6C992CA5a8e7cC78bc0294` |
| **BinarySettlement** | `0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23` |
| **OutcomeToken6909** | `0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9` |
| **Collateral (tUSDC)** | `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E` (6 decimals) |

---

## 6. Project Structure

```
oddslens/
├── manifest.json              # Manifest V3 configuration (permissions, host permissions, resources)
├── background/
│   ├── service-worker.js     # Central service worker: context menus, feeds, block polling, AI router
│   ├── ai-engine.js          # Gemini 2.5 Flash caller, AFINN-165 sentiment, NLP entity matcher
│   ├── manifest-data.js      # Default curated markets, network parameters, contract addresses
│   ├── matching-engine.js    # Regex glob URL matcher & token relevance scoring algorithm
│   ├── dreamdex-client.js    # DreamDEX WebSocket client with ping/pong and Somnia RPC query
│   └── mock-streamer.js      # Brownian-motion market volatility engine for fail-safe demos
├── content/
│   ├── content-script.js     # Injected page scanner, auto-detect hook, article extractor, widget controller
│   ├── widget.js             # Shadow-DOM interactive odds widget with AI insights, OI & urgency
│   └── widget.css            # Broadcast-grade, sleek cyber-fintech styling with animations
├── popup/
│   ├── popup.html            # Mini-dashboard interface
│   ├── popup.js              # State manager, toggle controls, quick match tester
│   └── popup.css             # Dark-mode popup styling
├── options/
│   ├── options.html          # Custom URL/keyword mapping & Gemini AI configuration dashboard
│   ├── options.js            # CRUD logic, Gemini API key tester, JSON manifest import/export
│   └── options.css           # Data table, AI config cards, and modal styles
├── demo/
│   ├── demo-server.js        # Zero-dependency local preview server
│   ├── index.html            # Interactive Demo Hub with live embedded widget & judging guide
│   ├── crypto-article.html   # Realistic crypto publication article (CoinDesk style)
│   ├── sports-article.html   # Realistic sports publication article (ESPN style)
│   ├── macro-article.html    # Realistic macro publication article (WSJ style)
│   ├── article.css           # Editorial typography and styling
│   └── demo.css              # Demo Hub presentation styling
├── docs/
│   ├── DEMO_VIDEO_GUIDE.md   # Script & screenflow for 2-3 minute judging demo video
│   ├── DORAHACKS_SUBMISSION.md # Ready-to-submit DoraHacks questionnaire answers
│   ├── SDK_FEEDBACK_REPORT.md # Professional developer feedback report on DreamDEX APIs/SDKs
│   └── pitch-deck.html       # Interactive 7-slide presentation deck with keyboard controls
├── icons/                    # Crisp extension icons (16x16, 48x48, 128x128, SVG)
└── README.md                 # Full project documentation
```

---

## 7. Quick Start & Installation

### Step 1: Clone Repository
```bash
git clone https://github.com/nabil-repo/oddslens.git
cd oddslens
```

### Step 2: Load Extension into Chrome / Brave / Edge
1. Open your Chromium browser and navigate to `chrome://extensions`.
2. Toggle on **"Developer mode"** in the top-right corner.
3. Click **"Load unpacked"** in the top-left.
4. Select the `oddslens` root folder.
5. OddsLens is now installed! Pin it to your toolbar.

### Step 3: Run the Local Demo Hub
```bash
npm start
```
Open **`http://localhost:3000/demo/index.html`** in your browser to explore the full interactive demo suite and judging hub.

---

## 8. 2–3 Minute Demo Video Script

| Timecode | Beat | What to Show & Say |
|---|---|---|
| **00:00 – 00:20** | **The Distribution Problem** | *"Prediction markets on Somnia are powerful, but right now you only see them if you’re already inside a trading terminal. 99% of sports and news readers never see live odds where they read. OddsLens brings DreamDEX to where the users already are."* |
| **00:20 – 00:45** | **Manual Selection Mode** | Highlight *"Bitcoin"* on any article &rarr; right-click &rarr; select *"Check DreamDEX odds for this"*. Show the sleek widget pop up with real-time odds (67% UP / 33% DOWN), spread, and urgency countdown badge. |
| **00:45 – 01:20** | **Curated Auto-Detect + AI Insights** | Open the Crypto or Macro demo article. Watch OddsLens slide in automatically: highlight the **`🟢 BULLISH (72%)`** sentiment badge derived from article NLP, followed by the **Gemini 2.5 Flash trading synthesis** comparing news tone against the order book consensus. |
| **01:20 – 01:45** | **1-Click Trade Flow & Payout Calculator** | Click the `$10` and `$25` quick bet chips to preview expected payout. Click *"Trade on DreamDEX ↗"* to show the deep link directly to the on-chain event contract on Somnia. |
| **01:45 – 02:15** | **AI Config & Ecosystem Options Dashboard** | Open the **Options Dashboard**. Demonstrate the Gemini API key tester, adding custom keyword/URL mappings, and running live queries through the Matcher Sandbox. |
| **02:15 – 02:30** | **Closing & Somnia Ecosystem Impact** | Summarize why distribution and AI intelligence are the missing keys to event contract adoption on Somnia. |

---

## 9. Post-Hackathon Roadmap

- **Autonomous Multimodal Sentiment**: Expand the AI engine to evaluate article charts, social video transcripts, and audio feeds using Gemini 2.5 Multimodal APIs.
- **Publisher Monetization & Affiliate Attribution**: Allow bloggers and media organizations to configure their Somnia wallet in Options to earn a continuous royalty on trading volume routed through their publications.
- **Account Abstraction & 1-Click Inline Trades**: Integrate ERC-4337 smart accounts on Somnia Shannon to allow users to sign and execute DreamDEX transactions directly inside the floating widget without page navigation.
- **Cross-Browser Store Distribution**: Publish packaged releases to Chrome Web Store, Firefox Add-ons, and Microsoft Edge Add-ons.

---

## 10. License

MIT License. Developed for the **Somnia × DreamDEX Event Contracts Hackathon (August - September 2026)**.
