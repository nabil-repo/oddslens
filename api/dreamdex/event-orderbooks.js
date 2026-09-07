import { SomniaMarkets } from '@somnia-chain/markets-sdk';
import { somniaShannon } from '@somnia-chain/markets-sdk/chains';

const EVENT_INDEXER_URL = process.env.EVENT_INDEXER_URL || 'https://dev.smk.somnia.host/v1/graphql';
const eventExchange = new SomniaMarkets({
  indexerUrl: EVENT_INDEXER_URL,
  chain: somniaShannon
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { symbol } = req.query || {};
  if (!symbol) {
    return res.status(400).json({ error: 'missing_symbol', message: 'symbol query parameter is required' });
  }

  try {
    if (!eventExchange.markets || Object.keys(eventExchange.markets).length === 0) {
      await eventExchange.loadMarkets(true);
    }

    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Orderbook query timeout for ${symbol}`)), 8000)
    );
    const book = await Promise.race([eventExchange.fetchOrderBook(symbol, 10), timeout]);

    // Handle BigInt serialization
    const serialized = JSON.parse(
      JSON.stringify(book, (_, value) => (typeof value === 'bigint' ? value.toString() : value))
    );
    return res.status(200).json(serialized);
  } catch (err) {
    return res.status(502).json({ error: 'orderbook_unavailable', message: err.message });
  }
}
