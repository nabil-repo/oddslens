// Content script for OddsLens browser extension
// Manages auto-detect scan on page load and handles messages from background worker

(async function () {
  // Prevent duplicate injection
  if (window.__ODDSLENS_INJECTED__) return;
  window.__ODDSLENS_INJECTED__ = true;

  console.log('[OddsLens] Content script initialized on', window.location.href);

  // Safe Custom Elements registration check
  const hasCustomElements = typeof window !== 'undefined' &&
    typeof window.customElements !== 'undefined' &&
    window.customElements !== null &&
    typeof window.customElements.define === 'function';

  if (hasCustomElements && typeof OddsLensWidget !== 'undefined') {
    try {
      if (!window.customElements.get('odds-lens-overlay')) {
        window.customElements.define('odds-lens-overlay', OddsLensWidget);
      }
    } catch (e) { }
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
    try {
      const articleEl = document.querySelector('article, [role="main"], main, .article-body, .post-content, .entry-content, .story-body');
      const source = articleEl || document.body;
      if (!source) return '';

      const clone = source.cloneNode(true);
      const noiseSelectors = ['nav', 'header', 'footer', 'aside', '.sidebar', '.ad', '.advertisement',
        '.cookie', '.popup', '.modal', 'script', 'style', 'noscript'];
      noiseSelectors.forEach(sel => {
        clone.querySelectorAll(sel).forEach(el => el.remove());
      });

      return (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 3000);
    } catch (e) {
      return '';
    }
  }

  function extractHeadline() {
    try {
      return (
        document.querySelector('h1')?.textContent?.trim() ||
        document.querySelector('meta[property="og:title"]')?.content ||
        document.title ||
        ''
      ).slice(0, 200);
    } catch (e) {
      return '';
    }
  }

  // ─── AI Page Analysis ─────────────────────────────────────────────────────

  /**
   * Run AI analysis on the current article. Returns { sentiment, nlpMatch }.
   * Includes a 2.5-second timeout so it never blocks widget display.
   */
  async function analyzeCurrentPage() {
    if (pageAnalysis) return pageAnalysis;

    const articleText = extractArticleText();
    const headline = extractHeadline();

    if (articleText.length < 50) return null;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 2500);
      chrome.runtime.sendMessage({
        type: 'ANALYZE_PAGE',
        payload: { articleText, headline }
      }, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError || !response?.success) {
          resolve(null);
          return;
        }
        pageAnalysis = response.analysis;
        resolve(pageAnalysis);
      });
    });
  }

  // ─── Widget Display ───────────────────────────────────────────────────────

  // Attach or reveal widget instantly without blocking
  function displayWidget(market, meta = {}) {
    if (!market) return;

    if (!activeWidget || !document.contains(activeWidget)) {
      activeWidget = document.querySelector('odds-lens-overlay, [data-oddslens-widget="true"]');
      if (!activeWidget) {
        activeWidget = (typeof window.createOddsLensWidget === 'function')
          ? window.createOddsLensWidget()
          : document.createElement('odds-lens-overlay');
      }
      const target = document.body || document.documentElement;
      if (!document.contains(activeWidget) && target) {
        target.appendChild(activeWidget);
      }
    }

    const headline = extractHeadline();

    // Ensure full card is shown even if previously minimized
    activeWidget.isMinimized = false;

    // Immediately initialize and display the widget (instant 0ms response)
    if (activeWidget.init) {
      activeWidget.init(market, { ...meta, headline });
    }
    activeWidget.style.display = 'block';
    activeWidget.style.opacity = '1';
    activeWidget.style.transform = 'scale(1)';

    if (typeof activeWidget.pulseHighlight === 'function') {
      activeWidget.pulseHighlight();
    }

    // Asynchronously run NLP entity refinement in background without blocking display
    analyzeCurrentPage().then((analysis) => {
      if (!analysis) return;
      if (analysis.nlpMatch?.bestMatch && analysis.nlpMatch.confidence > 0.4 && meta.trigger === 'auto-detect') {
        const nlpBest = analysis.nlpMatch.bestMatch;
        if (nlpBest.id !== market.id && activeWidget.init) {
          console.log(`[OddsLens] NLP refinement: ${market.title} → ${nlpBest.title}`);
          activeWidget.init(nlpBest, {
            ...meta,
            aiAnalysis: analysis,
            headline,
            candidates: [{ id: market.id, title: market.title }, ...(analysis.nlpMatch.candidates || [])]
          });
          return;
        }
      }
      activeWidget.meta = { ...activeWidget.meta, aiAnalysis: analysis };
    }).catch(() => {});
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
        if (chrome.runtime.lastError) return;
        if (response && response.matched && response.market) {
          console.log('[OddsLens] Auto-detected matching market:', response.market.title);
          // Wait briefly for host DOM to settle, then mount widget
          setTimeout(() => {
            displayWidget(response.market, {
              trigger: 'auto-detect',
              confidence: response.confidence,
              matchType: response.matchType,
              defaultBetAmount: 10
            });
          }, 300);
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
        const widget = activeWidget || document.querySelector('odds-lens-overlay');
        if (widget && document.body.contains(widget) && typeof widget.updateOdds === 'function') {
          widget.updateOdds(message.payload);
        }
        break;
      }

      case 'SETTINGS_CHANGED': {
        const widget = activeWidget || document.querySelector('odds-lens-overlay');
        if (widget && document.body.contains(widget)) {
          widget.meta = { ...widget.meta, ...message.settings };
        }
        break;
      }

      default:
        break;
    }
    return true;
  });
})();
