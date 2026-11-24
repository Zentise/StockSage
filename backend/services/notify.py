"""Telegram messages to the owner. Silent no-op when it is not configured."""

import logging

import requests

from backend import config

log = logging.getLogger(__name__)


def configured() -> bool:
    return bool(config.TELEGRAM_BOT_TOKEN and config.TELEGRAM_CHAT_ID)


def send(text: str) -> bool:
    """True if Telegram accepted the message. Never raises: a failed alert must not stop the loop."""
    if not configured():
        return False
    try:
        r = requests.post(
            f"https://api.telegram.org/bot{config.TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": config.TELEGRAM_CHAT_ID, "text": text[:3900], "disable_web_page_preview": True}, timeout=12)
        if not r.ok:
            log.warning("Telegram refused the message (%s)", r.status_code)   # never log the URL: it holds the token
        return r.ok
    except requests.RequestException as e:
        log.warning("Telegram unreachable: %s", type(e).__name__)
        return False
