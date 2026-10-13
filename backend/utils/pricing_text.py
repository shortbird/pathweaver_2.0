"""
Prices in database-held copy: help center articles and CRM funnel emails.

Copy that lives in a database row cannot import a constant, so it names a
price instead -- {{price.academyTuitionMonthly}} -- and the backend fills it in
from shared/data/pricing.json (generated/pricing.py) when the copy is served or
sent. A price change is then one edit to the JSON, not a hunt through rows.

An unknown name is left exactly as written, so a typo shows up on the page
where someone will see it, instead of silently printing nothing.
"""

import re
from typing import Optional

from generated.pricing import PRICE_TEXT

_TOKEN = re.compile(r'\{\{\s*price\.([A-Za-z0-9_]+)\s*\}\}')


def fill_prices(text: Optional[str]) -> Optional[str]:
    """`text` with every {{price.<name>}} replaced by its formatted price."""
    if not text or '{{' not in text:
        return text
    return _TOKEN.sub(lambda m: PRICE_TEXT.get(m.group(1), m.group(0)), text)


def unknown_price_tokens(text: Optional[str]) -> list:
    """The {{price.<name>}} tokens in `text` that name no price -- for a test
    or an editor to catch before the copy reaches anyone."""
    return [m.group(1) for m in _TOKEN.finditer(text or '') if m.group(1) not in PRICE_TEXT]
