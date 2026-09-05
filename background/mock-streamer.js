// Resilient market simulation engine for OddsLens
// Ensures smooth, live odds animation and orderbook ticks during demos and testing

export class MockStreamer {
  constructor() {
    this.timer = null;
    this.markets = [];
    this.onTickCallback = null;
    this.intervalMs = 3200;
  }

  setTickCallback(fn) {
    this.onTickCallback = fn;
  }

  setMarkets(markets) {
    this.markets = markets.map(m => ({ ...m }));
  }

  start() {
    this.stop();
    this.timer = setInterval(() => {
      this.tickRandomMarket();
    }, this.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  tickRandomMarket() {
    if (!this.markets || this.markets.length === 0) return;

    // Pick a random market to update
    const idx = Math.floor(Math.random() * this.markets.length);
    const m = this.markets[idx];

    // Realistic probability tick: Brownian perturbation between -0.015 and +0.015
    const delta = (Math.random() - 0.49) * 0.02;
    let newProb = Math.round((m.probability + delta) * 1000) / 1000;

    // Keep bounded in (0.05, 0.95)
    newProb = Math.max(0.06, Math.min(0.94, newProb));

    const change = Math.round((newProb - m.probability) * 1000) / 1000;
    const tickDirection = change >= 0 ? 'UP' : 'DOWN';

    m.probability = newProb;
    m.bestBid = Math.round((newProb - 0.01) * 1000) / 1000;
    m.bestAsk = Math.round((newProb + 0.01) * 1000) / 1000;

    // Increment volume & trade count slightly
    const volumeBump = Math.floor(Math.random() * 450 + 50);
    m.volume24h = (m.volume24h || 10000) + volumeBump;
    m.tradeCount = (m.tradeCount || 100) + 1;

    if (this.onTickCallback) {
      this.onTickCallback({
        marketId: m.id,
        symbol: m.symbol,
        probability: m.probability,
        bestBid: m.bestBid,
        bestAsk: m.bestAsk,
        volume24h: m.volume24h,
        tradeCount: m.tradeCount,
        tickDirection,
        change,
        market: m
      });
    }
  }

  forceTick(marketId) {
    const m = this.markets.find(item => item.id === marketId);
    if (!m) return;
    const delta = (Math.random() - 0.45) * 0.025;
    m.probability = Math.max(0.08, Math.min(0.92, Math.round((m.probability + delta) * 1000) / 1000));
    m.bestBid = Math.round((m.probability - 0.01) * 1000) / 1000;
    m.bestAsk = Math.round((m.probability + 0.01) * 1000) / 1000;
    m.tradeCount = (m.tradeCount || 100) + 1;

    if (this.onTickCallback) {
      this.onTickCallback({
        marketId: m.id,
        symbol: m.symbol,
        probability: m.probability,
        bestBid: m.bestBid,
        bestAsk: m.bestAsk,
        volume24h: m.volume24h,
        tradeCount: m.tradeCount,
        tickDirection: delta >= 0 ? 'UP' : 'DOWN',
        change: Math.round(delta * 1000) / 1000,
        market: m
      });
    }
  }
}
