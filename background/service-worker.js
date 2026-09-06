// Central background service worker for OddsLens Manifest V3 Extension

import { DEFAULT_MARKETS, DEFAULT_SETTINGS, SOMNIA_NETWORKS } from './manifest-data.js';
import { matchUrl, matchText } from './matching-engine.js';
import { DreamDexClient } from './dreamdex-client.js';
import { analyzeArticle, callAiInsight, callGeminiInsight, generateInsightTemplate } from './ai-engine.js';

let markets = [];
let settings = { ...DEFAULT_SETTINGS };
let dreamDexClient = null;
let lastSomniaBlock = null;
let blockPollInterval = null;
let feedsInitialized = false;
let localEventPollInterval = null;
let localEventPollInFlight = false;
const LOCAL_EVENT_API = 'http://localhost:3000/api/dreamdex';
// Cache: marketId+probBucket → { text, source, ts }
const insightCache = new Map();

// Global initialization promise to ensure markets & settings are always loaded across MV3 lifecycle
let initPromise = null;

async function ensureInitialized() {
  if (markets && markets.length > 0) return;
  if (!initPromise) {
    initPromise = (async () => {
      await initStorage();
      setupFeeds();
    })();
  }
  await initPromise;
}

// Ensure storage & feeds are initialized as soon as the service worker loads
ensureInitialized();

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
      title: "Check DreamDEX odds for '%s'",
      contexts: ['selection']
    }, () => {
      if (chrome.runtime.lastError) {
        // Silently ignore if already exists
      }
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

function markAsLivePending(market) {
  return {
    ...market,
    probability: null,
    bestBid: null,
    bestAsk: null,
    volume24h: null,
    openInterest: null,
    tradeCount: null,
    expiry: null,
    liveData: false,
    targetTradeUrl: getMarketTradeUrl(market)
  };
}

// Initialize persistent storage
async function initStorage() {
  const data = await chrome.storage.local.get(['markets', 'settings']);

  if (!data.markets || !Array.isArray(data.markets) || data.markets.length === 0) {
    markets = DEFAULT_MARKETS.map(markAsLivePending);
    await chrome.storage.local.set({ markets });
  } else {
    // Sanitize any existing cached markets that may have the obsolete /events?symbol= 404 URL
    markets = data.markets.map(m => m._fromLiveFeed ? m : markAsLivePending(m));
    await chrome.storage.local.set({ markets });
  }

  if (!data.settings) {
    settings = { ...DEFAULT_SETTINGS };
    await chrome.storage.local.set({ settings });
  } else {
    settings = { ...DEFAULT_SETTINGS, ...data.settings, simulationMode: false };
    if (settings.openRouterModel === 'google/gemini-2.0-flash-001' || settings.openRouterModel === 'google/gemini-2.5-flash') {
      settings.openRouterModel = DEFAULT_SETTINGS.openRouterModel;
    }
    await chrome.storage.local.set({ settings });
  }

  console.log('[OddsLens] Loaded', markets.length, 'markets. Live data mode enabled.');
}

// Setup the real DreamDEX WebSocket client and Somnia RPC polling.
function setupFeeds() {
  if (feedsInitialized) return;
  feedsInitialized = true;

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

  const symbols = markets.map(m => m.symbol).filter(Boolean);
  const hasEventContracts = symbols.length > 0 && symbols.every(symbol => /#(YES|NO)$/i.test(symbol));
  if (hasEventContracts) {
    console.log('[OddsLens] Using local Markets SDK bridge for live event-contract data.');
    dreamDexClient.updateStatus('CONNECTED');
    startLocalEventFeed();
    startBlockPolling();
    return;
  }

  dreamDexClient.connect();
  dreamDexClient.subscribe(symbols);

  // Poll Somnia Shannon block number every 15 seconds
  startBlockPolling();
}

function extractBookPrice(level) {
  if (Array.isArray(level)) return Number(level[0]);
  if (level && typeof level === 'object') return Number(level.price);
  return Number(level);
}

async function pollLocalEventFeed() {
  if (localEventPollInFlight) return;
  localEventPollInFlight = true;

  try {
    const marketsResponse = await fetch(`${LOCAL_EVENT_API}/event-markets`, { cache: 'no-store' });
    if (!marketsResponse.ok) throw new Error(`event-markets returned ${marketsResponse.status}`);
    const liveMarkets = await marketsResponse.json();

    for (const curatedMarket of markets) {
      const candidate = liveMarkets
        .filter(market => market.asset === curatedMarket.asset)
        .sort((a, b) => (b.expiry || 0) - (a.expiry || 0))[0];
      if (!candidate) continue;

      const bookResponse = await fetch(
        `${LOCAL_EVENT_API}/event-orderbooks?symbol=${encodeURIComponent(candidate.symbol)}`,
        { cache: 'no-store' }
      );
      if (!bookResponse.ok) continue;
      const book = await bookResponse.json();
      const bestBid = extractBookPrice(book.bids?.[0]);
      const bestAsk = extractBookPrice(book.asks?.[0]);
      const hasQuote = Number.isFinite(bestBid) && Number.isFinite(bestAsk);

      curatedMarket.liveSymbol = candidate.symbol;
      curatedMarket.title = candidate.title || curatedMarket.title;
      curatedMarket.expiry = candidate.expiry || null;
      curatedMarket.liveData = hasQuote;
      curatedMarket.bestBid = hasQuote ? bestBid : null;
      curatedMarket.bestAsk = hasQuote ? bestAsk : null;
      curatedMarket.probability = hasQuote
        ? Math.round(((bestBid + bestAsk) / 2) * 1000) / 1000
        : null;

      if (hasQuote) {
        broadcastToTabs({
          type: 'ODDS_UPDATE',
          payload: {
            marketId: curatedMarket.id,
            symbol: curatedMarket.liveSymbol,
            probability: curatedMarket.probability,
            bestBid,
            bestAsk,
            source: 'somnia-markets-sdk'
          }
        });
      }
    }

    broadcastToTabs({ type: 'MARKETS_CHANGED', markets });
  } catch (error) {
    console.warn('[OddsLens] Local event bridge unavailable:', error.message);
    dreamDexClient.updateStatus('ERROR');
  } finally {
    localEventPollInFlight = false;
  }
}

function startLocalEventFeed() {
  if (localEventPollInterval) clearInterval(localEventPollInterval);
  pollLocalEventFeed();
  localEventPollInterval = setInterval(pollLocalEventFeed, 10000);
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

  if (!targetMarket) {
    console.warn('[OddsLens] Live update symbol did not match a configured market:', symbol);
    return;
  }

  const hasLastPrice = Number.isFinite(update.lastPrice);
  const hasOrderbook = Number.isFinite(update.bestBid) && Number.isFinite(update.bestAsk);
  if (!hasLastPrice && !hasOrderbook) return;

  targetMarket.liveData = true;

  if (update.bestBid !== null && update.bestBid !== undefined) {
    targetMarket.bestBid = update.bestBid;
  }
  if (update.bestAsk !== null && update.bestAsk !== undefined) {
    targetMarket.bestAsk = update.bestAsk;
  }
  if (update.lastPrice !== null && update.lastPrice !== undefined) {
    targetMarket.probability = update.lastPrice;
  }
  if (update.volume24h !== null && update.volume24h !== undefined) {
    targetMarket.volume24h = update.volume24h;
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

// ─── Broadcast Helper ─────────────────────────────────────────────────────────

function broadcastToTabs(message) {
  // Also broadcast internally to extension views (popup, options page)
  try {
    chrome.runtime.sendMessage(message).catch(() => { });
  } catch (e) { }

  chrome.tabs.query({ status: 'complete' }, (tabs) => {
    if (!tabs || !Array.isArray(tabs)) return;
    for (const tab of tabs) {
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) continue;
      try {
        chrome.tabs.sendMessage(tab.id, message).catch(() => { });
      } catch (e) { }
    }
  });
}

// ─── Context Menu Handler ─────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  await ensureInitialized();
  if (info.menuItemId === 'oddslens-check-odds' && info.selectionText && tab?.id) {
    const availableMarkets = (markets && markets.length > 0) ? markets : DEFAULT_MARKETS;
    const matchResult = matchText(info.selectionText, availableMarkets, settings.minMatchConfidence);
    const targetMarket = matchResult.bestMatch || availableMarkets[0];
    const msg = {
      type: 'SHOW_ODDS_WIDGET',
      trigger: 'manual',
      selectedText: info.selectionText,
      market: targetMarket,
      confidence: matchResult.confidence,
      candidates: matchResult.candidates,
      isFallback: matchResult.isFallback
    };

    console.log('[OddsLens] Context menu clicked for:', info.selectionText, 'Matched:', targetMarket?.title);

    const sendToTab = () => new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, msg, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });

    try {
      await sendToTab();
    } catch (err) {
      // If tab was loaded before extension update, dynamically inject scripts and retry.
      if (!chrome.scripting?.executeScript) {
        console.warn('[OddsLens] Context menu message failed:', err.message);
        return;
      }

      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/widget.js', 'content/content-script.js']
        });
        await new Promise(resolve => setTimeout(resolve, 150));
        await sendToTab();
      } catch (injectErr) {
        console.warn('[OddsLens] Context menu injection or retry failed:', injectErr);
      }
    }
  }
});

// ─── Message Router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { type, payload } = request;

  (async () => {
    await ensureInitialized();

    switch (type) {

      case 'CHECK_AUTO_DETECT': {
        if (!settings.autoDetectEnabled) {
          sendResponse({ matched: false, reason: 'auto-detect-disabled' });
          return;
        }
        const availableMarkets = (markets && markets.length > 0) ? markets : DEFAULT_MARKETS;
        const match = matchUrl(payload?.url || sender?.url, availableMarkets);
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
        break;
      }

      case 'MATCH_TEXT': {
        const availableMarkets = (markets && markets.length > 0) ? markets : DEFAULT_MARKETS;
        const result = matchText(payload.text, availableMarkets, settings.minMatchConfidence);
        sendResponse(result);
        break;
      }

      case 'ANALYZE_PAGE': {
        // AI: Run NLP + sentiment on article text
        const { articleText, headline } = payload || {};
        const availableMarkets = (markets && markets.length > 0) ? markets : DEFAULT_MARKETS;
        const analysis = analyzeArticle(articleText, headline, availableMarkets);
        sendResponse({ success: true, analysis });
        break;
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
        settings = { ...settings, ...payload, simulationMode: false };
        chrome.storage.local.set({ settings });

        broadcastToTabs({ type: 'SETTINGS_CHANGED', settings });
        sendResponse({ success: true, settings });
        return true;
      }

      case 'SAVE_MARKETS': {
        markets = payload.markets;
        chrome.storage.local.set({ markets });
        broadcastToTabs({ type: 'MARKETS_CHANGED', markets });
        sendResponse({ success: true, count: markets.length });
        return true;
      }

      case 'RESET_DEFAULTS': {
        markets = DEFAULT_MARKETS.map(markAsLivePending);
        settings = { ...DEFAULT_SETTINGS };
        chrome.storage.local.set({ markets, settings });
        insightCache.clear();
        broadcastToTabs({ type: 'STATE_RESET', markets, settings });
        sendResponse({ success: true });
        return true;
      }

      default:
        sendResponse({ error: 'unknown_message_type' });
        break;
    }
  })();
  return true; // Keep message channel open for async response
});
