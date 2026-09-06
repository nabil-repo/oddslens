// Lightweight static server for testing OddsLens demo pages locally
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SomniaMarkets } from '@somnia-chain/markets-sdk';
import { somniaShannon } from '@somnia-chain/markets-sdk/chains';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 3000;
const DREAMDEX_BASE_URL = process.env.DREAMDEX_BASE_URL || 'https://stg.api.dreamdex.io';
const EVENT_INDEXER_URL = process.env.EVENT_INDEXER_URL || 'https://dev.smk.somnia.host/v1/graphql';
const eventExchange = new SomniaMarkets({
  indexerUrl: EVENT_INDEXER_URL,
  chain: somniaShannon
});
let eventMarketsCache = { expiresAt: 0, markets: [] };

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

async function proxyDreamDex(pathname, query) {
  const url = new URL(`${DREAMDEX_BASE_URL}${pathname}`);
  query.forEach((value, key) => url.searchParams.append(key, value));

  const response = await fetch(url);
  const body = await response.text();
  return { status: response.status, contentType: response.headers.get('content-type') || 'application/json', body };
}

async function loadBinaryMarkets() {
  if (eventMarketsCache.expiresAt > Date.now()) return eventMarketsCache.markets;

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

  eventMarketsCache = { expiresAt: Date.now() + 10000, markets: binaryMarkets };
  return binaryMarkets;
}

async function loadBinaryOrderbook(symbol) {
  if (!symbol) {
    throw new Error('Missing binary market symbol');
  }
  return eventExchange.fetchOrderBook(symbol, 10);
}

function sendJson(res, status, payload, contentType = 'application/json; charset=utf-8') {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(status, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  });
  res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let reqUrl = requestUrl.pathname;

  if (reqUrl === '/api/dreamdex/markets' || reqUrl === '/api/dreamdex/orderbooks') {
    const upstreamPath = reqUrl.endsWith('/markets') ? '/v0/markets' : '/v0/orderbooks';
    proxyDreamDex(upstreamPath, requestUrl.searchParams)
      .then(({ status, contentType, body }) => {
        sendJson(res, status, body, contentType);
      })
      .catch((error) => {
        sendJson(res, 502, { error: 'dreamdex_unavailable', message: error.message });
      });
    return;
  }

  if (reqUrl === '/api/dreamdex/event-markets' || reqUrl === '/api/dreamdex/event-orderbooks') {
    const operation = reqUrl.endsWith('/event-markets')
      ? loadBinaryMarkets()
      : loadBinaryOrderbook(requestUrl.searchParams.get('symbol'));
    operation
      .then(body => {
        sendJson(res, 200, body);
      })
      .catch(error => {
        sendJson(res, 502, { error: 'event_market_unavailable', message: error.message });
      });
    return;
  }

  if (reqUrl === '/' || reqUrl === '') {
    reqUrl = '/demo/index.html';
  }

  const filePath = path.join(rootDir, reqUrl);

  // Security: prevent directory traversal
  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });

    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`[OddsLens] Demo Server is live at: http://localhost:${PORT}`);
  console.log(`[Demo Hub]     http://localhost:${PORT}/demo/index.html`);
  console.log(`[Crypto News]  http://localhost:${PORT}/demo/crypto-article.html`);
  console.log(`[Sports News]  http://localhost:${PORT}/demo/sports-article.html`);
  console.log(`[Macro News]   http://localhost:${PORT}/demo/macro-article.html`);
  console.log(`======================================================\n`);
});
