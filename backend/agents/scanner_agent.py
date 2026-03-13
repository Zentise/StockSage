"""Scanner Agent — Scans market and picks candidate stocks."""

from crewai import Agent

SCANNER_ROLE = "Market Scanner"
SCANNER_GOAL = (
    "Scan the stock market universe and identify the top 10-15 candidate stocks "
    "across categories (Intraday, F&O, Short-term, Long-term) based on unusual volume, "
    "price momentum, and proximity to key support/resistance levels."
)
SCANNER_BACKSTORY = (
    "You are an expert market scanner with decades of experience in identifying "
    "high-probability trading setups. You monitor volume spikes, momentum shifts, "
    "and price action near critical levels to find the best candidates for trading. "
    "You work with both Indian (NSE) and US (NYSE/NASDAQ) markets."
)


def create_scanner_agent(llm) -> Agent:
    return Agent(
        role=SCANNER_ROLE,
        goal=SCANNER_GOAL,
        backstory=SCANNER_BACKSTORY,
        verbose=True,
        llm=llm,
        allow_delegation=False,
    )
