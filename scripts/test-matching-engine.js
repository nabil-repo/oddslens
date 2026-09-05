// Automated unit test suite for OddsLens Matching Engine and Simulation

import { DEFAULT_MARKETS } from '../background/manifest-data.js';
import { matchUrl, matchText, patternToRegex } from '../background/matching-engine.js';
import { MockStreamer } from '../background/mock-streamer.js';

console.log('=== OddsLens Verification Test Suite ===\n');

let passed = 0;
let total = 0;

function assert(condition, testName) {
  total++;
  if (condition) {
    passed++;
    console.log(`✅ [PASS] ${testName}`);
  } else {
    console.error(`❌ [FAIL] ${testName}`);
  }
}

// 1. URL Pattern Matching Tests
console.log('--- Testing URL Pattern Matching ---');

const testUrls = [
  {
    url: 'https://www.coindesk.com/markets/2026/09/05/bitcoin-breaks-highs',
    expectedId: 'market-btc-100k',
    label: 'CoinDesk Bitcoin URL'
  },
  {
    url: 'https://espn.com/soccer/ucl-real-madrid-man-city-preview',
    expectedId: 'market-ucl-final',
    label: 'ESPN Champions League URL'
  },
  {
    url: 'https://www.wsj.com/economy/central-banking/federal-reserve-powell-rate-cut',
    expectedId: 'market-fed-rates',
    label: 'WSJ Federal Reserve URL'
  },
  {
    url: 'http://localhost:3000/demo/sports-article.html',
    expectedId: 'market-ucl-final',
    label: 'Demo Sports Article URL'
  },
  {
    url: 'http://localhost:3000/demo/crypto-article.html',
    expectedIds: ['market-btc-100k', 'market-somi-tps'],
    label: 'Demo Crypto Article URL'
  },
  {
    url: 'https://unrelated-cooking-recipes.com/pasta',
    expectedId: null,
    label: 'Unrelated URL (No match expected)'
  }
];

testUrls.forEach(t => {
  const res = matchUrl(t.url, DEFAULT_MARKETS);
  if (t.expectedId === null) {
    assert(res === null, `${t.label}: correctly returns null`);
  } else if (t.expectedIds) {
    assert(res !== null && t.expectedIds.includes(res.market.id), `${t.label}: matches ${res?.market?.id}`);
  } else {
    assert(res !== null && res.market.id === t.expectedId, `${t.label}: matched ${res?.market?.id}`);
  }
});

// 2. Text Selection Matching Tests
console.log('\n--- Testing Text Selection Matching ---');

const textTests = [
  {
    text: 'Bitcoin approaching $100,000 as bull market extends',
    expectedId: 'market-btc-100k',
    label: 'Bitcoin Selection'
  },
  {
    text: 'Somnia Shannon Testnet achieves peak TPS milestone with agentic execution',
    expectedId: 'market-somi-tps',
    label: 'Somnia TPS Selection'
  },
  {
    text: 'Real Madrid and Manchester City prepare for UEFA Champions League showdown',
    expectedId: 'market-ucl-final',
    label: 'Champions League Selection'
  },
  {
    text: 'Federal Reserve Chair Jerome Powell signals potential 50 bps rate cut',
    expectedId: 'market-fed-rates',
    label: 'Fed Rate Cut Selection'
  },
  {
    text: 'How to bake standard sourdough bread with yeast and flour',
    isFallbackExpected: true,
    label: 'Completely Unrelated Text (Graceful Fallback)'
  }
];

textTests.forEach(t => {
  const res = matchText(t.text, DEFAULT_MARKETS, 0.2);
  if (t.isFallbackExpected) {
    assert(res.isFallback === true && res.bestMatch !== null, `${t.label}: gracefully provided top market fallback without throwing`);
  } else {
    assert(res.bestMatch.id === t.expectedId && res.confidence >= 0.2, `${t.label}: matched ${res.bestMatch.id} (${Math.round(res.confidence * 100)}% confidence)`);
  }
});

// 3. Mock Streamer Simulation Test
console.log('\n--- Testing Mock Streamer Volatility ---');

const streamer = new MockStreamer();
streamer.setMarkets(DEFAULT_MARKETS);

let tickReceived = false;
streamer.setTickCallback((tick) => {
  tickReceived = true;
  assert(tick.probability >= 0.05 && tick.probability <= 0.95, `Tick probability bounded in [0.05, 0.95]: got ${tick.probability}`);
  assert(tick.bestBid < tick.bestAsk, `Orderbook spread valid: Bid ${tick.bestBid} < Ask ${tick.bestAsk}`);
  assert(tick.tickDirection === 'UP' || tick.tickDirection === 'DOWN', `Tick direction valid: ${tick.tickDirection}`);
});

streamer.tickRandomMarket();
assert(tickReceived === true, 'Streamer fired simulated micro-tick successfully');

console.log(`\n========================================`);
console.log(`Test Summary: ${passed} / ${total} tests passed (${Math.round((passed / total) * 100)}%)`);
console.log(`========================================\n`);

if (passed === total) {
  process.exit(0);
} else {
  process.exit(1);
}
