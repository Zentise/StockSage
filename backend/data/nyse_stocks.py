"""US Stock Universe — Top S&P 500 most active + Commodities."""

SP500_TOP = [
    "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "BRK-B",
    "JPM", "V", "UNH", "XOM", "LLY", "JNJ", "MA", "PG", "HD", "MRK",
    "ABBV", "CVX", "COST", "PEP", "KO", "ADBE", "WMT", "BAC", "CRM",
    "TMO", "AVGO", "NFLX",
]

COMMODITIES = [
    "GC=F",   # Gold
    "SI=F",   # Silver
    "CL=F",   # Crude Oil
    "NG=F",   # Natural Gas
    "ZW=F",   # Wheat
    "ZC=F",   # Corn
]

INDICES = {
    "S&P 500": "^GSPC",
    "NASDAQ": "^IXIC",
    "DOW JONES": "^DJI",
}

ALL_US = SP500_TOP

COMMODITY_NAME_MAP = {
    "GC=F": "Gold",
    "SI=F": "Silver",
    "CL=F": "Crude Oil",
    "NG=F": "Natural Gas",
    "ZW=F": "Wheat",
    "ZC=F": "Corn",
}

TICKER_NAME_MAP = {
    "AAPL": "Apple Inc.",
    "MSFT": "Microsoft",
    "NVDA": "NVIDIA",
    "AMZN": "Amazon",
    "GOOGL": "Alphabet (Google)",
    "META": "Meta Platforms",
    "TSLA": "Tesla",
    "BRK-B": "Berkshire Hathaway",
    "JPM": "JPMorgan Chase",
    "V": "Visa",
    "UNH": "UnitedHealth Group",
    "XOM": "ExxonMobil",
    "LLY": "Eli Lilly",
    "JNJ": "Johnson & Johnson",
    "MA": "Mastercard",
    "PG": "Procter & Gamble",
    "HD": "Home Depot",
    "MRK": "Merck & Co.",
    "ABBV": "AbbVie",
    "CVX": "Chevron",
    "COST": "Costco",
    "PEP": "PepsiCo",
    "KO": "Coca-Cola",
    "ADBE": "Adobe",
    "WMT": "Walmart",
    "BAC": "Bank of America",
    "CRM": "Salesforce",
    "TMO": "Thermo Fisher",
    "AVGO": "Broadcom",
    "NFLX": "Netflix",
}
