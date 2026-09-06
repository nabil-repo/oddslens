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
    this.seenChannels = new Set();
    this.lastMessageAt = 0;
    this.dataWatchdog = null;
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
        this.lastMessageAt = Date.now();
        this.startHeartbeat();
        this.startDataWatchdog();

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
        this.stopDataWatchdog();
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

  startDataWatchdog() {
    this.stopDataWatchdog();
    this.dataWatchdog = setInterval(() => {
      if (this.status === 'CONNECTED' && Date.now() - this.lastMessageAt > 15000) {
        console.warn('[DreamDexClient] Connected but no market-data messages received in 15s');
        this.updateStatus('ERROR');
        this.stopDataWatchdog();
        this.stopHeartbeat();
        if (this.ws) {
          try {
            this.ws.close(4000, 'No market data received');
          } catch (e) {
            this.ws = null;
          }
        }
        this.scheduleReconnect();
      }
    }, 5000);
  }

  stopDataWatchdog() {
    if (this.dataWatchdog) {
      clearInterval(this.dataWatchdog);
      this.dataWatchdog = null;
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
    this.stopDataWatchdog();
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

    const eventContractSymbols = list.filter(symbol => /#(YES|NO)$/i.test(symbol));
    if (eventContractSymbols.length > 0) {
      console.warn('[DreamDexClient] Event-contract symbols are not supported by the public spot WebSocket feed:', eventContractSymbols);
      this.stopDataWatchdog();
      this.updateStatus('UNSUPPORTED');
      return;
    }

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
      // The public feed supports orderbook, ohlcv, trades, and order channels.
      // Market discovery and ticker are not valid subscription channels.
    }
  }

  handleMessage(data) {
    this.lastMessageAt = Date.now();
    if (data.channel && !this.seenChannels.has(data.channel)) {
      this.seenChannels.add(data.channel);
      console.log(`[DreamDexClient] Received channel: ${data.channel}`);
    }

    if (data.operation === 'pong') {
      return;
    }

    if (data.type === 'error') {
      console.warn(`[DreamDexClient] Feed error: ${data.errorName || 'unknown'}: ${data.message || 'no message'}`);
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

    // Process orderbook snapshots and incremental updates
    if (data.channel === 'orderbook' && data.symbol) {
      const bids = Array.isArray(data.bids) ? data.bids : [];
      const asks = Array.isArray(data.asks) ? data.asks : [];
      const bestBid = bids[0]?.price !== undefined ? Number(bids[0].price) : null;
      const bestAsk = asks[0]?.price !== undefined ? Number(asks[0].price) : null;

      if (this.onUpdateCallback) {
        this.onUpdateCallback({
          type: 'ORDERBOOK_UPDATE',
          symbol: data.symbol,
          bestBid,
          bestAsk,
          bids,
          asks,
          raw: data
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
    const lastPrice = raw.lastPrice !== undefined ? Number(raw.lastPrice) : null;
    const probability = Number.isFinite(lastPrice) && lastPrice > 0 && lastPrice < 1 ? lastPrice : null;

    return {
      id: raw.marketId || raw.id || symbol,
      symbol,
      counterSymbol: raw.downSymbol || symbol.replace('#YES', '#NO'),
      title: raw.question || raw.title || `${asset} Event Contract`,
      category: raw.category || this.inferCategory(asset),
      asset,
      expiry,
      probability,
      bestBid: null,
      bestAsk: null,
      volume24h: raw.volume24h !== undefined ? Number(raw.volume24h) : null,
      openInterest: raw.openInterest !== undefined ? Number(raw.openInterest) : null,
      tradeCount: raw.tradeCount !== undefined ? Number(raw.tradeCount) : null,
      targetTradeUrl: this.buildTradeUrl(symbol),
      urlPatterns: [],
      keywords: this.inferKeywords(asset, raw.question || raw.title || ''),
      liveData: false,
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
