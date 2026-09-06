// OddsLens Shadow DOM Widget Component
(function () {
  if (typeof window !== 'undefined' && window.__ODDSLENS_WIDGET_LOADED__) {
    return;
  }
  if (typeof window !== 'undefined') {
    window.__ODDSLENS_WIDGET_LOADED__ = true;
  }

  const ICONS = {
    SPARKLE: `<svg class="ai-sparkle-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path><path d="M5 3v4"></path><path d="M19 17v4"></path><path d="M3 5h4"></path><path d="M17 19h4"></path></svg>`,
    BULLISH: `<svg class="sentiment-svg bullish" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>`,
    BEARISH: `<svg class="sentiment-svg bearish" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline><polyline points="17 18 23 18 23 12"></polyline></svg>`,
    NEUTRAL: `<svg class="sentiment-svg neutral" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    ARROW_UP: `<svg class="side-arrow-svg" width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l-8 12h16z"/></svg>`,
    ARROW_DOWN: `<svg class="side-arrow-svg" width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 20l8-12H4z"/></svg>`,
    EXTERNAL_LINK: `<svg class="btn-arrow-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>`
  };

  // Plain class definition (compatible with both Chrome classic content scripts and ES module imports)
  class OddsLensWidget extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.market = null;
      this.meta = {};
      this.countdownTimer = null;
      this.betAmount = 10;
      this.isMinimized = false;
      this.isDragging = false;
      this.dragOffset = { x: 0, y: 0 };
      this.audioCtx = null;
      this.aiInsight = null; // Cached AI insight { text, source }
    }

    static get observedAttributes() {
      return [];
    }

    connectedCallback() {
      // Default placement: top-right corner with 24px padding
      if (!this.style.top && !this.style.bottom) {
        this.style.top = '24px';
        this.style.right = '24px';
      }
    }

    disconnectedCallback() {
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }
    }

    init(market, meta = {}) {
      this.market = { ...market };
      this.meta = { ...meta };
      this.betAmount = meta.defaultBetAmount || 10;
      this.isMinimized = false; // Always restore from minimized state on new init
      this.aiInsight = null; // reset on new market
      this.render();
      this.startCountdown();
      // Request AI insight asynchronously after render
      if (this.market.liveData === true) {
        this.fetchAiInsight();
      }
    }

    pulseHighlight() {
      const container = this.shadowRoot?.querySelector('.oddslens-container');
      if (container) {
        container.classList.remove('entering', 'pulsing-up');
        void container.offsetWidth; // Force reflow
        container.classList.add('entering');
        setTimeout(() => container.classList.remove('entering'), 600);
      }
    }

    updateOdds(tickData) {
      if (!this.market || (tickData.marketId && tickData.marketId !== this.market.id)) {
        return;
      }

      const wasLive = this.market.liveData === true;
      const prevProb = this.market.probability;
      this.market.probability = tickData.probability;
      this.market.liveData = true;
      if (tickData.bestBid !== undefined) this.market.bestBid = tickData.bestBid;
      if (tickData.bestAsk !== undefined) this.market.bestAsk = tickData.bestAsk;
      if (tickData.volume24h !== undefined) this.market.volume24h = tickData.volume24h;
      if (tickData.tradeCount !== undefined) this.market.tradeCount = tickData.tradeCount;

      // Trigger visual pulse
      const container = this.shadowRoot.querySelector('.oddslens-container');
      if (container) {
        const isUp = tickData.probability >= prevProb;
        container.classList.remove('pulsing-up', 'pulsing-down');
        // Trigger reflow
        void container.offsetWidth;
        container.classList.add(isUp ? 'pulsing-up' : 'pulsing-down');
        setTimeout(() => {
          container.classList.remove('pulsing-up', 'pulsing-down');
        }, 700);
      }

      // Play subtle audio chime if enabled
      if (this.meta.soundEffects) {
        this.playTickAudio(tickData.probability >= prevProb);
      }

      if (!wasLive || !container) {
        this.render();
        return;
      }

      this.updateDynamicValues();
    }

    setFeedStatus(status) {
      const statusEl = this.shadowRoot?.querySelector('.live-data-pending');
      if (!statusEl) return;
      statusEl.textContent = status === 'UNSUPPORTED'
        ? 'Live event-contract feed unavailable.'
        : status === 'ERROR'
          ? 'Live DreamDEX feed unavailable.'
          : 'Waiting for live DreamDEX data...';
    }

    playTickAudio(isUp) {
      try {
        if (!this.audioCtx) {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (AudioContextClass) this.audioCtx = new AudioContextClass();
        }
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
          this.audioCtx.resume();
        }
        if (this.audioCtx) {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(isUp ? 680 : 420, this.audioCtx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(isUp ? 880 : 340, this.audioCtx.currentTime + 0.08);
          gain.gain.setValueAtTime(0.04, this.audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.08);
          osc.connect(gain);
          gain.connect(this.audioCtx.destination);
          osc.start();
          osc.stop(this.audioCtx.currentTime + 0.08);
        }
      } catch (e) { }
    }

    formatCountdown(seconds) {
      if (seconds <= 0) return 'Settling...';
      const hrs = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      return `${hrs.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
    }

    startCountdown() {
      if (this.countdownTimer) clearInterval(this.countdownTimer);
      this.countdownTimer = setInterval(() => {
        const el = this.shadowRoot.querySelector('.countdown-timer');
        if (el && this.market && this.market.expiry) {
          const remaining = Math.max(0, this.market.expiry - Math.floor(Date.now() / 1000));
          el.textContent = this.formatCountdown(remaining);
          // Add urgency class for last 30 minutes
          if (remaining < 1800 && remaining > 0) {
            el.classList.add('urgent');
          } else {
            el.classList.remove('urgent');
          }
        }
      }, 1000);
    }

    calculatePayouts() {
      const prob = Math.max(0.01, Math.min(0.99, this.market.probability || 0.5));
      const upPayout = (this.betAmount / prob).toFixed(2);
      const downPayout = (this.betAmount / (1 - prob)).toFixed(2);
      const upMultiplier = (1 / prob).toFixed(2);
      const downMultiplier = (1 / (1 - prob)).toFixed(2);
      return { upPayout, downPayout, upMultiplier, downMultiplier };
    }

    render() {
      if (!this.market) return;

      const prob = Math.max(0.01, Math.min(0.99, this.market.probability || 0.5));
      const upPercent = Math.round(prob * 100);
      const downPercent = 100 - upPercent;
      const { upPayout, downPayout, upMultiplier, downMultiplier } = this.calculatePayouts();

      const remaining = Math.max(0, (this.market.expiry || (Math.floor(Date.now() / 1000) + 14400)) - Math.floor(Date.now() / 1000));
      const countdownStr = this.formatCountdown(remaining);

      // CSS injection into shadow root (safe across both Chrome extension and standalone web preview)
      const cssUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
        ? chrome.runtime.getURL('content/widget.css')
        : (window.location.pathname.includes('/demo/') ? '../content/widget.css' : '/content/widget.css');

      if (this.market.liveData !== true) {
        this.shadowRoot.innerHTML = `
          <link rel="stylesheet" href="${cssUrl}">
          <div class="oddslens-container" role="dialog" aria-label="DreamDEX Odds Widget">
            <div class="oddslens-header">
              <div class="brand-left"><span class="brand-badge">ODDSLENS</span><span class="network-tag">Somnia L1</span></div>
              <button class="icon-btn btn-close" title="Close widget">×</button>
            </div>
            <div class="oddslens-body">
              <div class="event-meta"><span class="category-pill">${this.market.category || 'Prediction'}</span></div>
              <h3>${this.market.title || 'Event contract'}</h3>
              <p class="live-data-pending">Waiting for live DreamDEX data...</p>
            </div>
          </div>
        `;
        this.shadowRoot.querySelector('.btn-close')?.addEventListener('click', () => {
          this.style.display = 'none';
        });
        return;
      }

      if (this.isMinimized) {
        this.shadowRoot.innerHTML = `
        <link rel="stylesheet" href="${cssUrl}">
        <div class="oddslens-minimized" title="Click to expand OddsLens">
          <div class="live-dot"></div>
          <span class="minimized-title">${this.market.asset || 'ODDS'}</span>
          <span class="minimized-odds">${upPercent}% UP</span>
        </div>
      `;
        this.shadowRoot.querySelector('.oddslens-minimized').addEventListener('click', () => {
          this.isMinimized = false;
          this.render();
          this.startCountdown();
        });
        return;
      }

      // Resolve real working DreamDEX Event Contracts URL (avoiding obsolete /events?symbol= 404s)
      let tradeUrl = this.market.targetTradeUrl || '';
      if (!tradeUrl || tradeUrl.includes('/events?symbol=') || tradeUrl.endsWith('/events')) {
        const asset = (this.market.asset || '').toUpperCase();
        const symbol = (this.market.symbol || '').toUpperCase();
        if (asset === 'BTC' || symbol.includes('BTC')) {
          tradeUrl = 'https://app.dreamdex.io/event-contracts/WBTC:USDso/15m';
        } else if (asset === 'ETH' || symbol.includes('ETH')) {
          tradeUrl = 'https://app.dreamdex.io/event-contracts/WETH:USDso/15m';
        } else {
          tradeUrl = 'https://app.dreamdex.io/event-contracts';
        }
      }

      this.shadowRoot.innerHTML = `
      <link rel="stylesheet" href="${cssUrl}">
      <div class="oddslens-container" role="dialog" aria-label="DreamDEX Odds Widget">
        
        <!-- Header & Drag Bar -->
        <div class="oddslens-header">
          <div class="header-left">
            <div class="brand-badge">
              <svg class="brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <circle cx="12" cy="12" r="9" stroke="#00F0FF" />
                <path d="M7 15l4-4 3 3 4-6" stroke="#00FF87" />
              </svg>
              <span>ODDSLENS</span>
            </div>
            <span class="network-tag">Somnia L1</span>
            <div class="live-indicator">
              <span class="live-dot"></span>
              <span>LIVE</span>
            </div>
          </div>
          <div class="header-actions">
            <button class="icon-btn btn-minimize" title="Minimize widget">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
            <button class="icon-btn btn-close" title="Close widget">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        <!-- Body -->
        <div class="oddslens-body">
          <div class="event-meta">
            <span class="category-pill">${this.market.category || 'Prediction'}</span>
            <div class="expiry-countdown">
              <span>Resolves:</span>
              <span class="countdown-timer">${countdownStr}</span>
            </div>
          </div>

          <div class="event-title">${this.market.title}</div>

          <!-- Odds Probability Dual Bar -->
          <div class="odds-gauge-card">
            <div class="odds-labels-row">
              <div class="side-label">
                <span class="side-title up">${ICONS.ARROW_UP} YES / UP</span>
                <div class="side-odds-wrap">
                  <span class="side-percent up">${upPercent}%</span>
                  <span class="side-payout up-mult">${upMultiplier}x</span>
                </div>
              </div>
              <div class="side-label">
                <span class="side-title down">${ICONS.ARROW_DOWN} NO / DOWN</span>
                <div class="side-odds-wrap">
                  <span class="side-payout down-mult">${downMultiplier}x</span>
                  <span class="side-percent down">${downPercent}%</span>
                </div>
              </div>
            </div>

            <div class="odds-bar-track">
              <div class="odds-bar-fill-up" style="width: ${upPercent}%;"></div>
              <div class="odds-bar-fill-down" style="width: ${downPercent}%;"></div>
            </div>

            <!-- Orderbook Touch Stats -->
            <div class="stats-grid">
              <div class="stat-item">
                <span class="stat-label">Best Bid</span>
                <span class="stat-val bid-val">${(this.market.bestBid || (prob - 0.01)).toFixed(2)}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Best Ask</span>
                <span class="stat-val ask-val">${(this.market.bestAsk || (prob + 0.01)).toFixed(2)}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">24h Vol</span>
                <span class="stat-val vol-val">$${(this.market.volume24h || 10000).toLocaleString()}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Open Interest</span>
                <span class="stat-val oi-val">$${(this.market.openInterest || 198500).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <!-- Quick Bet Calculator -->
          <div class="calc-card">
            <div class="calc-header">
              <span class="calc-title">Simulate Payout ($USDso)</span>
              <div class="calc-chips">
                <button class="chip-btn ${this.betAmount === 5 ? 'active' : ''}" data-val="5">$5</button>
                <button class="chip-btn ${this.betAmount === 10 ? 'active' : ''}" data-val="10">$10</button>
                <button class="chip-btn ${this.betAmount === 25 ? 'active' : ''}" data-val="25">$25</button>
                <button class="chip-btn ${this.betAmount === 50 ? 'active' : ''}" data-val="50">$50</button>
              </div>
            </div>
            <div class="calc-payout-row">
              <span>Betting $${this.betAmount} on UP pays: <strong class="payout-val up">$${upPayout}</strong></span>
              <span>on DOWN pays: <strong class="payout-val down">$${downPayout}</strong></span>
            </div>
          </div>

          <!-- Candidates switcher if multiple detected -->
          ${this.renderCandidatesSwitcher()}

          <!-- Sentiment Analysis Badge -->
          ${this.renderSentimentBadge()}

          <!-- AI Insight Card -->
          ${this.renderAiInsightCard()}

          <!-- Action Button: Trade on DreamDEX -->
          <div class="action-row">
            <a class="trade-btn" href="${tradeUrl}" target="_blank" rel="noopener noreferrer">
              <span>Trade on DreamDEX</span>
              <span class="btn-arrow">${ICONS.EXTERNAL_LINK}</span>
            </a>
          </div>

        </div>
      </div>
    `;

      this.attachEventListeners();
      // Trigger entry animation
      requestAnimationFrame(() => {
        const container = this.shadowRoot.querySelector('.oddslens-container');
        if (container) {
          container.classList.add('entering');
          setTimeout(() => container.classList.remove('entering'), 500);
        }
      });
    }

    renderCandidatesSwitcher() {
      if (!this.meta.candidates || this.meta.candidates.length <= 1) return '';
      const otherCandidates = this.meta.candidates.filter(c => c.id !== this.market.id);
      if (otherCandidates.length === 0) return '';

      return `
      <div class="candidates-bar">
        <span>Related market:</span>
        <span class="candidate-pill" data-id="${otherCandidates[0].id}">
          ${otherCandidates[0].title.slice(0, 32)}...
        </span>
      </div>
    `;
    }

    renderSentimentBadge() {
      const sentiment = this.meta.aiAnalysis?.sentiment;
      if (!sentiment) return '';

      const labels = { BULLISH: 'Bullish Context', BEARISH: 'Bearish Context', NEUTRAL: 'Neutral' };
      const label = sentiment.label || 'NEUTRAL';
      const icon = ICONS[label] || ICONS.NEUTRAL;
      const text = labels[label] || 'Neutral';
      const intensity = Math.round((sentiment.intensity || 0) * 100);
      const topWords = (sentiment.topWords || []).slice(0, 3).join(', ');

      return `
      <div class="sentiment-row">
        <span class="sentiment-badge ${label.toLowerCase()}">
          <span class="sentiment-icon">${icon}</span>
          ${text}
        </span>
        <div class="sentiment-bar" title="Sentiment intensity: ${intensity}%">
          <div class="sentiment-fill ${label.toLowerCase()}" style="width: ${intensity}%"></div>
        </div>
      </div>
      ${topWords ? `<div class="sentiment-words">Keywords: ${topWords}</div>` : ''}
    `;
    }

    renderAiInsightCard() {
      // If we already have the insight (from fetchAiInsight), render it directly
      if (this.aiInsight) {
        const isGemini = this.aiInsight.source === 'gemini';
        const isOpenRouter = this.aiInsight.source === 'openrouter';
        const badgeText = isGemini ? 'Gemini AI' : (isOpenRouter ? 'OpenRouter AI' : 'AI Analysis');
        const badgeClass = (isGemini || isOpenRouter) ? 'gemini' : '';
        return `
        <div class="ai-insight-card">
          <div class="ai-card-header">
            <span class="ai-card-icon">${ICONS.SPARKLE}</span>
            AI Market Insight
            <span class="ai-source-badge ${badgeClass}">${badgeText}</span>
          </div>
          <div class="insight-text">${this.escapeHtml(this.aiInsight.text)}</div>
        </div>
      `;
      }

      // Shimmer loading placeholder (insight is being fetched)
      return `
      <div class="ai-insight-card" id="ai-card-loading">
        <div class="ai-card-header">
          <span class="ai-card-icon">${ICONS.SPARKLE}</span>
          AI Market Insight
          <span class="ai-source-badge">Loading...</span>
        </div>
        <div class="insight-shimmer"></div>
        <div class="insight-shimmer"></div>
      </div>
    `;
    }

    escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    async fetchAiInsight() {
      if (!this.market) return;

      const canUseChromeRuntime = typeof chrome !== 'undefined' &&
        chrome.runtime && chrome.runtime.sendMessage;

      if (!canUseChromeRuntime) {
        // Standalone demo: generate deterministic template directly without network
        const prob = this.market?.probability || 0.5;
        const upPct = Math.round(prob * 100);
        const downPct = 100 - upPct;
        const label = this.meta.aiAnalysis?.sentiment?.label || 'NEUTRAL';
        const asset = this.market?.asset || 'this market';
        let text = `${asset} is evenly contested at ${upPct}% YES / ${downPct}% NO — high uncertainty creates opportunity for traders with a directional view.`;
        if (label === 'BULLISH' && upPct >= 60) {
          text = `With ${upPct}% market consensus and bullish article context, traders are pricing in strong conviction on the YES side for ${asset}.`;
        } else if (label === 'BEARISH' && downPct >= 60) {
          text = `${downPct}% of liquidity is positioned NO, aligned with the bearish article tone — consensus leans against the ${asset} event resolving YES.`;
        }
        this.aiInsight = { text, source: 'template' };
        this.updateAiCard();
        return;
      }

      chrome.runtime.sendMessage({
        type: 'GET_AI_INSIGHT',
        payload: {
          market: this.market,
          sentiment: this.meta.aiAnalysis?.sentiment || null,
          headline: this.meta.headline || document.title || '',
        }
      }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response?.success && response.insight) {
          this.aiInsight = response.insight;
          this.updateAiCard();
        }
      });
    }

    updateAiCard() {
      const card = this.shadowRoot?.getElementById('ai-card-loading');
      if (!card || !this.aiInsight) return;

      const isGemini = this.aiInsight.source === 'gemini';
      const isOpenRouter = this.aiInsight.source === 'openrouter';
      const badgeText = isGemini ? 'Gemini AI' : (isOpenRouter ? 'OpenRouter AI' : 'AI Analysis');
      const badgeClass = (isGemini || isOpenRouter) ? 'gemini' : '';

      card.id = 'ai-card-loaded';
      card.innerHTML = `
      <div class="ai-card-header">
        <span class="ai-card-icon">${ICONS.SPARKLE}</span>
        AI Market Insight
        <span class="ai-source-badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="insight-text">${this.escapeHtml(this.aiInsight.text)}</div>
    `;
    }

    updateDynamicValues() {
      const prob = Math.max(0.01, Math.min(0.99, this.market.probability || 0.5));
      const upPercent = Math.round(prob * 100);
      const downPercent = 100 - upPercent;
      const { upPayout, downPayout, upMultiplier, downMultiplier } = this.calculatePayouts();

      const root = this.shadowRoot;
      const upPercentEl = root.querySelector('.side-percent.up');
      const downPercentEl = root.querySelector('.side-percent.down');
      const upMultEl = root.querySelector('.up-mult');
      const downMultEl = root.querySelector('.down-mult');
      const fillUp = root.querySelector('.odds-bar-fill-up');
      const fillDown = root.querySelector('.odds-bar-fill-down');
      const bidEl = root.querySelector('.bid-val');
      const askEl = root.querySelector('.ask-val');
      const volEl = root.querySelector('.vol-val');
      const payoutUpEl = root.querySelector('.payout-val.up');
      const payoutDownEl = root.querySelector('.payout-val.down');

      if (upPercentEl) upPercentEl.textContent = `${upPercent}%`;
      if (downPercentEl) downPercentEl.textContent = `${downPercent}%`;
      if (upMultEl) upMultEl.textContent = `${upMultiplier}x`;
      if (downMultEl) downMultEl.textContent = `${downMultiplier}x`;
      if (fillUp) fillUp.style.width = `${upPercent}%`;
      if (fillDown) fillDown.style.width = `${downPercent}%`;
      if (bidEl) bidEl.textContent = (this.market.bestBid || (prob - 0.01)).toFixed(2);
      if (askEl) askEl.textContent = (this.market.bestAsk || (prob + 0.01)).toFixed(2);
      if (volEl) volEl.textContent = `$${(this.market.volume24h || 10000).toLocaleString()}`;
      if (payoutUpEl) payoutUpEl.textContent = `$${upPayout}`;
      if (payoutDownEl) payoutDownEl.textContent = `$${downPayout}`;
    }

    attachEventListeners() {
      const root = this.shadowRoot;

      // Minimize button
      const minBtn = root.querySelector('.btn-minimize');
      if (minBtn) {
        minBtn.addEventListener('click', () => {
          this.isMinimized = true;
          this.render();
        });
      }

      // Close button
      const closeBtn = root.querySelector('.btn-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          this.style.opacity = '0';
          this.style.transform = 'scale(0.95)';
          setTimeout(() => {
            this.remove();
          }, 200);
        });
      }

      // Bet calculator chips
      const chipBtns = root.querySelectorAll('.chip-btn');
      chipBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          chipBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.betAmount = Number(btn.getAttribute('data-val'));
          this.updateDynamicValues();
        });
      });

      // Related candidate switcher
      const candidatePill = root.querySelector('.candidate-pill');
      if (candidatePill) {
        candidatePill.addEventListener('click', () => {
          const id = candidatePill.getAttribute('data-id');
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ type: 'GET_STATE' }, (res) => {
              if (res && res.markets) {
                const nextMarket = res.markets.find(m => m.id === id);
                if (nextMarket) {
                  this.init(nextMarket, this.meta);
                }
              }
            });
          } else if (this.meta.candidates) {
            const nextMarket = this.meta.candidates.find(m => m.id === id);
            if (nextMarket) this.init(nextMarket, this.meta);
          }
        });
      }

      // Draggable header
      const header = root.querySelector('.oddslens-header');
      if (header) {
        header.addEventListener('mousedown', (e) => {
          this.isDragging = true;
          const rect = this.getBoundingClientRect();
          this.dragOffset.x = e.clientX - rect.left;
          this.dragOffset.y = e.clientY - rect.top;

          const onMouseMove = (moveEvent) => {
            if (!this.isDragging) return;
            const newLeft = Math.max(10, Math.min(window.innerWidth - rect.width - 10, moveEvent.clientX - this.dragOffset.x));
            const newTop = Math.max(10, Math.min(window.innerHeight - rect.height - 10, moveEvent.clientY - this.dragOffset.y));
            this.style.left = `${newLeft}px`;
            this.style.top = `${newTop}px`;
            this.style.right = 'auto';
          };

          const onMouseUp = () => {
            this.isDragging = false;
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
          };

          window.addEventListener('mousemove', onMouseMove);
          window.addEventListener('mouseup', onMouseUp);
        });
      }
    }
  }

  // Safe Custom Elements registration & factory
  const hasCustomElements = typeof window !== 'undefined' &&
    typeof window.customElements !== 'undefined' &&
    window.customElements !== null &&
    typeof window.customElements.define === 'function';

  if (hasCustomElements) {
    try {
      if (!window.customElements.get('odds-lens-overlay')) {
        window.customElements.define('odds-lens-overlay', OddsLensWidget);
      }
    } catch (e) {
      console.warn('[OddsLens] customElements.define skipped:', e);
    }
  }

  // Expose class and universal factory
  if (typeof window !== 'undefined') {
    window.OddsLensWidget = OddsLensWidget;
    window.createOddsLensWidget = function () {
      if (hasCustomElements) {
        try {
          return document.createElement('odds-lens-overlay');
        } catch (e) { }
      }
      // Autonomous fallback element for environments where customElements is null/restricted
      const el = document.createElement('div');
      el.setAttribute('data-oddslens-widget', 'true');
      const proto = OddsLensWidget.prototype;
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name !== 'constructor') {
          el[name] = proto[name];
        }
      }
      if (!el.shadowRoot) {
        el.attachShadow({ mode: 'open' });
      }
      el.market = null;
      el.meta = {};
      el.countdownTimer = null;
      el.betAmount = 10;
      el.isMinimized = false;
      el.isDragging = false;
      el.dragOffset = { x: 0, y: 0 };
      el.audioCtx = null;
      el.aiInsight = null;
      el.style.position = 'fixed';
      el.style.top = '24px';
      el.style.right = '24px';
      el.style.zIndex = '2147483647';
      el.style.display = 'block';
      return el;
    };
  }
})();
