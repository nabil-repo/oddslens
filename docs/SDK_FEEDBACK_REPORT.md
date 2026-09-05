# DreamDEX & Somnia Developer Feedback Report
### Somnia × DreamDEX Event Contracts Hackathon

**Team:** OddsLens  
**Date:** September 2026  
**Target Surface:** `@somnia-chain/markets-sdk` (v0.29.0+), DreamDEX WebSocket API (`/v0/ws/public`), and Event Contracts Documentation (`docs.dreamdex.io`)

---

## 1. Executive Summary

During the development of **OddsLens**, an inline browser extension surfacing live DreamDEX Event Contract odds on Somnia, our team thoroughly integrated with the protocol’s developer surface, WebSocket feeds, and smart contract architecture.

Overall, the architectural design of DreamDEX Event Contracts — particularly the **single-book two-sided minting mechanism** and **CREATE3 contract address parity** between testnet and mainnet — is exceptionally well thought out and provides great developer ergonomics.

This report summarizes our positive findings as well as constructive feedback and recommended improvements for future SDK and documentation revisions.

---

## 2. What We Loved (Protocol Strengths)

### 1. Unified Single-Book Architecture
The mathematical primitive where Up and Down tokens trade on a single order book with prices as Up probabilities in `(0, 1)` is brilliant:
- Down prices being inherently `1 - p` eliminates the fragmentation of separate YES/NO pools.
- The ability to cross two opposite-side buyers without existing seller inventory (minting from combined collateral) allows liquidity bootstrapping with zero naked shorting.

### 2. CREATE3 Deterministic Addresses
Deploying core protocol proxies (`BinaryMarketsModule`, `MarketsCore`, `BinarySettlement`, `OutcomeToken6909`) to identical addresses across Somnia Shannon Testnet (`50312`) and Somnia Mainnet (`5031`) significantly reduced configuration complexity and deployment bugs.

### 3. High-Throughput Execution on Somnia
Somnia’s sub-second block times and unthrottled public RPC endpoints (`https://api.infra.testnet.somnia.network/`) allowed our extension background worker to poll block heights and validate on-chain contract states with negligible latency.

### 4. Direct Markdown Documentation Endpoints
The inclusion of `.md` endpoints for GitBook pages (e.g. `https://docs.dreamdex.io/developers/event-contracts.md` and `llms.txt`) enabled seamless integration and LLM agent reasoning.

---

## 3. Key Observations & Recommendations

### A. Clarification on Testnet Web Application Domains
* **Observation:** Several community references and intuitive assumptions lead developers to look for `https://testnet.dreamdex.io` for testnet event contract trading, which currently results in an unresolvable DNS domain (`NXDOMAIN`). The official live dApp interface is hosted at `https://app.dreamdex.io`.
* **Recommendation:** Explicitly document the canonical dApp URL (`https://app.dreamdex.io`) with network-switching guidance prominently on the [Developer Overview](https://docs.dreamdex.io/developers/developers.md) and hackathon portal.

### B. WebSocket Feed Stream Resumption & Sequence Numbers
* **Observation:** The public WebSocket feed (`wss://stg.api.dreamdex.io/v0/ws/public`) does not provide sequence numbers (`seqNum`) or a resume cursor on reconnects. When a WebSocket connection drops due to client sleep or server recycling (`1001 Going Away`), the client must perform a cold start, re-subscribe, and fetch snapshots.
* **Recommendation:** Adding an incremental sequence number per channel/symbol or a short message replay buffer (`lastSeqNumber`) would allow lightweight clients (such as browser extensions and mobile apps) to verify continuity and skip full REST re-hydration.

### C. Account-Wide Orders/Fills Channel
* **Observation:** Currently, the WebSocket `order` channel is strictly per-`orderId` (`{"operation": "subscribe", "channel": "order", "params": {"orderId": "..."}}`). For algorithmic bots placing high-frequency orders or multi-contract monitoring applications, subscribing and unsubscribing per individual order adds network roundtrips.
* **Recommendation:** Introduce an authenticated account-level channel (e.g. `{"channel": "user:orders", "params": {"wallet": "0x..."}}`) that emits fill and cancellation events across all active markets for a given signer.

### D. Decimal Scaling Documentation between Collaterals
* **Observation:** Testnet collateral (`tUSDC`) uses **6 decimals** (`0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E`), whereas Mainnet collateral (`USDso`) uses **18 decimals** (`0x00000022dA000002656c64D9eA6011ea952D008A`). A fixed `1e18` scale factor breaks book reads and pricing on testnet by a factor of 10¹².
* **Recommendation:** While the [Gotchas](https://docs.dreamdex.io/developers/event-contracts/gotchas.md) page mentions this, we suggest providing a standard `parseCollateralUnits(amount, network)` helper directly in `@somnia-chain/markets-sdk` so developers avoid manual scaling traps.

### E. Indexer Lag Warning in SDK
* **Observation:** The indexer can lag behind the live chain by several blocks. As noted in the recipes, gating orders on `exchange.client.getMarketOnchain(marketId).status === 1` is critical.
* **Recommendation:** Make this check the default inside `exchange.createOrder()` or add a boolean flag `{ verifyOnchain: true }` in the unified SDK tier to prevent beginners from sending transactions to finalized or paused pools.

---

## 4. Conclusion

The Somnia and DreamDEX engineering teams have built a robust, high-performance foundation for on-chain derivatives. The developer experience is already far ahead of legacy L2 order book implementations. Implementing the minor stream resumption and documentation enhancements above will further solidify DreamDEX as the gold standard for prediction market primitives.
