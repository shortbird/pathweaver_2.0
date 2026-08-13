"""
Gemini token pricing lookup.

One place that answers "what does a token cost on model X". Both the per-request
cost logging in services/base_ai_service.py and the aggregate reporting in
services/cost_tracker.py go through here, so a model swap only needs a new entry
in Config.GEMINI_PRICING.

Before this existed, both call sites hardcoded gemini-2.5-flash-lite rates, so
every cost figure on the admin AI dashboard was computed at the wrong model's
price the moment the platform moved off that model.
"""

from typing import Tuple

from app_config import Config
from utils.logger import get_logger

logger = get_logger(__name__)

# Models we've already warned about, so an unpriced model logs once per process
# instead of once per AI call.
_warned_models = set()


def get_model_pricing(model: str) -> Tuple[float, float]:
    """
    Return (input_cost, output_cost) per 1M tokens for a Gemini model.

    Falls back to Config.GEMINI_PRICING_DEFAULT with a one-time warning when the
    model has no explicit entry -- an unpriced model produces approximate costs,
    never a silent $0.
    """
    pricing = Config.GEMINI_PRICING.get(model)
    if pricing:
        return pricing

    if model not in _warned_models:
        _warned_models.add(model)
        logger.warning(
            f"No pricing entry for Gemini model '{model}' - billing figures use "
            f"the default rate {Config.GEMINI_PRICING_DEFAULT} per 1M tokens and "
            f"are approximate. Add an entry to Config.GEMINI_PRICING."
        )
    return Config.GEMINI_PRICING_DEFAULT
