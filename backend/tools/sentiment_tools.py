"""Sentiment analysis tools using NewsAPI + yfinance news."""

import os
import httpx
import logging
from datetime import datetime, timedelta
from cachetools import TTLCache

logger = logging.getLogger(__name__)

_news_cache: TTLCache = TTLCache(maxsize=200, ttl=120)


async def fetch_newsapi_headlines(query: str, max_results: int = 5) -> list[dict]:
    """Fetch news headlines from NewsAPI."""
    api_key = os.getenv("NEWS_API_KEY", "")
    if not api_key:
        return []

    cache_key = f"newsapi_{query}"
    if cache_key in _news_cache:
        return _news_cache[cache_key]

    url = "https://newsapi.org/v2/everything"
    params = {
        "q": query,
        "sortBy": "publishedAt",
        "pageSize": max_results,
        "language": "en",
        "apiKey": api_key,
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            articles = data.get("articles", [])
            results = []
            for a in articles[:max_results]:
                results.append({
                    "title": a.get("title", ""),
                    "source": a.get("source", {}).get("name", ""),
                    "url": a.get("url", ""),
                    "published": a.get("publishedAt", ""),
                    "description": a.get("description", ""),
                })
            _news_cache[cache_key] = results
            return results
    except Exception as e:
        logger.warning(f"NewsAPI fetch failed for {query}: {e}")
        return []


def score_sentiment_simple(headlines: list[str]) -> float:
    """Simple keyword-based sentiment scoring (-1 to +1). Used as fallback."""
    if not headlines:
        return 0.0

    positive_words = {
        "beat", "surge", "rally", "profit", "growth", "bullish", "upgrade",
        "record", "high", "gain", "strong", "positive", "boost", "up",
        "outperform", "buy", "rises", "jumps", "soars", "exceeds",
    }
    negative_words = {
        "miss", "drop", "fall", "loss", "bearish", "downgrade",
        "low", "weak", "negative", "crash", "decline", "down",
        "underperform", "sell", "plunge", "slump", "cuts", "warning",
    }

    total_score = 0.0
    for headline in headlines:
        words = set(headline.lower().split())
        pos = len(words & positive_words)
        neg = len(words & negative_words)
        if pos + neg > 0:
            total_score += (pos - neg) / (pos + neg)

    avg = total_score / len(headlines) if headlines else 0
    return round(max(-1.0, min(1.0, avg)), 2)


async def get_market_news(market: str = "india") -> list[dict]:
    """Get general market news."""
    query = "Indian stock market NSE" if market == "india" else "US stock market NYSE S&P500"
    news = await fetch_newsapi_headlines(query, max_results=10)
    if not news:
        # Fallback: return empty list
        return []
    return news
