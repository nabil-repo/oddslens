// OddsLens AI Engine
// Provides: NLP entity extraction, financial sentiment analysis, Gemini AI insight generation

// ─── Sentiment Lexicon ────────────────────────────────────────────────────────

const BULLISH_LEXICON = [
  // Market momentum
  'surge', 'surging', 'surged', 'rally', 'rallying', 'rallied', 'breakout', 'broke out',
  'soar', 'soaring', 'soared', 'spike', 'spiking', 'spiked', 'explode', 'exploding',
  'skyrocket', 'moon', 'rip', 'ripping', 'pump',
  // Positive fundamentals
  'milestone', 'record', 'all-time high', 'ath', 'breakthrough', 'innovation',
  'momentum', 'growth', 'acceleration', 'expansion', 'adoption', 'demand', 'inflow',
  'accumulate', 'accumulation', 'institutional', 'etf inflow', 'confidence',
  'outperform', 'strong', 'strengthen', 'robust', 'resilient', 'bullish',
  // Positive sentiment
  'optimistic', 'optimism', 'positive', 'upside', 'gains', 'gaining', 'gain',
  'profitable', 'profit', 'uptrend', 'advance', 'advancing', 'catalyst',
  'endorsement', 'approval', 'approved', 'launch', 'partnership', 'integration',
  // Sports / event specific
  'win', 'winning', 'won', 'victory', 'champion', 'dominate', 'dominance',
  'favorite', 'favourite', 'lead', 'leading', 'ahead',
  // Macro bullish
  'rate cut', 'dovish', 'stimulus', 'easing', 'fed cut', 'pivot',
];

const BEARISH_LEXICON = [
  // Market declines
  'crash', 'crashing', 'crashed', 'collapse', 'collapsing', 'collapsed',
  'plunge', 'plunging', 'plunged', 'drop', 'dropping', 'dropped',
  'fall', 'falling', 'fell', 'dump', 'dumping', 'selloff', 'sell-off',
  'correction', 'decline', 'declining', 'declined', 'slump', 'slumping',
  // Negative sentiment
  'fear', 'fud', 'panic', 'uncertainty', 'uncertain', 'risk', 'risky',
  'warning', 'bearish', 'downside', 'negative', 'concern', 'worried',
  'worry', 'caution', 'cautious', 'threat', 'threatening', 'trouble',
  'crisis', 'fail', 'failure', 'failed', 'collapse', 'weak', 'weakness',
  // Market headwinds
  'volatility', 'volatile', 'headwind', 'resistance', 'overbought',
  'bubble', 'overvalued', 'slowdown', 'contraction', 'recession',
  'inflation', 'stagflation', 'hawkish', 'rate hike', 'tightening',
  // Sports / event specific
  'lose', 'losing', 'lost', 'defeat', 'eliminated', 'underdog',
  'injured', 'injury', 'suspension', 'suspended', 'underperform',
  // Regulatory / macro bearish
  'ban', 'banned', 'regulatory', 'crackdown', 'fine', 'lawsuit',
  'sec', 'investigation', 'probe', 'hack', 'breach', 'exploit',
];

// ─── Named Entity Patterns ────────────────────────────────────────────────────

const ENTITY_PATTERNS = [
  // Crypto tickers
  { regex: /\b(btc|bitcoin)\b/gi, tags: ['btc', 'bitcoin', 'crypto'] },
  { regex: /\b(eth|ethereum)\b/gi, tags: ['eth', 'ethereum', 'crypto'] },
  { regex: /\b(somi|somnia)\b/gi, tags: ['somi', 'somnia', 'tps', 'throughput'] },
  { regex: /\b(dreamdex|dream\s*dex)\b/gi, tags: ['dreamdex', 'event contracts'] },
  { regex: /\$100[,.]?000\b|\b100k\b/gi, tags: ['100k', 'bitcoin', 'btc'] },
  // Sports entities
  { regex: /\b(real madrid|madrid)\b/gi, tags: ['real madrid', 'ucl', 'champions league'] },
  { regex: /\b(manchester city|man city)\b/gi, tags: ['manchester city', 'ucl', 'champions league'] },
  { regex: /\b(haaland|vinicius|bellingham|guardiola)\b/gi, tags: ['ucl', 'champions league'] },
  { regex: /\b(champions league|ucl|uefa)\b/gi, tags: ['champions league', 'ucl', 'sports'] },
  // Macro / political
  { regex: /\b(federal reserve|fed|fomc|jerome powell|powell)\b/gi, tags: ['federal reserve', 'fed', 'fomc', 'rate cut', 'interest rates'] },
  { regex: /\b(rate cut|rate hike|basis points|bps|monetary policy)\b/gi, tags: ['federal reserve', 'fomc', 'interest rates'] },
  { regex: /\b(inflation|cpi|pce|consumer price)\b/gi, tags: ['inflation', 'cpi', 'fomc', 'monetary policy'] },
  // 100k TPS Somnia specific
  { regex: /\b(100[,.]?000\s*tps|tps|throughput|multistream)\b/gi, tags: ['somnia', 'tps', 'throughput', 'shannon'] },
];

// ─── Core NLP: Entity Extraction ─────────────────────────────────────────────

/**
 * Extract named entities from article text and score against available markets.
 * @param {string} text - Article plain text (first ~3000 chars recommended)
 * @param {Array} markets - Current live market array
 * @returns {{ bestMatch: object|null, confidence: number, candidates: Array, extractedTags: string[] }}
 */
export function extractEntities(text, markets) {
  if (!text || !Array.isArray(markets) || markets.length === 0) {
    return { bestMatch: null, confidence: 0, candidates: [], extractedTags: [] };
  }

  const normalizedText = text.toLowerCase();
  const extractedTags = new Set();

  // 1. Run entity patterns against article text
  for (const pattern of ENTITY_PATTERNS) {
    if (pattern.regex.test(normalizedText)) {
      pattern.tags.forEach(t => extractedTags.add(t));
    }
    // Reset regex lastIndex for global patterns
    pattern.regex.lastIndex = 0;
  }

  const tagArray = Array.from(extractedTags);

  if (tagArray.length === 0) {
    return { bestMatch: null, confidence: 0, candidates: [], extractedTags: [] };
  }

  // 2. Score each market against extracted tags + article text
  const scored = markets.map(market => {
    let score = 0;
    const hits = [];

    const normTitle = market.title?.toLowerCase() || '';
    const normAsset = market.asset?.toLowerCase() || '';
    const keywords = (market.keywords || []).map(k => k.toLowerCase());

    // Tag overlap with market keywords
    for (const tag of tagArray) {
      if (keywords.includes(tag)) {
        score += 2.0;
        hits.push(tag);
      } else if (keywords.some(k => k.includes(tag) || tag.includes(k))) {
        score += 0.8;
        hits.push(tag);
      }
    }

    // Direct asset match in extracted tags
    if (tagArray.includes(normAsset)) {
      score += 3.0;
      hits.push(normAsset);
    }

    // Keyword frequency in article text
    for (const kw of keywords) {
      const occurrences = (normalizedText.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      if (occurrences > 0) {
        score += Math.min(occurrences * 0.5, 2.0); // cap at 2.0
        if (!hits.includes(kw)) hits.push(kw);
      }
    }

    const maxScore = 8.0;
    const confidence = Math.min(1.0, Math.round((score / maxScore) * 100) / 100);

    return { market, score, confidence, hits };
  });

  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.confidence < 0.15) {
    return { bestMatch: null, confidence: 0, candidates: [], extractedTags: tagArray };
  }

  return {
    bestMatch: best.market,
    confidence: best.confidence,
    candidates: scored.slice(0, 3).map(s => ({
      id: s.market.id,
      title: s.market.title,
      confidence: s.confidence,
      hits: s.hits,
    })),
    extractedTags: tagArray,
  };
}

// ─── Core NLP: Sentiment Analysis ────────────────────────────────────────────

/**
 * Score the sentiment of article text using a curated financial lexicon.
 * @param {string} text - Article plain text
 * @returns {{ score: number, label: 'BULLISH'|'BEARISH'|'NEUTRAL', intensity: number, topWords: string[] }}
 */
export function scoreSentiment(text) {
  if (!text || text.length < 20) {
    return { score: 0, label: 'NEUTRAL', intensity: 0, topWords: [] };
  }

  const normalized = text.toLowerCase();
  let bullishScore = 0;
  let bearishScore = 0;
  const matchedBullish = [];
  const matchedBearish = [];

  // Score bullish words
  for (const word of BULLISH_LEXICON) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = normalized.match(new RegExp(`\\b${escaped}\\b`, 'g'));
    if (matches) {
      const count = matches.length;
      // Multi-word phrases score higher
      const weight = word.includes(' ') ? 2.5 : 1.0;
      bullishScore += count * weight;
      if (!matchedBullish.includes(word)) matchedBullish.push(word);
    }
  }

  // Score bearish words
  for (const word of BEARISH_LEXICON) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = normalized.match(new RegExp(`\\b${escaped}\\b`, 'g'));
    if (matches) {
      const count = matches.length;
      const weight = word.includes(' ') ? 2.5 : 1.0;
      bearishScore += count * weight;
      if (!matchedBearish.includes(word)) matchedBearish.push(word);
    }
  }

  const total = bullishScore + bearishScore;
  if (total === 0) {
    return { score: 0, label: 'NEUTRAL', intensity: 0, topWords: [] };
  }

  // Normalize score to [-1, +1]
  const rawScore = (bullishScore - bearishScore) / Math.max(total, 1);
  const score = Math.round(rawScore * 100) / 100;

  let label = 'NEUTRAL';
  if (score > 0.12) label = 'BULLISH';
  else if (score < -0.12) label = 'BEARISH';

  // Intensity = how confident we are (0–1)
  const intensity = Math.min(1.0, Math.round((total / 15) * 100) / 100);

  // Top matched words (max 5 of the dominant side)
  const topWords = label === 'BULLISH'
    ? matchedBullish.slice(0, 5)
    : label === 'BEARISH'
      ? matchedBearish.slice(0, 5)
      : [...matchedBullish.slice(0, 2), ...matchedBearish.slice(0, 2)];

  return { score, label, intensity, topWords };
}

// ─── Deterministic Insight Template ──────────────────────────────────────────

/**
 * Generate a deterministic 1-sentence market insight from data.
 * Used as fallback when Gemini API is unavailable.
 * @param {object} market - Market data object
 * @param {object} sentiment - Sentiment result from scoreSentiment()
 * @returns {string}
 */
export function generateInsightTemplate(market, sentiment) {
  const prob = market.probability || 0.5;
  const upPct = Math.round(prob * 100);
  const downPct = 100 - upPct;
  const label = sentiment?.label || 'NEUTRAL';
  const asset = market.asset || 'this market';
  const category = market.category || 'Prediction';

  // Dynamic templates based on probability + sentiment alignment
  if (label === 'BULLISH' && upPct >= 60) {
    return `With ${upPct}% market consensus and bullish article context, traders are pricing in strong conviction on the YES side for ${asset}.`;
  } else if (label === 'BULLISH' && upPct < 50) {
    return `Article sentiment is bullish on ${asset}, but the market sits at ${upPct}% — a potential mispricing worth watching if narrative accelerates.`;
  } else if (label === 'BEARISH' && downPct >= 60) {
    return `${downPct}% of liquidity is positioned NO, aligned with the bearish article tone — consensus leans against the ${asset} event resolving YES.`;
  } else if (label === 'BEARISH' && upPct >= 60) {
    return `Market is ${upPct}% YES on ${asset} despite bearish article context — a sentiment divergence that often precedes a repricing.`;
  } else if (upPct >= 75) {
    return `At ${upPct}% probability, this ${category} contract is near-consensus — low reward for YES, but NO at ${downPct}% offers an asymmetric contrarian opportunity.`;
  } else if (downPct >= 75) {
    return `The market heavily favors NO at ${downPct}% on ${asset} — consider whether current news flow supports this level of certainty.`;
  } else {
    return `${asset} is evenly contested at ${upPct}% YES / ${downPct}% NO — high uncertainty creates opportunity for traders with a directional view.`;
  }
}

// ─── AI Insight Callers (Gemini & OpenRouter) ─────────────────────────────────

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const INSIGHT_TIMEOUT_MS = 5000;

/**
 * Detect whether an API key belongs to OpenRouter or Google Gemini.
 * @param {string} apiKey
 * @param {string} explicitProvider - 'auto' | 'openrouter' | 'gemini'
 * @returns {'openrouter'|'gemini'}
 */
export function detectAiProvider(apiKey, explicitProvider = 'auto') {
  if (explicitProvider === 'openrouter' || explicitProvider === 'gemini') {
    return explicitProvider;
  }
  const trimmed = (apiKey || '').trim();
  if (trimmed.startsWith('sk-or-') || trimmed.startsWith('sk-')) {
    return 'openrouter';
  }
  return 'gemini';
}

/**
 * Call the OpenRouter API to generate a 1-sentence market insight.
 * Supports any OpenRouter model (default: google/gemini-2.0-flash-001).
 */
export async function callOpenRouterInsight(market, sentiment, headline, apiKey, model = 'google/gemini-2.0-flash-001') {
  const prob = market.probability || 0.5;
  const upPct = Math.round(prob * 100);

  const prompt = [
    `Market: "${market.title}"`,
    `Current probability: ${upPct}% YES / ${100 - upPct}% NO`,
    `Article headline: "${headline || 'No headline available'}"`,
    `Article sentiment: ${sentiment?.label || 'NEUTRAL'} (score: ${sentiment?.score?.toFixed(2) || '0.00'})`,
    `Key sentiment words: ${(sentiment?.topWords || []).slice(0, 4).join(', ') || 'none'}`,
    ``,
    `Write one short, confident, specific sentence (max 25 words) that helps a retail trader decide on this contract. Focus on what the data implies about market direction.`
  ].join('\n');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), INSIGHT_TIMEOUT_MS);

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`,
        'HTTP-Referer': 'https://oddslens.app',
        'X-Title': 'OddsLens Extension'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: model || 'google/gemini-2.0-flash-001',
        messages: [
          {
            role: 'system',
            content: 'You are a concise prediction market analyst. Write exactly ONE sentence of insight for a retail trader.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 60,
        temperature: 0.7
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn('[OddsLens AI] OpenRouter API error:', response.status);
      return null;
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content?.trim();

    if (!text || text.length < 10) {
      return null;
    }

    return { text, source: 'openrouter' };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.warn('[OddsLens AI] OpenRouter API timeout');
    } else {
      console.warn('[OddsLens AI] OpenRouter error:', err.message);
    }
    return null;
  }
}

/**
 * Call the Gemini API to generate a 1-sentence market insight.
 * Falls back to template on error or timeout.
 * @param {object} market - Market data
 * @param {object} sentiment - Sentiment result
 * @param {string} headline - Article headline text
 * @param {string} apiKey - Gemini API key from settings
 * @returns {Promise<{ text: string, source: 'gemini'|'template' }>}
 */
export async function callGeminiInsight(market, sentiment, headline, apiKey) {
  const fallback = {
    text: generateInsightTemplate(market, sentiment),
    source: 'template',
  };

  if (!apiKey || apiKey.trim().length < 10) {
    return fallback;
  }

  const prob = market.probability || 0.5;
  const upPct = Math.round(prob * 100);
  const prompt = [
    `You are a concise prediction market analyst. Write exactly ONE sentence of insight for a retail trader.`,
    ``,
    `Market: "${market.title}"`,
    `Current probability: ${upPct}% YES / ${100 - upPct}% NO`,
    `Article headline: "${headline || 'No headline available'}"`,
    `Article sentiment: ${sentiment?.label || 'NEUTRAL'} (score: ${sentiment?.score?.toFixed(2) || '0.00'})`,
    `Key sentiment words: ${(sentiment?.topWords || []).slice(0, 4).join(', ') || 'none'}`,
    ``,
    `Write one short, confident, specific sentence (max 25 words) that helps a trader decide on this contract. Focus on what the data implies about market direction.`,
  ].join('\n');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), INSIGHT_TIMEOUT_MS);

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey.trim()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 60,
          stopSequences: ['\n'],
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        ],
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn('[OddsLens AI] Gemini API error:', response.status);
      return fallback;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!text || text.length < 10) {
      return fallback;
    }

    return { text, source: 'gemini' };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.warn('[OddsLens AI] Gemini API timeout — using template fallback');
    } else {
      console.warn('[OddsLens AI] Gemini API error:', err.message);
    }
    return fallback;
  }
}

/**
 * Unified AI insight caller that supports both OpenRouter and Google Gemini.
 * @param {object} market
 * @param {object} sentiment
 * @param {string} headline
 * @param {string} apiKey
 * @param {object} options - { provider?: 'auto'|'openrouter'|'gemini', model?: string }
 */
export async function callAiInsight(market, sentiment, headline, apiKey, options = {}) {
  const fallback = {
    text: generateInsightTemplate(market, sentiment),
    source: 'template'
  };

  if (!apiKey || apiKey.trim().length < 8) {
    return fallback;
  }

  const provider = detectAiProvider(apiKey, options.provider);

  if (provider === 'openrouter') {
    const result = await callOpenRouterInsight(market, sentiment, headline, apiKey, options.model);
    if (result && result.text) return result;
  } else {
    const result = await callGeminiInsight(market, sentiment, headline, apiKey);
    if (result && result.text && result.source === 'gemini') return result;
  }

  return fallback;
}

// ─── Full Page Analysis Pipeline ─────────────────────────────────────────────

/**
 * Run the full AI analysis on article text.
 * Combines NLP entity extraction + sentiment analysis.
 * @param {string} articleText - Raw article body text
 * @param {string} headline - Article headline
 * @param {Array} markets - Current live markets
 * @returns {{ sentiment: object, nlpMatch: object }}
 */
export function analyzeArticle(articleText, headline, markets) {
  const fullText = `${headline || ''} ${articleText || ''}`.trim();

  const sentiment = scoreSentiment(fullText);
  const nlpMatch = extractEntities(fullText, markets);

  return { sentiment, nlpMatch };
}
