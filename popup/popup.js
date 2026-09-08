import { DEFAULT_MARKETS, DEFAULT_SETTINGS, SOMNIA_NETWORKS } from '../background/manifest-data.js';
import { matchText } from '../background/matching-engine.js';

document.addEventListener('DOMContentLoaded', async () => {
  const wsStatusEl = document.getElementById('ws-status');
  const networkBadgeEl = document.getElementById('network-badge');
  const blockNumberEl = document.getElementById('block-number');
  const toggleAutoDetect = document.getElementById('toggle-autodetect');
  const toggleAudio = document.getElementById('toggle-audio');
  const marketsListEl = document.getElementById('markets-list');
  const marketCountEl = document.getElementById('market-count');
  const testerInput = document.getElementById('tester-input');
  const btnTestMatch = document.getElementById('btn-test-match');
  const testResult = document.getElementById('test-result');
  const resultTitle = document.getElementById('result-title');
  const resultConf = document.getElementById('result-conf');
  const btnPreviewWidget = document.getElementById('btn-preview-widget');
  const btnOpenOptions = document.getElementById('btn-open-options');
  const btnOpenDemo = document.getElementById('btn-open-demo');

  let currentMarkets = [];
  let currentSettings = {};
  let matchedTestMarket = null;

  const isExtensionRuntime = typeof chrome !== 'undefined' &&
    Boolean(chrome.runtime?.id) &&
    typeof chrome.runtime.sendMessage === 'function';

  // 1. Fetch current background worker state
  async function loadState() {
    if (isExtensionRuntime) {
      chrome.runtime.sendMessage({ type: 'GET_STATE' }, (res) => {
        if (!res) return;
        currentMarkets = res.markets || [];
        currentSettings = res.settings || {};
        applyState(res);
      });
    } else {
      currentMarkets = DEFAULT_MARKETS;
      currentSettings = { ...DEFAULT_SETTINGS };
      applyState({
        markets: currentMarkets,
        settings: currentSettings,
        networkInfo: SOMNIA_NETWORKS.testnet,
        somniaBlock: 1845920,
        wsStatus: 'CONNECTED'
      });
    }
  }

  function applyState(res) {
    currentMarkets = res.markets || [];
    currentSettings = res.settings || {};

    // Update Header & Network
    if (res.networkInfo) {
      networkBadgeEl.textContent = res.networkInfo.name;
    }
    if (res.somniaBlock) {
      blockNumberEl.textContent = `Block #${res.somniaBlock.toLocaleString()}`;
    } else {
      blockNumberEl.textContent = 'Somnia Live';
    }

    // Update WS Status
    const isConnected = res.wsStatus === 'CONNECTED';
    if (isConnected) {
      wsStatusEl.className = 'status-pill';
      wsStatusEl.querySelector('.status-text').textContent = 'Connected';
    } else {
      wsStatusEl.className = 'status-pill disconnected';
      wsStatusEl.querySelector('.status-text').textContent = 'Offline';
    }

    // Sync Toggles
    toggleAutoDetect.checked = !!currentSettings.autoDetectEnabled;
    toggleAudio.checked = !!currentSettings.soundEffects;

    // Render Markets
    renderMarkets(currentMarkets);
  }

  function renderMarkets(markets) {
    marketCountEl.textContent = `${markets.length} Markets`;
    marketsListEl.innerHTML = '';

    markets.forEach(m => {
      const hasLiveData = m.liveData === true && Number.isFinite(m.probability);
      const prob = hasLiveData ? m.probability : 0;
      const upPercent = Math.round(prob * 100);
      const downPercent = 100 - upPercent;

      const row = document.createElement('div');
      row.className = 'market-row';
      row.setAttribute('data-id', m.id);
      row.innerHTML = `
        <div class="market-row-top">
          <span class="market-asset">${m.asset} • ${m.title.slice(0, 28)}...</span>
          <span class="market-prob" id="prob-${m.id}">${hasLiveData ? `${upPercent}% UP` : 'Awaiting live data'}</span>
        </div>
        <div class="mini-bar-track">
          <div class="mini-bar-up" id="bar-up-${m.id}" style="width: ${hasLiveData ? `${upPercent}%` : '0%'};"></div>
          <div class="mini-bar-down" id="bar-down-${m.id}" style="width: ${hasLiveData ? `${downPercent}%` : '0%'};"></div>
        </div>
      `;

      // Click to launch widget on active tab
      row.addEventListener('click', () => {
        launchWidgetOnActiveTab(m, 'popup-click');
      });

      marketsListEl.appendChild(row);
    });
  }

  // 2. Settings update listeners
  toggleAutoDetect.addEventListener('change', () => {
    if (isExtensionRuntime) {
      chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        payload: { autoDetectEnabled: toggleAutoDetect.checked }
      });
    }
  });

  toggleAudio.addEventListener('change', () => {
    if (isExtensionRuntime) {
      chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        payload: { soundEffects: toggleAudio.checked }
      });
    }
  });

  // 3. Keyword Match Tester
  function runTest() {
    const text = testerInput.value.trim();
    if (!text) return;

    if (isExtensionRuntime) {
      chrome.runtime.sendMessage({ type: 'MATCH_TEXT', payload: { text } }, displayTestResult);
    } else {
      const res = matchText(text, currentMarkets, 0.2);
      displayTestResult(res);
    }
  }

  function displayTestResult(res) {
    if (res && res.bestMatch) {
      matchedTestMarket = res.bestMatch;
      testResult.classList.remove('hidden');
      resultTitle.textContent = res.bestMatch.title;
      resultConf.textContent = `${Math.round(res.confidence * 100)}% Match`;
      if (res.isFallback) {
        resultConf.textContent = 'Fallback / Trending';
        resultConf.style.color = '#FBBF24';
      } else {
        resultConf.style.color = '#00FF87';
      }
    }
  }

  btnTestMatch.addEventListener('click', runTest);
  testerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runTest();
  });

  btnPreviewWidget.addEventListener('click', () => {
    if (matchedTestMarket) {
      launchWidgetOnActiveTab(matchedTestMarket, 'tester-launch');
    }
  });

  function getDemoBaseUrl() {
    const url = currentSettings?.demoServerUrl || DEFAULT_SETTINGS?.demoServerUrl || 'http://localhost:3000';
    return url.replace(/\/$/, '');
  }

  function getDemoUrlForMarket(market) {
    const base = getDemoBaseUrl();
    const asset = (market?.asset || '').toUpperCase();
    if (asset === 'ETH') {
      return `${base}/demo/eth-article.html`;
    }
    if (asset === 'BOTNAV') {
      return `${base}/demo/ai-agent-article.html`;
    }
    if (asset === 'SOMI') {
      return `${base}/demo/somnia-article.html`;
    }
    if (asset === 'FED') {
      return `${base}/demo/macro-article.html`;
    }
    if (asset === 'UCL') {
      return `${base}/demo/sports-article.html`;
    }
    return `${base}/demo/crypto-article.html`;
  }

  // 4. Helper to launch widget on active tab
  async function launchWidgetOnActiveTab(market, trigger) {
    const demoUrl = getDemoUrlForMarket(market);

    if (isExtensionRuntime) {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const activeTab = tabs && tabs[0];
        const tabUrl = activeTab?.url || '';

        // If active tab cannot receive content scripts, open the hosted demo directly
        if (!activeTab || !activeTab.id || tabUrl.startsWith('chrome://') || tabUrl.startsWith('chrome-extension://') || tabUrl.startsWith('about:') || tabUrl.startsWith('edge://')) {
          chrome.tabs.create({ url: demoUrl });
          return;
        }

        const tabId = activeTab.id;
        const msg = {
          type: 'SHOW_ODDS_WIDGET',
          trigger,
          market,
          confidence: 1.0
        };

        try {
          await chrome.tabs.sendMessage(tabId, msg);
          setTimeout(() => {
            try { window.close(); } catch (e) { }
          }, 100);
        } catch (err) {
          // If tab was loaded before extension update, dynamically inject scripts and retry
          if (chrome.scripting && chrome.scripting.executeScript) {
            try {
              await chrome.scripting.executeScript({
                target: { tabId },
                files: ['content/widget.js', 'content/content-script.js']
              });
              setTimeout(() => {
                chrome.tabs.sendMessage(tabId, msg).catch(() => { });
                setTimeout(() => {
                  try { window.close(); } catch (e) { }
                }, 100);
              }, 150);
            } catch (injectErr) {
              console.warn('[OddsLens] Script injection fallback failed; opening hosted demo:', injectErr);
              chrome.tabs.create({ url: demoUrl });
            }
          } else {
            chrome.tabs.create({ url: demoUrl });
          }
        }
      });
    } else {
      // Standalone web preview: navigate to hosted demo article
      window.open(demoUrl, '_blank');
    }
  }

  // 5. Navigation Links
  btnOpenOptions.addEventListener('click', () => {
    if (isExtensionRuntime) {
      chrome.runtime.openOptionsPage();
    } else {
      window.location.href = '../options/options.html';
    }
  });

  btnOpenDemo.addEventListener('click', () => {
    const demoUrl = `${getDemoBaseUrl()}/demo/index.html`;
    if (isExtensionRuntime) {
      chrome.tabs.create({ url: demoUrl });
    } else {
      window.open(demoUrl, '_blank');
    }
  });

  // 6. Live odds updates in popup
  if (isExtensionRuntime) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'ODDS_UPDATE' && msg.payload) {
        updateMarketRow(msg.payload);
      }
    });
  } else {
    // Standalone preview has no live DreamDEX connection.
  }

  function updateMarketRow({ marketId, probability }) {
    const probEl = document.getElementById(`prob-${marketId}`);
    const barUp = document.getElementById(`bar-up-${marketId}`);
    const barDown = document.getElementById(`bar-down-${marketId}`);
    if (probEl && barUp && barDown) {
      const upPercent = Math.round(probability * 100);
      const downPercent = 100 - upPercent;
      probEl.textContent = `${upPercent}% UP`;
      barUp.style.width = `${upPercent}%`;
      barDown.style.width = `${downPercent}%`;
    }
  }

  // Initial load
  await loadState();
});
