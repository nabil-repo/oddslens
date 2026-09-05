// DreamDEX WebSocket and Somnia RPC Client

export class DreamDexClient {
  constructor(options = {}) {
    this.wsUrl = options.wsUrl || 'wss://stg.api.dreamdex.io/v0/ws/public';
    this.rpcUrl = options.rpcUrl || 'https://api.infra.testnet.somnia.network/';
    this.ws = null;
    this.pingInterval = null;
    this.reconnectTimer = null;
    this.reconnectDelay = 2000;
    this.maxReconnectDelay = 30000;
    this.status = 'DISCONNECTED'; // 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR'
    this.subscriptions = new Set();
    this.onUpdateCallback = null;
    this.onStatusChangeCallback = null;
  }

  setUpdateCallback(fn) {
    this.onUpdateCallback = fn;
  }

  setStatusChangeCallback(fn) {
    this.onStatusChangeCallback = fn;
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

  handleMessage(data) {
    if (data.operation === 'pong') {
      return;
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
