// Central background service worker for OddsLens Manifest V3 Extension

import { DEFAULT_MARKETS, DEFAULT_SETTINGS, SOMNIA_NETWORKS } from './manifest-data.js';
import { matchUrl, matchText } from './matching-engine.js';
import { DreamDexClient } from './dreamdex-client.js';
import { MockStreamer } from './mock-streamer.js';

let markets = [];
let settings = { ...DEFAULT_SETTINGS };
let dreamDexClient = null;
let mockStreamer = null;
let lastSomniaBlock = null;

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

// Initialize persistent storage
async function initStorage() {
  const data = await chrome.storage.local.get(['markets', 'settings']);

  if (!data.markets || !Array.isArray(data.markets) || data.markets.length === 0) {
    markets = DEFAULT_MARKETS.map(m => {
      // Calculate realistic expiry timestamp (now + offset)
      const expiry = Math.floor(Date.now() / 1000) + (m.expiryOffsetSec || 14400);
      return { ...m, expiry };
    });
    await chrome.storage.local.set({ markets });
  } else {
    markets = data.markets;
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
      rpcUrl: currentNetwork.rpcUrl
    });

    dreamDexClient.setStatusChangeCallback((status) => {
      broadcastToTabs({ type: 'DEX_STATUS_CHANGE', status });
    });

    dreamDexClient.setUpdateCallback((update) => {
      handleRealFeedUpdate(update);
    });
  }

  // Connect to DreamDEX if network isn't pure simulation
  if (settings.network !== 'simulation') {
    dreamDexClient.connect();
    // Subscribe to symbols of all active markets
    const symbols = markets.map(m => m.symbol).filter(Boolean);
    dreamDexClient.subscribe(symbols);
  }

  // Resilient Simulation engine (guarantees live ticks during demo video/eval)
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

  // Poll Somnia Shannon block number periodically
  querySomniaNetwork();
}

async function querySomniaNetwork() {
  if (dreamDexClient) {
    const block = await dreamDexClient.getSomniaBlockNumber();
    if (block) {
      lastSomniaBlock = block;
      console.log(`[OddsLens] Somnia Testnet Block: #${block}`);
    }
  }
}

// Handle updates from real DreamDEX WebSocket
function handleRealFeedUpdate(update) {
  const targetMarket = markets.find(m => m.symbol === update.symbol);
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

// Handle updates from resilient simulation streamer
function handleTickUpdate(tick) {
  // Update local in-memory market copy
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

// Helper to broadcast messages to all active tabs running OddsLens content script
function broadcastToTabs(message) {
  chrome.tabs.query({}, (tabs) => {
    if (!tabs || !Array.isArray(tabs)) return;
    for (const tab of tabs) {
      try {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {
          // Tab might not have content script loaded or be closed
        });
      } catch (e) {}
    }
  });
}

// Handle Context Menu click: "Check DreamDEX odds for '...'"
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

// Central message listener for Content Scripts, Popup, and Options
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
        // Set toolbar badge for visual indicator
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
        return { ...m, expiry };
      });
      settings = { ...DEFAULT_SETTINGS };
      chrome.storage.local.set({ markets, settings });
      if (mockStreamer) {
        mockStreamer.setMarkets(markets);
        mockStreamer.start();
      }
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
