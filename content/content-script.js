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
  let pageAnalysis = null; // Cached AI analysis for this page

  // ─── Article Text Extraction ──────────────────────────────────────────────

  /**
   * Extract meaningful article text from the page.
   * Prioritizes article body content over navigation, ads, boilerplate.
   * Returns first ~3000 characters for NLP analysis.
   */
  function extractArticleText() {
    // Try semantic article elements first
    const articleEl = document.querySelector('article, [role="main"], main, .article-body, .post-content, .entry-content, .story-body');
    const source = articleEl || document.body;

    // Clone to avoid modifying DOM
    const clone = source.cloneNode(true);

    // Remove noise elements
    const noiseSelectors = ['nav', 'header', 'footer', 'aside', '.sidebar', '.ad', '.advertisement',
      '.cookie', '.popup', '.modal', 'script', 'style', 'noscript'];
    noiseSelectors.forEach(sel => {
      clone.querySelectorAll(sel).forEach(el => el.remove());
    });

    const text = (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
    return text.slice(0, 3000);
  }

  function extractHeadline() {
    return (
      document.querySelector('h1')?.textContent?.trim() ||
      document.querySelector('meta[property="og:title"]')?.content ||
      document.title ||
      ''
    ).slice(0, 200);
  }

  // ─── AI Page Analysis ─────────────────────────────────────────────────────

  /**
   * Run AI analysis on the current article. Returns { sentiment, nlpMatch }.
   * Caches the result so multiple widget shows don't re-analyze.
   */
  async function analyzeCurrentPage() {
    if (pageAnalysis) return pageAnalysis;

    const articleText = extractArticleText();
    const headline = extractHeadline();

    if (articleText.length < 50) return null;

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'ANALYZE_PAGE',
        payload: { articleText, headline }
      }, (response) => {
        if (chrome.runtime.lastError || !response?.success) {
          resolve(null);
          return;
        }
        pageAnalysis = response.analysis;
        console.log('[OddsLens] AI Analysis:', pageAnalysis);
        resolve(pageAnalysis);
      });
    });
  }

  // ─── Widget Display ───────────────────────────────────────────────────────

  // Helper to attach or reveal widget with optional AI analysis
  async function displayWidget(market, meta = {}) {
    if (!market) return;

    // Run AI analysis on the page before showing widget (non-blocking on first call)
    const analysis = await analyzeCurrentPage().catch(() => null);

    // Check if NLP suggests a better market match
    let resolvedMarket = market;
    let resolvedMeta = { ...meta, aiAnalysis: analysis, headline: extractHeadline() };

    if (analysis?.nlpMatch?.bestMatch && analysis.nlpMatch.confidence > 0.4 && meta.trigger === 'auto-detect') {
      // NLP found a high-confidence match different from URL match — prefer it
      const nlpBest = analysis.nlpMatch.bestMatch;
      if (nlpBest.id !== market.id) {
        console.log(`[OddsLens] NLP override: ${market.title} → ${nlpBest.title} (confidence: ${analysis.nlpMatch.confidence})`);
        resolvedMarket = nlpBest;
        resolvedMeta.candidates = [
          { id: market.id, title: market.title },
          ...(analysis.nlpMatch.candidates || []),
        ];
      }
    }

    if (!activeWidget || !document.body.contains(activeWidget)) {
      activeWidget = document.createElement('odds-lens-overlay');
      document.body.appendChild(activeWidget);
    }

    activeWidget.init(resolvedMarket, resolvedMeta);
    activeWidget.style.display = 'block';
    activeWidget.style.opacity = '1';
    activeWidget.style.transform = 'scale(1)';
  }

  // ─── Auto-Detect on Page Load ─────────────────────────────────────────────

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
          // Wait a moment for page layout to settle, then show widget with AI
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

  // ─── Message Listener ─────────────────────────────────────────────────────

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
