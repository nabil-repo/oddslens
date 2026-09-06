import { DEFAULT_MARKETS, DEFAULT_SETTINGS, SOMNIA_NETWORKS } from '../background/manifest-data.js';
import { matchText } from '../background/matching-engine.js';

document.addEventListener('DOMContentLoaded', async () => {
  const wsStatusEl = document.getElementById('ws-status');
  const networkBadgeEl = document.getElementById('network-badge');
  const blockNumberEl = document.getElementById('block-number');
  const toggleAutoDetect = document.getElementById('toggle-autodetect');
  const toggleSimulation = document.getElementById('toggle-simulation');
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

  const isExtensionRuntime = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;

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
    const isConnected = res.wsStatus === 'CONNECTED' || currentSettings.simulationMode;
    if (isConnected) {
      wsStatusEl.className = 'status-pill';
      wsStatusEl.querySelector('.status-text').textContent = currentSettings.simulationMode ? 'Simulating' : 'Connected';
    } else {
      wsStatusEl.className = 'status-pill disconnected';
      wsStatusEl.querySelector('.status-text').textContent = 'Offline';
    }

    // Sync Toggles
    toggleAutoDetect.checked = !!currentSettings.autoDetectEnabled;
    toggleSimulation.checked = !!currentSettings.simulationMode;
    toggleAudio.checked = !!currentSettings.soundEffects;

    // Render Markets
    renderMarkets(currentMarkets);
  }

  function renderMarkets(markets) {
    marketCountEl.textContent = `${markets.length} Markets`;
    marketsListEl.innerHTML = '';

    markets.forEach(m => {
      const prob = m.probability || 0.5;
      const upPercent = Math.round(prob * 100);
      const downPercent = 100 - upPercent;

      const row = document.createElement('div');
      row.className = 'market-row';
      row.setAttribute('data-id', m.id);
      row.innerHTML = `
        <div class="market-row-top">
          <span class="market-asset">${m.asset} • ${m.title.slice(0, 28)}...</span>
          <span class="market-prob" id="prob-${m.id}">${upPercent}% UP</span>
        </div>
        <div class="mini-bar-track">
          <div class="mini-bar-up" id="bar-up-${m.id}" style="width: ${upPercent}%;"></div>
          <div class="mini-bar-down" id="bar-down-${m.id}" style="width: ${downPercent}%;"></div>
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

  toggleSimulation.addEventListener('change', () => {
    if (isExtensionRuntime) {
      chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        payload: { simulationMode: toggleSimulation.checked }
      });
      loadState();
    } else {
      currentSettings.simulationMode = toggleSimulation.checked;
      loadState();
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

  // 4. Helper to launch widget on active tab
  function launchWidgetOnActiveTab(market, trigger) {
    if (isExtensionRuntime) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'SHOW_ODDS_WIDGET',
            trigger,
            market,
            confidence: 1.0
          }).catch(err => {
            console.warn('Could not launch widget on tab', err);
          });
        }
      });
    } else {
      // Standalone web preview: navigate to demo article
      window.open('../demo/crypto-article.html', '_blank');
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
    if (isExtensionRuntime) {
      chrome.tabs.create({ url: chrome.runtime.getURL('demo/index.html') });
    } else {
      window.location.href = '../demo/index.html';
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
    // Standalone tick simulator
    setInterval(() => {
      if (currentMarkets.length > 0) {
        const m = currentMarkets[Math.floor(Math.random() * currentMarkets.length)];
        const delta = (Math.random() - 0.48) * 0.02;
        m.probability = Math.max(0.1, Math.min(0.9, Math.round((m.probability + delta) * 1000) / 1000));
        updateMarketRow({ marketId: m.id, probability: m.probability });
      }
    }, 2800);
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
