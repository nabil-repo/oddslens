import { SomniaMarkets } from '@somnia-chain/markets-sdk';
import { somniaShannon } from '@somnia-chain/markets-sdk/chains';

const EVENT_INDEXER_URL = process.env.EVENT_INDEXER_URL || 'https://dev.smk.somnia.host/v1/graphql';
const eventExchange = new SomniaMarkets({
  indexerUrl: EVENT_INDEXER_URL,
  chain: somniaShannon
});

let cache = { expiresAt: 0, data: [] };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (cache.expiresAt > Date.now() && cache.data.length > 0) {
      return res.status(200).json(cache.data);
    }

    const markets = await eventExchange.loadMarkets(true);
    const binaryMarkets = Object.values(markets)
      .filter(market => market.type === 'binary' && market.info?.status === 'Trading')
      .map(market => ({
        id: market.id,
        symbol: market.symbol,
        title: market.info.question,
        asset: market.info.asset,
        interval: market.info.interval,
        intervalSec: Number(market.info.intervalSec),
        expiry: Number(market.info.expiry),
        outcomes: market.outcomes,
        active: market.active,
        source: 'somnia-markets-sdk'
      }));

    cache = { expiresAt: Date.now() + 60000, data: binaryMarkets };
    return res.status(200).json(binaryMarkets);
  } catch (err) {
    return res.status(502).json({ error: 'event_market_unavailable', message: err.message });
  }
}
