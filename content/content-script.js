// Content script for OddsLens browser extension
// Manages auto-detect scan on page load and handles messages from background worker

(async function () {
  // Prevent duplicate injection
  if (window.__ODDSLENS_INJECTED__) return;
  window.__ODDSLENS_INJECTED__ = true;

  console.log('[OddsLens] Content script initialized on', window.location.href);

  // Dynamically load the Widget component
  const scriptUrl = chrome.runtime.getURL('content/widget.js');
  try {
    await import(scriptUrl);
  } catch (err) {
    console.error('[OddsLens] Failed to import widget module', err);
  }

  let activeWidget = null;

  // Helper to attach or reveal widget
  function displayWidget(market, meta = {}) {
    if (!market) return;

    if (!activeWidget || !document.body.contains(activeWidget)) {
      activeWidget = document.createElement('odds-lens-overlay');
      document.body.appendChild(activeWidget);
    }

    activeWidget.init(market, meta);
    activeWidget.style.display = 'block';
    activeWidget.style.opacity = '1';
    activeWidget.style.transform = 'scale(1)';
  }

  // 1. Curated Auto-Detect check on page load
  try {
    chrome.runtime.sendMessage(
      {
        type: 'CHECK_AUTO_DETECT',
        payload: { url: window.location.href }
      },
      (response) => {
        if (chrome.runtime.lastError) {
          return;
        }
        if (response && response.matched && response.market) {
          console.log('[OddsLens] Auto-detected matching market:', response.market.title);
          // Wait a moment for page layout to settle
          setTimeout(() => {
            displayWidget(response.market, {
              trigger: 'auto-detect',
              confidence: response.confidence,
              matchType: response.matchType,
              defaultBetAmount: 10
            });
          }, 600);
        }
      }
    );
  } catch (e) {
    console.warn('[OddsLens] Auto-detect message error', e);
  }

  // 2. Message listener for Manual Context Menu, Live Updates, and Settings
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'SHOW_ODDS_WIDGET': {
        displayWidget(message.market, {
          trigger: message.trigger,
          selectedText: message.selectedText,
          confidence: message.confidence,
          candidates: message.candidates,
          isFallback: message.isFallback
        });
        sendResponse({ success: true });
        break;
      }

      case 'ODDS_UPDATE': {
        if (activeWidget && document.body.contains(activeWidget)) {
          activeWidget.updateOdds(message.payload);
        }
        break;
      }

      case 'SETTINGS_CHANGED': {
        if (activeWidget && document.body.contains(activeWidget)) {
          activeWidget.meta = { ...activeWidget.meta, ...message.settings };
        }
        break;
      }

      default:
        break;
    }
    return true;
  });
})();
