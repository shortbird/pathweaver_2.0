"""
Cost tracking and optimization for AI API usage.
Tracks token usage and estimated costs for quest generation.
"""

from typing import Dict, Optional
from datetime import datetime, timedelta
from services.base_service import BaseService
from utils.logger import get_logger

logger = get_logger(__name__)


class CostTracker(BaseService):
    """Track and report on AI API costs"""

    # Pricing per 1M tokens (Gemini 2.5 Flash Lite - January 2025)
    GEMINI_FLASH_LITE_INPUT_COST = 0.075  # per 1M tokens
    GEMINI_FLASH_LITE_OUTPUT_COST = 0.30  # per 1M tokens

    def __init__(self, user_id: Optional[str] = None):
        super().__init__(user_id)

    def calculate_cost(self, input_tokens: int, output_tokens: int, model: str = 'gemini-2.5-flash-lite') -> Dict:
        """
        Calculate cost for token usage.

        Args:
            input_tokens: Number of input tokens used
            output_tokens: Number of output tokens generated
            model: Model name (currently only supports gemini-2.5-flash-lite)

        Returns:
            Dict with cost breakdown
        """
        # Convert to millions
        input_millions = input_tokens / 1_000_000
        output_millions = output_tokens / 1_000_000

        # Calculate costs
        input_cost = input_millions * self.GEMINI_FLASH_LITE_INPUT_COST
        output_cost = output_millions * self.GEMINI_FLASH_LITE_OUTPUT_COST
        total_cost = input_cost + output_cost

        return {
            'input_tokens': input_tokens,
            'output_tokens': output_tokens,
            'total_tokens': input_tokens + output_tokens,
            'input_cost_usd': round(input_cost, 6),
            'output_cost_usd': round(output_cost, 6),
            'total_cost_usd': round(total_cost, 6),
            'model': model
        }

    def estimate_batch_cost(self, quest_count: int, avg_input_tokens: int = 600, avg_output_tokens: int = 150) -> Dict:
        """
        Estimate cost for batch quest generation.

        Args:
            quest_count: Number of quests to generate
            avg_input_tokens: Average input tokens per quest
            avg_output_tokens: Average output tokens per quest

        Returns:
            Dict with estimated cost breakdown
        """
        total_input = quest_count * avg_input_tokens
        total_output = quest_count * avg_output_tokens

        return self.calculate_cost(total_input, total_output)

    def log_generation_cost(self, batch_id: str, cost_data: Dict):
        """
        Log cost data for a batch generation.

        Args:
            batch_id: Batch identifier
            cost_data: Cost calculation results
        """
        logger.info(
            f"Batch {batch_id} cost: ${cost_data['total_cost_usd']:.4f} "
            f"({cost_data['total_tokens']:,} tokens)"
        )

    def get_monthly_usage_report(self, days: int = 30) -> Dict:
        """
        Generate monthly usage report from logs.
        Note: This is a placeholder for future implementation.

        Args:
            days: Number of days to look back

        Returns:
            Dict with usage statistics
        """
        # TODO: Implement by querying logs or creating a tracking table
        return {
            'period_days': days,
            'total_cost_usd': 0.0,
            'total_quests_generated': 0,
            'avg_cost_per_quest': 0.0,
            'recommendation': 'Add cost tracking table to database for accurate reporting'
        }
