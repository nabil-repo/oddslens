// Matching engine for OddsLens: URL glob matching and text relevance scoring

/**
 * Converts a Chrome extension glob-style URL pattern into a RegExp
 * e.g. "*://*.espn.com/*" -> /^https?:\/\/[^\/]*\.espn\.com\/.*$/i
 */
export function patternToRegex(pattern) {
  try {
    let reStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex specials except *
      .replace(/\*/g, '.*');
    return new RegExp(`^${reStr}$`, 'i');
  } catch (err) {
    return null;
  }
}

/**
 * Match a URL against market URL patterns
 */
export function matchUrl(url, markets) {
  if (!url || !Array.isArray(markets)) return null;

  // Clean URL for comparison (remove hash and trailing slash)
  const cleanUrl = url.split('#')[0].replace(/\/$/, '');

  for (const market of markets) {
    if (!Array.isArray(market.urlPatterns)) continue;
    for (const pattern of market.urlPatterns) {
      // Direct substring match for relative/demo paths
      if (pattern.startsWith('*/demo/') || pattern.includes('/demo/')) {
        const demoPart = pattern.replace(/^\*?\//, '');
        if (cleanUrl.includes(demoPart.replace(/\*$/, ''))) {
          return {
            market,
            matchedPattern: pattern,
            matchType: 'demo-curated',
            confidence: 1.0
          };
        }
      }

      // Regex pattern check
      const regex = patternToRegex(pattern);
      if (regex && regex.test(cleanUrl)) {
        return {
          market,
          matchedPattern: pattern,
          matchType: 'url-pattern',
          confidence: 0.95
        };
      }

      // Loose domain fallback
      const domainMatch = pattern.match(/\/\/\*?\.?([^\/*]+)/);
      if (domainMatch && domainMatch[1]) {
        const domain = domainMatch[1].toLowerCase();
        if (cleanUrl.toLowerCase().includes(domain)) {
          return {
            market,
            matchedPattern: pattern,
            matchType: 'domain',
            confidence: 0.85
          };
        }
      }
    }
  }

  return null;
}

/**
 * Match selected text against market titles, assets, and keyword dictionaries
 */
export function matchText(selectedText, markets, minConfidence = 0.2) {
  if (!selectedText || !Array.isArray(markets) || markets.length === 0) {
    return { bestMatch: markets?.[0] || null, confidence: 0, candidates: [], isFallback: true };
  }

  const normalizedText = selectedText.toLowerCase().trim();
  const tokens = normalizedText
    .split(/[\s,.;:!?()[\]{}"'`/\\]+/)
    .filter(t => t.length > 1);

  const scoredCandidates = markets.map(market => {
    let score = 0;
    const matchedTokens = [];

    const normTitle = market.title.toLowerCase();
    const normAsset = market.asset.toLowerCase();
    const normCategory = (market.category || '').toLowerCase();

    // 1. Exact phrase match in title
    if (normTitle.includes(normalizedText) && normalizedText.length > 3) {
      score += 3.5;
      matchedTokens.push(normalizedText);
    }

    // 2. Direct asset code match (e.g. "BTC", "SOMI")
    if (tokens.includes(normAsset)) {
      score += 2.0;
      matchedTokens.push(normAsset);
    }

    // 3. Category match
    if (tokens.includes(normCategory)) {
      score += 0.8;
      matchedTokens.push(normCategory);
    }

    // 4. Keyword matches
    if (Array.isArray(market.keywords)) {
      for (const kw of market.keywords) {
        const normKw = kw.toLowerCase();
        // Exact multi-word keyword match in text
        if (normalizedText.includes(normKw)) {
          score += normKw.includes(' ') ? 2.5 : 1.5;
          matchedTokens.push(normKw);
        } else {
          // Token overlap
          const kwTokens = normKw.split(/\s+/);
          for (const kt of kwTokens) {
            if (tokens.includes(kt)) {
              score += 0.6;
              matchedTokens.push(kt);
            }
          }
        }
      }
    }

    // Normalize confidence score to [0, 1] range
    const maxExpectedScore = 5.0;
    const confidence = Math.min(1.0, Math.round((score / maxExpectedScore) * 100) / 100);

    return {
      market,
      score,
      confidence,
      matchedTokens: Array.from(new Set(matchedTokens))
    };
  });

  // Sort descending by score
  scoredCandidates.sort((a, b) => b.score - a.score);

  const best = scoredCandidates[0];
  if (best && best.confidence >= minConfidence) {
    return {
      bestMatch: best.market,
      confidence: best.confidence,
      matchedTokens: best.matchedTokens,
      candidates: scoredCandidates.slice(0, 3).map(c => ({
        id: c.market.id,
        title: c.market.title,
        symbol: c.market.symbol,
        confidence: c.confidence
      })),
      isFallback: false
    };
  }

  // Fallback: return highest-volume / top trending market if no high-confidence match
  const trending = [...markets].sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))[0];
  return {
    bestMatch: trending || markets[0],
    confidence: 0.1,
    matchedTokens: [],
    candidates: markets.slice(0, 3).map(m => ({ id: m.id, title: m.title, symbol: m.symbol, confidence: 0.1 })),
    isFallback: true
  };
}
