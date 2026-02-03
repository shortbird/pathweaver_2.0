"""
Cost tracking and optimization for AI API usage.
Tracks token usage and estimated costs for quest generation.
"""

from typing import Dict, Optional
from datetime import datetime, timedelta
from services.base_service import BaseService
from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)


class CostTracker(BaseService):
    """Track and report on AI API costs"""

    # Pricing per 1M tokens (Gemini 2.5 Flash Lite - January 2025)
    GEMINI_FLASH_LITE_INPUT_COST = 0.075  # per 1M tokens
    GEMINI_FLASH_LITE_OUTPUT_COST = 0.30  # per 1M tokens

    def __init__(self):
        super().__init__()
        self.supabase = get_supabase_admin_client()

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
        Generate monthly usage report from ai_usage_logs table.

        Args:
            days: Number of days to look back

        Returns:
            Dict with usage statistics
        """
        try:
            from datetime import datetime, timedelta

            # Calculate the date threshold
            date_threshold = (datetime.utcnow() - timedelta(days=days)).isoformat()

            # Query usage logs
            result = self.supabase.table('ai_usage_logs')\
                .select('service_name, input_tokens, output_tokens, estimated_cost, created_at')\
                .gte('created_at', date_threshold)\
                .execute()

            if not result.data:
                return {
                    'period_days': days,
                    'total_cost_usd': 0.0,
                    'total_requests': 0,
                    'total_input_tokens': 0,
                    'total_output_tokens': 0,
                    'avg_cost_per_request': 0.0,
                    'by_service': {}
                }

            # Aggregate the data
            total_cost = sum(log.get('estimated_cost', 0) for log in result.data)
            total_input = sum(log.get('input_tokens', 0) for log in result.data)
            total_output = sum(log.get('output_tokens', 0) for log in result.data)
            total_requests = len(result.data)

            # Group by service
            by_service = {}
            for log in result.data:
                service = log.get('service_name', 'unknown')
                if service not in by_service:
                    by_service[service] = {
                        'requests': 0,
                        'cost_usd': 0.0,
                        'input_tokens': 0,
                        'output_tokens': 0
                    }
                by_service[service]['requests'] += 1
                by_service[service]['cost_usd'] += log.get('estimated_cost', 0)
                by_service[service]['input_tokens'] += log.get('input_tokens', 0)
                by_service[service]['output_tokens'] += log.get('output_tokens', 0)

            return {
                'period_days': days,
                'total_cost_usd': round(total_cost, 6),
                'total_requests': total_requests,
                'total_input_tokens': total_input,
                'total_output_tokens': total_output,
                'avg_cost_per_request': round(total_cost / total_requests, 8) if total_requests > 0 else 0.0,
                'by_service': by_service
            }

        except Exception as e:
            logger.error(f"Error generating usage report: {e}")
            return {
                'period_days': days,
                'total_cost_usd': 0.0,
                'total_requests': 0,
                'error': str(e)
            }
