import { DEFAULT_MARKETS, DEFAULT_SETTINGS, SOMNIA_NETWORKS } from '../background/manifest-data.js';
import { matchText } from '../background/matching-engine.js';

document.addEventListener('DOMContentLoaded', async () => {
  const selectNetwork = document.getElementById('select-network');
  const optWsStatus = document.getElementById('opt-ws-status');
  const optRpcStatus = document.getElementById('opt-rpc-status');
  const netBadge = document.getElementById('net-badge');
  const contractsTbody = document.getElementById('contracts-tbody');
  const btnAddContract = document.getElementById('btn-add-contract');
  const contractModal = document.getElementById('contract-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelModal = document.getElementById('btn-cancel-modal');
  const contractForm = document.getElementById('contract-form');
  const modalHeading = document.getElementById('modal-heading');
  const btnResetDefaults = document.getElementById('btn-reset-defaults');
  const btnExportJson = document.getElementById('btn-export-json');
  const importFile = document.getElementById('import-file');
  const sandboxInput = document.getElementById('sandbox-input');
  const btnSandboxTest = document.getElementById('btn-sandbox-test');
  const sandboxResult = document.getElementById('sandbox-result');
  const sandTitle = document.getElementById('sand-title');
  const sandScore = document.getElementById('sand-score');
  const sandTokens = document.getElementById('sand-tokens');
  const toast = document.getElementById('toast');

  let markets = [];
  let settings = {};

  const isExtensionRuntime = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    toast.style.opacity = '1';
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.classList.add('hidden'), 300);
    }, 2400);
  }

  // Load state from background service worker or standalone fallback
  async function loadState() {
    if (isExtensionRuntime) {
      chrome.runtime.sendMessage({ type: 'GET_STATE' }, (res) => {
        if (!res) return;
        markets = res.markets || [];
        settings = res.settings || {};
        applyState(res);
      });
    } else {
      // Standalone web preview fallback
      const savedMarkets = localStorage.getItem('oddslens_preview_markets');
      markets = savedMarkets ? JSON.parse(savedMarkets) : DEFAULT_MARKETS.map(m => ({
        ...m,
        expiry: Math.floor(Date.now() / 1000) + (m.expiryOffsetSec || 14400)
      }));
      settings = { ...DEFAULT_SETTINGS };
      applyState({
        markets,
        settings,
        networkInfo: SOMNIA_NETWORKS.testnet,
        wsStatus: 'CONNECTED'
      });
    }
  }

  function applyState(res) {
    // Sync network selector
    if (settings.network) {
      selectNetwork.value = settings.network;
    }

    if (res.networkInfo) {
      netBadge.textContent = res.networkInfo.name;
    }

    // WS Status
    const isConnected = res.wsStatus === 'CONNECTED' || settings.simulationMode;
    optWsStatus.textContent = isConnected ? (settings.simulationMode ? 'Simulating (Active)' : 'Connected') : 'Disconnected';
    optWsStatus.className = isConnected ? 'stat-value text-green' : 'stat-value';

    renderTable();
  }

  function renderTable() {
    contractsTbody.innerHTML = '';

    markets.forEach(m => {
      const prob = m.probability || 0.5;
      const upPercent = Math.round(prob * 100);
      const downPercent = 100 - upPercent;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div class="table-event-name">${m.title}</div>
          <span class="badge badge-accent">${m.asset}</span>
        </td>
        <td><code class="table-symbol">${m.symbol}</code></td>
        <td>${m.category || 'General'}</td>
        <td>
          <div class="table-odds-badge">${upPercent}% UP / ${downPercent}% DOWN</div>
        </td>
        <td>
          <div class="table-patterns-list">
            ${(m.urlPatterns || []).slice(0, 2).map(p => `<div>${p}</div>`).join('')}
            ${(m.urlPatterns || []).length > 2 ? `<small>+${m.urlPatterns.length - 2} more</small>` : ''}
          </div>
        </td>
        <td>
          <div class="table-keywords" title="${(m.keywords || []).join(', ')}">
            ${(m.keywords || []).join(', ')}
          </div>
        </td>
        <td>
          <div class="table-actions">
            <button class="action-btn btn-edit" data-id="${m.id}">Edit</button>
            <button class="action-btn danger btn-delete" data-id="${m.id}">Delete</button>
          </div>
        </td>
      `;

      // Attach actions
      tr.querySelector('.btn-edit').addEventListener('click', () => openEditModal(m));
      tr.querySelector('.btn-delete').addEventListener('click', () => deleteMarket(m.id));

      contractsTbody.appendChild(tr);
    });
  }

  // Network Switcher
  selectNetwork.addEventListener('change', () => {
    const net = selectNetwork.value;
    if (isExtensionRuntime) {
      chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        payload: {
          network: net,
          simulationMode: net === 'simulation' || settings.simulationMode
        }
      }, () => {
        showToast(`Network switched to ${net}`);
        loadState();
      });
    } else {
      settings.network = net;
      showToast(`Network switched to ${net} (Preview Mode)`);
      loadState();
    }
  });

  // Modal Handling
  function openAddModal() {
    modalHeading.textContent = 'Add Event Contract';
    contractForm.reset();
    document.getElementById('form-id').value = '';
    contractModal.classList.remove('hidden');
  }

  function openEditModal(m) {
    modalHeading.textContent = 'Edit Event Contract';
    document.getElementById('form-id').value = m.id;
    document.getElementById('form-title').value = m.title;
    document.getElementById('form-symbol').value = m.symbol;
    document.getElementById('form-asset').value = m.asset;
    document.getElementById('form-category').value = m.category || 'Crypto';
    document.getElementById('form-prob').value = m.probability || 0.50;
    document.getElementById('form-patterns').value = (m.urlPatterns || []).join(', ');
    document.getElementById('form-keywords').value = (m.keywords || []).join(', ');
    document.getElementById('form-url').value = m.targetTradeUrl || 'https://app.dreamdex.io/event-contracts';
    contractModal.classList.remove('hidden');
  }

  function closeModal() {
    contractModal.classList.add('hidden');
  }

  btnAddContract.addEventListener('click', openAddModal);
  btnCloseModal.addEventListener('click', closeModal);
  btnCancelModal.addEventListener('click', closeModal);

  // Helper to persist markets
  function persistMarkets(callback) {
    if (isExtensionRuntime) {
      chrome.runtime.sendMessage({ type: 'SAVE_MARKETS', payload: { markets } }, callback);
    } else {
      localStorage.setItem('oddslens_preview_markets', JSON.stringify(markets));
      if (callback) callback();
    }
  }

  // Form Submit
  contractForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('form-id').value || `market-${Date.now()}`;
    const title = document.getElementById('form-title').value.trim();
    const symbol = document.getElementById('form-symbol').value.trim();
    const asset = document.getElementById('form-asset').value.trim().toUpperCase();
    const category = document.getElementById('form-category').value;
    const prob = parseFloat(document.getElementById('form-prob').value) || 0.50;
    const urlPatterns = document.getElementById('form-patterns').value
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const keywords = document.getElementById('form-keywords').value
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const targetTradeUrl = document.getElementById('form-url').value.trim() || 'https://app.dreamdex.io/event-contracts';

    const existingIndex = markets.findIndex(m => m.id === id);
    const updatedMarket = {
      id,
      title,
      symbol,
      asset,
      category,
      probability: prob,
      bestBid: Math.round((prob - 0.01) * 100) / 100,
      bestAsk: Math.round((prob + 0.01) * 100) / 100,
      volume24h: 10000,
      expiry: Math.floor(Date.now() / 1000) + 14400,
      urlPatterns,
      keywords,
      targetTradeUrl
    };

    if (existingIndex >= 0) {
      markets[existingIndex] = { ...markets[existingIndex], ...updatedMarket };
      showToast('Market updated successfully');
    } else {
      markets.push(updatedMarket);
      showToast('New market added to manifest');
    }

    persistMarkets(() => {
      closeModal();
      renderTable();
    });
  });

  function deleteMarket(id) {
    if (!confirm('Are you sure you want to remove this event contract?')) return;
    markets = markets.filter(m => m.id !== id);
    persistMarkets(() => {
      showToast('Market removed');
      renderTable();
    });
  }

  // Reset to Defaults
  btnResetDefaults.addEventListener('click', () => {
    if (!confirm('Reset all markets and settings to default hackathon showcase?')) return;
    if (isExtensionRuntime) {
      chrome.runtime.sendMessage({ type: 'RESET_DEFAULTS' }, () => {
        showToast('Defaults restored');
        loadState();
      });
    } else {
      localStorage.removeItem('oddslens_preview_markets');
      markets = DEFAULT_MARKETS.map(m => ({
        ...m,
        expiry: Math.floor(Date.now() / 1000) + (m.expiryOffsetSec || 14400)
      }));
      showToast('Defaults restored (Preview Mode)');
      loadState();
    }
  });

  // Export Manifest JSON
  btnExportJson.addEventListener('click', () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(markets, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `oddslens-manifest-${Date.now()}.json`);
    dlAnchor.click();
    showToast('Manifest exported as JSON');
  });

  // Import Manifest JSON
  importFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (Array.isArray(imported)) {
          markets = imported;
          persistMarkets(() => {
            showToast(`Imported ${imported.length} markets`);
            renderTable();
          });
        } else {
          alert('Invalid manifest JSON format. Expected an array of markets.');
        }
      } catch (err) {
        alert('Could not parse JSON file: ' + err.message);
      }
    };
    reader.readAsText(file);
  });

  // Matcher Sandbox
  function runSandbox() {
    const query = sandboxInput.value.trim();
    if (!query) return;

    if (isExtensionRuntime) {
      chrome.runtime.sendMessage({ type: 'MATCH_TEXT', payload: { text: query } }, displaySandboxResult);
    } else {
      const res = matchText(query, markets, 0.2);
      displaySandboxResult(res);
    }
  }

  function displaySandboxResult(res) {
    if (res && res.bestMatch) {
      sandboxResult.classList.remove('hidden');
      sandTitle.textContent = res.bestMatch.title;
      sandScore.textContent = `${Math.round(res.confidence * 100)}% Confidence (${res.isFallback ? 'Fallback' : 'Direct Match'})`;
      sandScore.style.color = res.isFallback ? '#FBBF24' : '#00FF87';

      sandTokens.innerHTML = '';
      if (res.matchedTokens && res.matchedTokens.length > 0) {
        res.matchedTokens.forEach(tok => {
          const span = document.createElement('span');
          span.className = 'token-pill';
          span.textContent = tok;
          sandTokens.appendChild(span);
        });
      } else {
        sandTokens.innerHTML = '<span class="token-pill">Asset/Fallback Selection</span>';
      }
    }
  }

  btnSandboxTest.addEventListener('click', runSandbox);
  sandboxInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runSandbox();
  });

  // ─── AI Configuration ──────────────────────────────────────────────────────

  const geminiKeyInput = document.getElementById('gemini-api-key');
  const btnToggleKeyVisibility = document.getElementById('btn-toggle-key-visibility');
  const btnTestAiInsight = document.getElementById('btn-test-ai-insight');
  const aiTestResult = document.getElementById('ai-test-result');
  const aiTestTitle = document.getElementById('ai-test-title');
  const aiTestSource = document.getElementById('ai-test-source');
  const aiTestText = document.getElementById('ai-test-text');
  const aiGeminiStatus = document.getElementById('ai-gemini-status');
  const toggleAi = document.getElementById('toggle-ai');

  // Load saved Gemini API key and AI settings
  async function loadAiSettings() {
    if (isExtensionRuntime) {
      const data = await new Promise(resolve => chrome.storage.local.get(['settings'], resolve));
      const s = data.settings || {};
      if (s.geminiApiKey) {
        geminiKeyInput.value = s.geminiApiKey;
        aiGeminiStatus.textContent = 'Key configured ✓';
        aiGeminiStatus.className = 'stat-value text-green';
      }
      if (typeof s.aiEnabled === 'boolean') {
        toggleAi.checked = s.aiEnabled;
      }
    } else {
      const savedKey = localStorage.getItem('oddslens_gemini_key');
      if (savedKey) {
        geminiKeyInput.value = savedKey;
        aiGeminiStatus.textContent = 'Key configured (Local) ✓';
        aiGeminiStatus.className = 'stat-value text-green';
      }
      const savedAi = localStorage.getItem('oddslens_ai_enabled');
      if (savedAi !== null) {
        toggleAi.checked = savedAi === 'true';
      }
    }
  }

  // Save Gemini key on input (debounced)
  let saveKeyTimer = null;
  geminiKeyInput?.addEventListener('input', () => {
    clearTimeout(saveKeyTimer);
    saveKeyTimer = setTimeout(() => {
      const key = geminiKeyInput.value.trim();
      if (isExtensionRuntime) {
        chrome.runtime.sendMessage({
          type: 'UPDATE_SETTINGS',
          payload: { geminiApiKey: key }
        });
      } else {
        localStorage.setItem('oddslens_gemini_key', key);
      }
      if (key.length > 10) {
        aiGeminiStatus.textContent = 'Key configured ✓';
        aiGeminiStatus.className = 'stat-value text-green';
      } else {
        aiGeminiStatus.textContent = 'No key set';
        aiGeminiStatus.className = 'stat-value';
      }
    }, 800);
  });

  // Toggle AI features
  toggleAi?.addEventListener('change', () => {
    if (isExtensionRuntime) {
      chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        payload: { aiEnabled: toggleAi.checked }
      });
    } else {
      localStorage.setItem('oddslens_ai_enabled', toggleAi.checked);
    }
    showToast(toggleAi.checked ? 'AI analysis enabled' : 'AI analysis disabled');
  });

  // Show/hide key
  btnToggleKeyVisibility?.addEventListener('click', () => {
    geminiKeyInput.type = geminiKeyInput.type === 'password' ? 'text' : 'password';
  });

  // Test AI Insight button
  btnTestAiInsight?.addEventListener('click', async () => {
    const key = geminiKeyInput.value.trim();
    const testMarket = markets[0];
    if (!testMarket) { showToast('No markets loaded'); return; }

    btnTestAiInsight.textContent = 'Testing...';
    btnTestAiInsight.disabled = true;

    if (isExtensionRuntime) {
      chrome.runtime.sendMessage({
        type: 'GET_AI_INSIGHT',
        payload: {
          market: testMarket,
          sentiment: { label: 'BULLISH', score: 0.45, intensity: 0.6, topWords: ['surge', 'record', 'momentum'] },
          headline: 'Bitcoin surges to new highs amid strong institutional demand'
        }
      }, (response) => {
        btnTestAiInsight.textContent = 'Test Insight';
        btnTestAiInsight.disabled = false;
        if (response?.success && response.insight) {
          aiTestResult.classList.remove('hidden');
          aiTestTitle.textContent = testMarket.title.slice(0, 40) + '...';
          aiTestSource.textContent = response.insight.source === 'gemini' ? '✨ Gemini AI' : '📊 AI Template';
          aiTestSource.style.color = response.insight.source === 'gemini' ? '#00F0FF' : '#00FF87';
          aiTestText.textContent = response.insight.text;
        }
      });
    } else {
      // Standalone preview
      setTimeout(() => {
        btnTestAiInsight.textContent = 'Test Insight';
        btnTestAiInsight.disabled = false;
        aiTestResult.classList.remove('hidden');
        aiTestTitle.textContent = testMarket.title.slice(0, 40) + '...';
        aiTestSource.textContent = '📊 AI Template (Extension required for Gemini)';
        aiTestSource.style.color = '#00FF87';
        aiTestText.textContent = `At ${Math.round((testMarket.probability || 0.5) * 100)}% probability, this market shows strong YES momentum — aligned with BULLISH article context.`;
      }, 600);
    }
  });

  await loadAiSettings();

  // Initial load
  await loadState();
});
