# 🎬 OddsLens — 2–3 Minute Demo Video Guide & Voiceover Script
### Somnia × DreamDEX Event Contracts Hackathon Submission

This guide provides the exact timestamped shot-list, screen recording steps, and spoken narration script for your 2–3 minute submission video.

---

## 🛠 Recommended Setup Before Recording

1. **Browser Preparation:**
   - Chrome / Brave / Edge with OddsLens loaded (`chrome://extensions` &rarr; "Load unpacked").
   - Pin the OddsLens extension icon to the toolbar.
   - Start the local demo server:
     ```bash
     npm start
     ```
   - Open 4 browser tabs in order:
     - **Tab 1:** `http://localhost:3000/demo/index.html` (Demo Hub)
     - **Tab 2:** `http://localhost:3000/demo/crypto-article.html` (Crypto News)
     - **Tab 3:** `http://localhost:3000/demo/sports-article.html` (Sports News)
     - **Tab 4:** `http://localhost:3000/options/options.html` (Options Dashboard)
2. **Screen Recording Tool:**
   - [Loom](https://www.loom.com), [OBS Studio](https://obsproject.com), or Windows Game Bar (`Win + G`).
   - Resolution: 1080p (1920x1080) at 60fps.

---

## ⏱ Step-by-Step Shot List & Script

### Beat 1: The Hook & The Problem (00:00 – 00:20)
* **Screen:** Show Tab 1 (`demo/index.html` or a typical news article).
* **Voiceover:**
  > *"Across the 26+ submissions in this hackathon, almost every team is building inward — trading bots, hedging algorithms, or complex DeFi analytics. But prediction markets live and die by liquidity and audience participation.*
  > 
  > *Right now, 99% of sports fans reading match previews, voters following elections, and crypto readers never see live odds where they're already reading. They never show up inside a dedicated trading app.*
  > 
  > *This is OddsLens: an inline browser extension that surfaces live DreamDEX Event Contract odds directly on any webpage on the internet, with a one-click path to trade."*

---

### Beat 2: Manual Selection Mode — 100% Reliable Core (00:20 – 00:55)
* **Screen:** Switch to Tab 2 (`demo/crypto-article.html`). Highlight the word **"Bitcoin"** or **"Somnia"**. Right-click on the selection, hover over the context menu, and click **"🔍 Check DreamDEX odds for this"**.
* **Action:** The OddsLens widget pops up beside the content. Show the dual-fill animated odds bar ticking live.
* **Voiceover:**
  > *"First is Manual Mode — our core, commercially defensible product that works on literally any webpage with zero false-positive risk.*
  > 
  > *Select any text — like 'Bitcoin' or 'Somnia' — right-click, and click 'Check DreamDEX odds for this'. Instantly, OddsLens scores the keyword and mounts a broadcast-quality odds widget directly into your viewport.*
  > 
  > *Notice that this widget runs inside an open Shadow DOM root. Host page CSS like Tailwind or Bootstrap can never break our styling. You see the live Up/Down percentages, the real-time orderbook touch spread, and the ticking settlement countdown."*

---

### Beat 3: Curated Auto-Detect — The Polish Beat (00:55 – 01:30)
* **Screen:** Switch to Tab 3 (`demo/sports-article.html`). Refresh the page.
* **Action:** Watch OddsLens slide in automatically on load. Click the **"$25"** chip in the bet calculator to show the expected payout updating ($38.50). Click the **minimize button** to collapse it to a floating pill, then click to expand it back.
* **Voiceover:**
  > *"Next is our second matching mode: Curated Auto-Detect.*
  > 
  > *When a reader visits a supported sports or news URL, OddsLens recognizes the context on page load and slides in with zero friction.*
  > 
  > *Here, on a Champions League preview, it surfaces the Real Madrid vs Manchester City event contract. Notice the live glowing pulse as odds tick. Readers can even test the Quick Bet Calculator: click '$25' to see the exact return on UP versus DOWN in real-time."*

---

### Beat 4: One-Click Trade Flow to DreamDEX (01:30 – 01:50)
* **Screen:** Hover over and click the glowing button: **"Trade on DreamDEX ↗"**.
* **Action:** A new tab opens directly to `https://app.dreamdex.io`.
* **Voiceover:**
  > *"The moment high-conviction readers see these odds, they are one click away from executing. Clicking 'Trade on DreamDEX' opens the verified DreamDEX application, bridging mainstream web traffic directly into Somnia's on-chain CLOB liquidity."*

---

### Beat 5: Ecosystem Extensibility & Options Dashboard (01:50 – 02:15)
* **Screen:** Switch to Tab 4 (`options/options.html`).
* **Action:** Show the table with 4 contracts. Type *"Somnia TPS throughput"* into the Live Matcher Sandbox and click **"Run Scorer"** to show the 90% match. Point out the **Export JSON** button.
* **Voiceover:**
  > *"OddsLens isn't a static hardcoded demo; it’s an open distribution protocol for the entire Somnia ecosystem.*
  > 
  > *In our Options Dashboard, any event creator, DAO, or sports blogger can map new contracts, URL patterns, and trigger keywords. You can export and import community manifests as JSON, switch between Somnia Shannon Testnet and Mainnet, and test headline relevance live in our Matcher Sandbox."*

---

### Beat 6: Summary & Vision (02:15 – 02:35)
* **Screen:** Click the OddsLens extension icon in the toolbar to display the popup mini-dashboard, then close on Tab 1 (`demo/index.html`).
* **Voiceover:**
  > *"With full Manifest V3 compatibility, native WebSocket streaming, and dual-mode matching, OddsLens solves prediction market distribution.*
  > 
  > *Post-hackathon, our roadmap includes autonomous NLP entity extraction and publisher revenue-sharing to incentivize global news outlets to distribute DreamDEX Event Contracts.*
  > 
  > *Thank you, and explore the repository on GitHub!"*
