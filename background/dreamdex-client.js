// DreamDEX WebSocket and Somnia RPC Client

export class DreamDexClient {
  constructor(options = {}) {
    this.wsUrl = options.wsUrl || 'wss://stg.api.dreamdex.io/v0/ws/public';
    this.rpcUrl = options.rpcUrl || 'https://api.infra.testnet.somnia.network/';
    this.dexBaseUrl = options.dexUrl || 'https://app.dreamdex.io';
    this.ws = null;
    this.pingInterval = null;
    this.reconnectTimer = null;
    this.reconnectDelay = 2000;
    this.maxReconnectDelay = 30000;
    this.status = 'DISCONNECTED'; // 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR'
    this.subscriptions = new Set();
    this.onUpdateCallback = null;
    this.onStatusChangeCallback = null;
    this.onMarketsCallback = null; // Called when live binary markets list is received
  }

  setUpdateCallback(fn) {
    this.onUpdateCallback = fn;
  }

  setStatusChangeCallback(fn) {
    this.onStatusChangeCallback = fn;
  }

  setMarketsCallback(fn) {
    this.onMarketsCallback = fn;
  }

  updateStatus(newStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      console.log(`[DreamDexClient] Status changed: ${newStatus}`);
      if (this.onStatusChangeCallback) {
        this.onStatusChangeCallback(newStatus);
      }
    }
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.updateStatus('CONNECTING');
    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        this.updateStatus('CONNECTED');
        this.reconnectDelay = 2000;
        this.startHeartbeat();

        // Subscribe to live binary markets discovery feed
        this.subscribeMarkets();

        // Resubscribe to existing symbols if reconnecting
        if (this.subscriptions.size > 0) {
          this.subscribe(Array.from(this.subscriptions));
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (e) {
          console.warn('[DreamDexClient] Failed to parse message', e);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[DreamDexClient] WebSocket error', err);
        this.updateStatus('ERROR');
      };

      this.ws.onclose = (e) => {
        this.updateStatus('DISCONNECTED');
        this.stopHeartbeat();
        this.scheduleReconnect();
      };
    } catch (err) {
      console.error('[DreamDexClient] Connection exception', err);
      this.updateStatus('ERROR');
      this.scheduleReconnect();
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ operation: 'ping' }));
      }
    }, 25000); // Send ping every 25 seconds (connection closes after 60s of silence)
  }

  stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    console.log(`[DreamDexClient] Reconnecting in ${this.reconnectDelay}ms...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay);
      this.connect();
    }, this.reconnectDelay);
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    this.updateStatus('DISCONNECTED');
  }

  subscribe(symbols) {
    const list = Array.isArray(symbols) ? symbols : [symbols];
    list.forEach(s => this.subscriptions.add(s));

    if (this.ws && this.ws.readyState === WebSocket.OPEN && list.length > 0) {
      const msg = {
        operation: 'subscribe',
        channel: 'orderbook',
        params: { symbols: list }
      };
      this.ws.send(JSON.stringify(msg));
    }
  }

  /**
   * Subscribe to the live binary markets discovery channel.
   * The DreamDEX WS server broadcasts available markets on connect.
   */
  subscribeMarkets() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Request all available binary/event contract markets
      this.ws.send(JSON.stringify({ operation: 'subscribe', channel: 'markets', params: {} }));
      // Also request ticker feed for all known symbols to get current probabilities
      this.ws.send(JSON.stringify({ operation: 'subscribe', channel: 'ticker', params: {} }));
    }
  }

  handleMessage(data) {
    if (data.operation === 'pong') {
      return;
    }

    // Process live binary markets list (event contracts discovery)
    if ((data.channel === 'markets' || data.channel === 'event-contracts') && data.data) {
      const rawMarkets = Array.isArray(data.data) ? data.data : data.data.markets || [];
      if (rawMarkets.length > 0 && this.onMarketsCallback) {
        const parsedMarkets = rawMarkets
          .filter(m => m.kind === 'binary' || m.type === 'binary' || m.symbol?.includes('#'))
          .map(m => this.parseLiveMarket(m));
        if (parsedMarkets.length > 0) {
          this.onMarketsCallback(parsedMarkets);
        }
      }
    }

    // Process ticker updates (price snapshots for all markets)
    if (data.channel === 'ticker' && data.data) {
      const tickers = Array.isArray(data.data) ? data.data : [data.data];
      for (const t of tickers) {
        if (t.symbol?.includes('#YES') || t.symbol?.includes('#NO')) {
          if (this.onUpdateCallback) {
            this.onUpdateCallback({
              type: 'TICKER_UPDATE',
              symbol: t.symbol,
              lastPrice: t.lastPrice ? Number(t.lastPrice) : null,
              bestBid: t.bestBid ? Number(t.bestBid) : null,
              bestAsk: t.bestAsk ? Number(t.bestAsk) : null,
              volume24h: t.volume24h ? Number(t.volume24h) : null,
              raw: t,
            });
          }
        }
      }
    }

    // Process orderbook snapshots and incremental updates
    if (data.channel === 'orderbook' && data.data) {
      const { symbol, bids, asks } = data.data;
      const bestBid = bids && bids[0] ? Number(bids[0][0]) : null;
      const bestAsk = asks && asks[0] ? Number(asks[0][0]) : null;

      if (this.onUpdateCallback) {
        this.onUpdateCallback({
          type: 'ORDERBOOK_UPDATE',
          symbol,
          bestBid,
          bestAsk,
          bids,
          asks,
          raw: data.data
        });
      }
    }
  }

  /**
   * Parse a raw market object from the WS feed into OddsLens market format.
   */
  parseLiveMarket(raw) {
    const symbol = raw.symbol || raw.upSymbol || '';
    const asset = raw.asset || symbol.split('-')[0] || 'UNKNOWN';
    const expiry = raw.expiry ? Number(raw.expiry) : Math.floor(Date.now() / 1000) + 14400;
    const lastPrice = raw.lastPrice ? Number(raw.lastPrice) : 0.5;
    const probability = lastPrice > 0 && lastPrice < 1 ? lastPrice : 0.5;

    return {
      id: raw.marketId || raw.id || symbol,
      symbol,
      counterSymbol: raw.downSymbol || symbol.replace('#YES', '#NO'),
      title: raw.question || raw.title || `${asset} Event Contract`,
      category: raw.category || this.inferCategory(asset),
      asset,
      expiry,
      probability,
      bestBid: probability - 0.01,
      bestAsk: probability + 0.01,
      volume24h: raw.volume24h ? Number(raw.volume24h) : 0,
      openInterest: raw.openInterest ? Number(raw.openInterest) : 0,
      tradeCount: raw.tradeCount ? Number(raw.tradeCount) : 0,
      targetTradeUrl: this.buildTradeUrl(symbol),
      urlPatterns: [],
      keywords: this.inferKeywords(asset, raw.question || raw.title || ''),
      _fromLiveFeed: true,
    };
  }

  /**
   * Build a deep-link URL to the specific market on DreamDEX.
   */
  buildTradeUrl(symbol) {
    if (!symbol) return `${this.dexBaseUrl}/event-contracts`;
    const s = symbol.toUpperCase();
    if (s.includes('BTC')) return `${this.dexBaseUrl}/event-contracts/WBTC:USDso/15m`;
    if (s.includes('ETH')) return `${this.dexBaseUrl}/event-contracts/WETH:USDso/15m`;
    return `${this.dexBaseUrl}/event-contracts`;
  }

  inferCategory(asset) {
    const a = asset.toUpperCase();
    if (['BTC', 'ETH', 'SOMI', 'SOL', 'BNB'].includes(a)) return 'Crypto';
    if (['UCL', 'EPL', 'NFL', 'NBA'].includes(a)) return 'Sports';
    if (['FED', 'CPI', 'GDP'].includes(a)) return 'Macro';
    return 'Prediction';
  }

  inferKeywords(asset, title) {
    const keywords = [asset.toLowerCase()];
    const titleWords = title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    return [...new Set([...keywords, ...titleWords.slice(0, 5)])];
  }

  /**
   * Query current block number on Somnia Shannon Testnet
   */
  async getSomniaBlockNumber() {
    try {
      const res = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_blockNumber',
          params: []
        })
      });
      const json = await res.json();
      if (json && json.result) {
        return parseInt(json.result, 16);
      }
      return null;
    } catch (e) {
      console.warn('[DreamDexClient] Somnia RPC error', e);
      return null;
    }
  }
}
