// Default curated markets, network presets, and contract addresses for OddsLens

export const SOMNIA_NETWORKS = {
  testnet: {
    name: 'Somnia Shannon Testnet',
    chainId: 50312,
    rpcUrl: 'https://api.infra.testnet.somnia.network/',
    wsFeedUrl: 'wss://stg.api.dreamdex.io/v0/ws/public',
    explorerUrl: 'https://shannon-explorer.somnia.network',
    dexUrl: 'https://app.dreamdex.io/events',
    collateral: {
      symbol: 'tUSDC',
      address: '0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E',
      decimals: 6
    }
  },
  mainnet: {
    name: 'Somnia Mainnet',
    chainId: 5031,
    rpcUrl: 'https://dream-rpc.somnia.network',
    wsFeedUrl: 'wss://api.dreamdex.io/v0/ws/public',
    explorerUrl: 'https://explorer.somnia.network',
    dexUrl: 'https://dreamdex.io/events',
    collateral: {
      symbol: 'USDso',
      address: '0x00000022dA000002656c64D9eA6011ea952D008A',
      decimals: 18
    }
  }
};

export const PROTOCOL_CONTRACTS = {
  BinaryMarketsModule: '0x3ecC694Cef705358864a646142ac17A90E29e388',
  MarketsCore: '0x2802504314685D89bF6C992CA5a8e7cC78bc0294',
  BinarySettlement: '0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23',
  OutcomeToken6909: '0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9',
  OracleHub: '0xe40db387cC98601Dd11bd634fF2f3AD5686dE32b',
  CollateralRouter: '0xbC0C9834B15ACE38bB50dDaa7d7f7C7CC4DC183C'
};

export const DEFAULT_MARKETS = [
  {
    id: 'market-btc-100k',
    symbol: 'BTC-100K-UP/USDso#YES',
    counterSymbol: 'BTC-100K-DOWN/USDso#NO',
    title: 'Bitcoin to surpass $100,000 before window expiry',
    category: 'Crypto',
    asset: 'BTC',
    windowLabel: '24h Window',
    // Expiry dynamically set in seconds
    expiryOffsetSec: 14400, // 4 hours
    probability: 0.67,
    bestBid: 0.66,
    bestAsk: 0.68,
    volume24h: 42850,
    openInterest: 198500,
    tradeCount: 1420,
    urlPatterns: [
      '*://*coindesk.com/*',
      '*://*cointelegraph.com/*',
      '*://*decrypt.co/*',
      '*://*bloomberg.com/*crypto*',
      '*://*theblock.co/*',
      '*/demo/crypto-article.html*'
    ],
    keywords: [
      'bitcoin',
      'btc',
      'satoshi',
      'halving',
      'etf',
      '100k',
      '100,000',
      'crypto market',
      'bull run',
      'cryptocurrency'
    ],
    targetTradeUrl: 'https://app.dreamdex.io'
  },
  {
    id: 'market-somi-tps',
    symbol: 'SOMI-TPS-100K/USDso#YES',
    counterSymbol: 'SOMI-TPS-100K/USDso#NO',
    title: 'Somnia Shannon Testnet peak throughput > 100,000 TPS',
    category: 'Ecosystem',
    asset: 'SOMI',
    windowLabel: 'Testnet Epoch',
    expiryOffsetSec: 28800, // 8 hours
    probability: 0.82,
    bestBid: 0.81,
    bestAsk: 0.83,
    volume24h: 118400,
    openInterest: 340000,
    tradeCount: 3890,
    urlPatterns: [
      '*://*somnia.network/*',
      '*://*dorahacks.io/*',
      '*://*twitter.com/*somnia*',
      '*://*x.com/*somnia*',
      '*/demo/crypto-article.html*'
    ],
    keywords: [
      'somnia',
      'somi',
      'tps',
      'throughput',
      'shannon',
      'agentic l1',
      'dreamdex',
      'event contracts',
      'high speed',
      'multistream'
    ],
    targetTradeUrl: 'https://app.dreamdex.io'
  },
  {
    id: 'market-ucl-final',
    symbol: 'UCL-FINAL-RMA/USDso#YES',
    counterSymbol: 'UCL-FINAL-MCI/USDso#NO',
    title: 'UEFA Champions League: Will Real Madrid defeat Manchester City?',
    category: 'Sports',
    asset: 'UCL',
    windowLabel: 'Match Day',
    expiryOffsetSec: 7200, // 2 hours
    probability: 0.54,
    bestBid: 0.53,
    bestAsk: 0.55,
    volume24h: 89400,
    openInterest: 260000,
    tradeCount: 2750,
    urlPatterns: [
      '*://*espn.com/*',
      '*://*skysports.com/*',
      '*://*theathletic.com/*',
      '*://*bbc.com/sport/*',
      '*://*goal.com/*',
      '*/demo/sports-article.html*'
    ],
    keywords: [
      'champions league',
      'real madrid',
      'manchester city',
      'ucl',
      'vinicius',
      'haaland',
      'bellingham',
      'guardiola',
      'bernabeu',
      'etihad',
      'uefa'
    ],
    targetTradeUrl: 'https://app.dreamdex.io'
  },
  {
    id: 'market-fed-rates',
    symbol: 'FED-RATE-CUT-50BP/USDso#YES',
    counterSymbol: 'FED-RATE-CUT-50BP/USDso#NO',
    title: 'Federal Reserve to cut rates by 50 bps at upcoming FOMC',
    category: 'Macro',
    asset: 'FED',
    windowLabel: 'FOMC Window',
    expiryOffsetSec: 54000, // 15 hours
    probability: 0.38,
    bestBid: 0.37,
    bestAsk: 0.39,
    volume24h: 63100,
    openInterest: 185000,
    tradeCount: 1910,
    urlPatterns: [
      '*://*wsj.com/*',
      '*://*reuters.com/*',
      '*://*cnbc.com/*',
      '*://*bloomberg.com/*',
      '*://*ft.com/*',
      '*/demo/macro-article.html*'
    ],
    keywords: [
      'federal reserve',
      'fed',
      'fomc',
      'rate cut',
      'interest rates',
      'jerome powell',
      'inflation',
      'cpi',
      'basis points',
      'monetary policy'
    ],
    targetTradeUrl: 'https://app.dreamdex.io'
  }
];

export const DEFAULT_SETTINGS = {
  network: 'testnet', // 'testnet' | 'mainnet' | 'simulation'
  simulationMode: true, // Guarantees live ticks during judging demo
  autoDetectEnabled: true,
  soundEffects: true,
  tickAnimation: true,
  defaultBetAmount: 10,
  minMatchConfidence: 0.25
};
