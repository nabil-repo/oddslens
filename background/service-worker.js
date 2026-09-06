// Central background service worker for OddsLens Manifest V3 Extension

import { DEFAULT_MARKETS, DEFAULT_SETTINGS, SOMNIA_NETWORKS } from './manifest-data.js';
import { matchUrl, matchText } from './matching-engine.js';
import { DreamDexClient } from './dreamdex-client.js';
import { MockStreamer } from './mock-streamer.js';
import { analyzeArticle, callAiInsight, callGeminiInsight, generateInsightTemplate } from './ai-engine.js';

let markets = [];
let settings = { ...DEFAULT_SETTINGS };
let dreamDexClient = null;
let mockStreamer = null;
let lastSomniaBlock = null;
let blockPollInterval = null;
// Cache: marketId+probBucket → { text, source, ts }
const insightCache = new Map();

// Initialize extension on install or startup
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[OddsLens] Extension installed/updated:', details.reason);
  await initStorage();
  createContextMenu();
  setupFeeds();
});

chrome.runtime.onStartup.addListener(async () => {
  await initStorage();
  createContextMenu();
  setupFeeds();
});

// Setup context menu item for text selection
function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'oddslens-check-odds',
      title: "🔍 Check DreamDEX odds for '%s'",
      contexts: ['selection']
    });
  });
}

// Helper to resolve real DreamDEX event contracts trading route
function getMarketTradeUrl(m) {
  if (m.targetTradeUrl && !m.targetTradeUrl.includes('/events?symbol=') && !m.targetTradeUrl.endsWith('/events')) {
    return m.targetTradeUrl;
  }
  const asset = (m.asset || '').toUpperCase();
  const symbol = (m.symbol || '').toUpperCase();
  if (asset === 'BTC' || symbol.includes('BTC')) {
    return 'https://app.dreamdex.io/event-contracts/WBTC:USDso/15m';
  }
  if (asset === 'ETH' || symbol.includes('ETH')) {
    return 'https://app.dreamdex.io/event-contracts/WETH:USDso/15m';
  }
  return 'https://app.dreamdex.io/event-contracts';
}

// Initialize persistent storage
async function initStorage() {
  const data = await chrome.storage.local.get(['markets', 'settings']);

  if (!data.markets || !Array.isArray(data.markets) || data.markets.length === 0) {
    markets = DEFAULT_MARKETS.map(m => {
      const expiry = Math.floor(Date.now() / 1000) + (m.expiryOffsetSec || 14400);
      return { ...m, expiry, targetTradeUrl: getMarketTradeUrl(m) };
    });
    await chrome.storage.local.set({ markets });
  } else {
    // Sanitize any existing cached markets that may have the obsolete /events?symbol= 404 URL
    markets = data.markets.map(m => ({
      ...m,
      targetTradeUrl: getMarketTradeUrl(m)
    }));
    await chrome.storage.local.set({ markets });
  }

  if (!data.settings) {
    settings = { ...DEFAULT_SETTINGS };
    await chrome.storage.local.set({ settings });
  } else {
    settings = { ...DEFAULT_SETTINGS, ...data.settings };
  }

  console.log('[OddsLens] Loaded', markets.length, 'markets. Simulation mode:', settings.simulationMode);
}

// Setup real WebSocket client and simulation engine
function setupFeeds() {
  const currentNetwork = SOMNIA_NETWORKS[settings.network] || SOMNIA_NETWORKS.testnet;

  // Real WebSocket client
  if (!dreamDexClient) {
    dreamDexClient = new DreamDexClient({
      wsUrl: currentNetwork.wsFeedUrl,
      rpcUrl: currentNetwork.rpcUrl,
      dexUrl: currentNetwork.dexUrl || 'https://app.dreamdex.io',
    });

    dreamDexClient.setStatusChangeCallback((status) => {
      broadcastToTabs({ type: 'DEX_STATUS_CHANGE', status });
    });

    dreamDexClient.setUpdateCallback((update) => {
      handleRealFeedUpdate(update);
    });

    // Handle live market discovery from WS feed
    dreamDexClient.setMarketsCallback((liveMarkets) => {
      handleLiveMarketsUpdate(liveMarkets);
    });
  }

  // Connect to DreamDEX if network isn't pure simulation
  if (settings.network !== 'simulation') {
    dreamDexClient.connect();
    const symbols = markets.map(m => m.symbol).filter(Boolean);
    dreamDexClient.subscribe(symbols);
  }

  // Resilient Simulation engine
  if (!mockStreamer) {
    mockStreamer = new MockStreamer();
    mockStreamer.setMarkets(markets);
    mockStreamer.setTickCallback((tick) => {
      handleTickUpdate(tick);
    });
  }

  if (settings.simulationMode) {
    mockStreamer.start();
  } else {
    mockStreamer.stop();
  }

  // Poll Somnia Shannon block number every 15 seconds
  startBlockPolling();
}

// ─── Somnia Block Polling ─────────────────────────────────────────────────────

function startBlockPolling() {
  querySomniaNetwork(); // Initial fetch
  if (blockPollInterval) clearInterval(blockPollInterval);
  blockPollInterval = setInterval(querySomniaNetwork, 15000);
}

async function querySomniaNetwork() {
  if (dreamDexClient) {
    const block = await dreamDexClient.getSomniaBlockNumber();
    if (block && block !== lastSomniaBlock) {
      lastSomniaBlock = block;
      console.log(`[OddsLens] Somnia Testnet Block: #${block}`);
      // Broadcast updated block number to popup
      broadcastToTabs({ type: 'SOMNIA_BLOCK_UPDATE', block: lastSomniaBlock });
    }
  }
}

// ─── Live Market Discovery ────────────────────────────────────────────────────

/**
 * Merge live markets from WS feed with existing hardcoded markets.
 * Live markets take precedence for matching; defaults kept as fallback.
 */
function handleLiveMarketsUpdate(liveMarkets) {
  if (!Array.isArray(liveMarkets) || liveMarkets.length === 0) return;

  console.log(`[OddsLens] Received ${liveMarkets.length} live markets from DreamDEX feed`);

  // Merge: keep existing curated markets but update with live data where symbol matches
  const existingIds = new Set(markets.map(m => m.id));
  const newMarkets = liveMarkets.filter(lm => !existingIds.has(lm.id));

  if (newMarkets.length > 0) {
    markets = [...markets, ...newMarkets];
    chrome.storage.local.set({ markets });
    if (mockStreamer) mockStreamer.setMarkets(markets);
    broadcastToTabs({ type: 'MARKETS_CHANGED', markets });
    console.log(`[OddsLens] Added ${newMarkets.length} new live markets. Total: ${markets.length}`);
  }
}

// ─── Feed Update Handlers ─────────────────────────────────────────────────────

function handleRealFeedUpdate(update) {
  // Handle both ORDERBOOK_UPDATE and TICKER_UPDATE
  const symbol = update.symbol;
  if (!symbol) return;

  // Find matching market by symbol (try both YES and base symbol)
  const targetMarket = markets.find(m =>
    m.symbol === symbol ||
    m.symbol === symbol.replace('#YES', '') ||
    symbol.startsWith(m.symbol?.split('#')[0] || '')
  );

  if (!targetMarket) return;

  if (update.bestBid !== null && update.bestBid !== undefined) {
    targetMarket.bestBid = update.bestBid;
  }
  if (update.bestAsk !== null && update.bestAsk !== undefined) {
    targetMarket.bestAsk = update.bestAsk;
  }
  if (targetMarket.bestBid && targetMarket.bestAsk) {
    targetMarket.probability = Math.round(((targetMarket.bestBid + targetMarket.bestAsk) / 2) * 1000) / 1000;
  }

  broadcastToTabs({
    type: 'ODDS_UPDATE',
    payload: {
      marketId: targetMarket.id,
      symbol: targetMarket.symbol,
      probability: targetMarket.probability,
      bestBid: targetMarket.bestBid,
      bestAsk: targetMarket.bestAsk,
      volume24h: targetMarket.volume24h,
      tradeCount: targetMarket.tradeCount,
      tickDirection: 'LIVE',
      source: 'dreamdex-ws'
    }
  });
}

function handleTickUpdate(tick) {
  const market = markets.find(m => m.id === tick.marketId);
  if (market) {
    market.probability = tick.probability;
    market.bestBid = tick.bestBid;
    market.bestAsk = tick.bestAsk;
    market.volume24h = tick.volume24h;
    market.tradeCount = tick.tradeCount;
  }

  broadcastToTabs({
    type: 'ODDS_UPDATE',
    payload: {
      marketId: tick.marketId,
      symbol: tick.symbol,
      probability: tick.probability,
      bestBid: tick.bestBid,
      bestAsk: tick.bestAsk,
      volume24h: tick.volume24h,
      tradeCount: tick.tradeCount,
      tickDirection: tick.tickDirection,
      change: tick.change,
      source: 'simulation'
    }
  });
}

// ─── Broadcast Helper ─────────────────────────────────────────────────────────

function broadcastToTabs(message) {
  chrome.tabs.query({ status: 'complete' }, (tabs) => {
    if (!tabs || !Array.isArray(tabs)) return;
    for (const tab of tabs) {
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) continue;
      try {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {});
      } catch (e) {}
    }
  });
}

// ─── Context Menu Handler ─────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'oddslens-check-odds' && info.selectionText && tab?.id) {
    const matchResult = matchText(info.selectionText, markets, settings.minMatchConfidence);

    chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_ODDS_WIDGET',
      trigger: 'manual',
      selectedText: info.selectionText,
      market: matchResult.bestMatch,
      confidence: matchResult.confidence,
      candidates: matchResult.candidates,
      isFallback: matchResult.isFallback
    }).catch(err => {
      console.warn('[OddsLens] Could not send message to tab', err);
    });
  }
});

// ─── Message Router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { type, payload } = request;

  switch (type) {

    case 'CHECK_AUTO_DETECT': {
      if (!settings.autoDetectEnabled) {
        sendResponse({ matched: false, reason: 'auto-detect-disabled' });
        return true;
      }
      const match = matchUrl(payload?.url || sender?.url, markets);
      if (match) {
        if (sender.tab?.id) {
          chrome.action.setBadgeText({ tabId: sender.tab.id, text: 'ODDS' });
          chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: '#00E5FF' });
        }
        sendResponse({
          matched: true,
          market: match.market,
          matchType: match.matchType,
          confidence: match.confidence
        });
      } else {
        sendResponse({ matched: false });
      }
      return true;
    }

    case 'MATCH_TEXT': {
      const result = matchText(payload.text, markets, settings.minMatchConfidence);
      sendResponse(result);
      return true;
    }

    case 'ANALYZE_PAGE': {
      // AI: Run NLP + sentiment on article text
      const { articleText, headline } = payload || {};
      const analysis = analyzeArticle(articleText, headline, markets);
      sendResponse({ success: true, analysis });
      return true;
    }

    case 'GET_AI_INSIGHT': {
      // AI: Generate market insight via Gemini or deterministic template
      const { market, sentiment, headline } = payload || {};
      if (!market) {
        sendResponse({ success: false, insight: null });
        return true;
      }

      // Check cache: key = marketId + probability bucket (rounded to 5%)
      const probBucket = Math.round((market.probability || 0.5) * 20) / 20;
      const sentLabel = sentiment?.label || 'NEUTRAL';
      const cacheKey = `${market.id}::${probBucket}::${sentLabel}`;

      if (insightCache.has(cacheKey)) {
        const cached = insightCache.get(cacheKey);
        // Cache valid for 5 minutes
        if (Date.now() - cached.ts < 300000) {
          sendResponse({ success: true, insight: cached });
          return true;
        }
      }

      const apiKey = settings.geminiApiKey || '';

      // Async: call Gemini or OpenRouter, respond when done
      callAiInsight(market, sentiment, headline, apiKey, {
        provider: settings.aiProvider,
        model: settings.openRouterModel
      }).then(insight => {
        insightCache.set(cacheKey, { ...insight, ts: Date.now() });
        sendResponse({ success: true, insight });
      }).catch(() => {
        const fallback = { text: generateInsightTemplate(market, sentiment), source: 'template' };
        sendResponse({ success: true, insight: fallback });
      });

      return true; // keep channel open for async response
    }

    case 'GET_STATE': {
      sendResponse({
        markets,
        settings,
        wsStatus: dreamDexClient ? dreamDexClient.status : 'DISCONNECTED',
        somniaBlock: lastSomniaBlock,
        networkInfo: SOMNIA_NETWORKS[settings.network] || SOMNIA_NETWORKS.testnet
      });
      return true;
    }

    case 'UPDATE_SETTINGS': {
      settings = { ...settings, ...payload };
      chrome.storage.local.set({ settings });

      if (mockStreamer) {
        if (settings.simulationMode) {
          mockStreamer.start();
        } else {
          mockStreamer.stop();
        }
      }

      broadcastToTabs({ type: 'SETTINGS_CHANGED', settings });
      sendResponse({ success: true, settings });
      return true;
    }

    case 'SAVE_MARKETS': {
      markets = payload.markets;
      chrome.storage.local.set({ markets });
      if (mockStreamer) {
        mockStreamer.setMarkets(markets);
      }
      broadcastToTabs({ type: 'MARKETS_CHANGED', markets });
      sendResponse({ success: true, count: markets.length });
      return true;
    }

    case 'RESET_DEFAULTS': {
      markets = DEFAULT_MARKETS.map(m => {
        const expiry = Math.floor(Date.now() / 1000) + (m.expiryOffsetSec || 14400);
        return { ...m, expiry, targetTradeUrl: getMarketTradeUrl(m) };
      });
      settings = { ...DEFAULT_SETTINGS };
      chrome.storage.local.set({ markets, settings });
      if (mockStreamer) {
        mockStreamer.setMarkets(markets);
        mockStreamer.start();
      }
      insightCache.clear();
      broadcastToTabs({ type: 'STATE_RESET', markets, settings });
      sendResponse({ success: true });
      return true;
    }

    case 'FORCE_TICK': {
      if (mockStreamer) {
        mockStreamer.forceTick(payload.marketId);
      }
      sendResponse({ success: true });
      return true;
    }

    default:
      sendResponse({ error: 'unknown_message_type' });
      return true;
  }
});
