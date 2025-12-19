"""
Subscription tier management for AI tutor features.
Handles different access levels and limits based on user subscription tiers.
"""

from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from enum import Enum
import logging

from utils.logger import get_logger

logger = get_logger(__name__)

from services.base_service import BaseService
from database import get_supabase_admin_client

logger = logging.getLogger(__name__)

class TutorTier(Enum):
    """AI Tutor subscription tiers"""
    EXPLORE = "Explore"
    ACCELERATE = "Accelerate"
    ACHIEVE = "Achieve"
    EXCEL = "Excel"

@dataclass
class TierLimits:
    """Limits and features for a subscription tier"""
    daily_message_limit: int
    features: List[str]
    max_conversation_history: int
    priority_support: bool
    advanced_analytics: bool
    parent_monitoring: bool
    custom_modes: bool

class TutorTierService(BaseService):
    """Service for managing tutor subscription tier access and limits"""

    def __init__(self):
        """Initialize tier service with predefined limits"""
        super().__init__()
        # Lazy-initialize client to avoid Flask context issues at import time
        self._supabase = None
        self.tier_limits = self._define_tier_limits()
        self.tier_mappings = self._define_tier_mappings()

    @property
    def supabase(self):
        """Lazy-load Supabase admin client on first access."""
        if self._supabase is None:
            self._supabase = get_supabase_admin_client()
        return self._supabase

    def _define_tier_limits(self) -> Dict[TutorTier, TierLimits]:
        """Define limits and features for each tier"""
        return {
            TutorTier.EXPLORE: TierLimits(
                daily_message_limit=10,
                features=[
                    'basic_explanations',
                    'simple_chat',
                    'safety_monitoring'
                ],
                max_conversation_history=3,  # conversations
                priority_support=False,
                advanced_analytics=False,
                parent_monitoring=True,
                custom_modes=False
            ),
            TutorTier.ACCELERATE: TierLimits(
                daily_message_limit=50,
                features=[
                    'basic_explanations',
                    'advanced_features',
                    'quest_integration',
                    'learning_analytics',
                    'conversation_modes',
                    'context_awareness',
                    'safety_monitoring'
                ],
                max_conversation_history=10,
                priority_support=False,
                advanced_analytics=True,
                parent_monitoring=True,
                custom_modes=True
            ),
            TutorTier.ACHIEVE: TierLimits(
                daily_message_limit=100,
                features=[
                    'basic_explanations',
                    'advanced_features',
                    'quest_integration',
                    'learning_analytics',
                    'conversation_modes',
                    'context_awareness',
                    'safety_monitoring',
                    'priority_responses',
                    'team_collaboration'
                ],
                max_conversation_history=25,
                priority_support=False,
                advanced_analytics=True,
                parent_monitoring=True,
                custom_modes=True
            ),
            TutorTier.EXCEL: TierLimits(
                daily_message_limit=999,  # Effectively unlimited
                features=[
                    'unlimited_chat',
                    'all_features',
                    'priority_support',
                    'advanced_analytics',
                    'custom_learning_paths',
                    'detailed_progress_tracking',
                    'conversation_modes',
                    'context_awareness',
                    'quest_integration',
                    'safety_monitoring',
                    'parent_dashboard_premium',
                    'admin_controls'
                ],
                max_conversation_history=100,
                priority_support=True,
                advanced_analytics=True,
                parent_monitoring=True,
                custom_modes=True
            )
        }

    def _define_tier_mappings(self) -> Dict[str, TutorTier]:
        """Map database subscription tier values to TutorTier enum"""
        return {
            'Explore': TutorTier.EXPLORE,
            'Accelerate': TutorTier.ACCELERATE,
            'Achieve': TutorTier.ACHIEVE,
            'Excel': TutorTier.EXCEL,
        }

    def get_user_tier(self, user_id: str) -> TutorTier:
        """Get user's tutor tier based on subscription"""
        # NEUTERED - Phase 3 refactoring (January 2025)
        # All users now have EXPLORE tier (free tier) - no subscription tiers
        # subscription_tier column was deleted from users table in Phase 1
        logger.debug(f"All users have EXPLORE tier (free tier) - user {user_id}")
        return TutorTier.EXPLORE

    def get_tier_limits(self, tier: TutorTier) -> TierLimits:
        """Get limits and features for a specific tier"""
        return self.tier_limits.get(tier, self.tier_limits[TutorTier.EXPLORE])

    def can_send_message(self, user_id: str) -> Dict[str, Any]:
        """Check if user can send a message based on tier limits"""
        try:
            tier = self.get_user_tier(user_id)
            limits = self.get_tier_limits(tier)

            # Check current usage
            supabase = get_supabase_admin_client()
            settings = supabase.table('tutor_settings').select(
                'messages_used_today, daily_message_limit, last_reset_date'
            ).eq('user_id', user_id).execute()

            if not settings.data or len(settings.data) == 0:
                # Create default settings
                self._create_default_settings(user_id, limits)
                return {
                    'can_send': True,
                    'messages_remaining': limits.daily_message_limit,
                    'tier': tier.value,
                    'limit': limits.daily_message_limit
                }

            settings_data = settings.data[0]
            messages_used = settings_data.get('messages_used_today', 0)
            daily_limit = settings_data.get('daily_message_limit', limits.daily_message_limit)

            # Reset if it's a new day
            from datetime import date
            last_reset = settings_data.get('last_reset_date')
            if not last_reset or last_reset != date.today().isoformat():
                messages_used = 0
                supabase.table('tutor_settings').update({
                    'messages_used_today': 0,
                    'last_reset_date': date.today().isoformat()
                }).eq('user_id', user_id).execute()

            can_send = messages_used < daily_limit
            messages_remaining = max(0, daily_limit - messages_used)

            return {
                'can_send': can_send,
                'messages_remaining': messages_remaining,
                'messages_used': messages_used,
                'tier': tier.value,
                'limit': daily_limit,
                'tier_features': limits.features
            }

        except Exception as e:
            logger.error(f"Failed to check message limit for {user_id}: {e}")
            # Default to allowing if check fails
            return {
                'can_send': True,
                'messages_remaining': 10,
                'tier': 'Explore',
                'limit': 10
            }

    def has_feature(self, user_id: str, feature: str) -> bool:
        """Check if user's tier includes a specific feature"""
        try:
            tier = self.get_user_tier(user_id)
            limits = self.get_tier_limits(tier)
            return feature in limits.features
        except Exception as e:
            logger.error(f"Failed to check feature {feature} for {user_id}: {e}")
            return False

    def get_feature_access(self, user_id: str) -> Dict[str, bool]:
        """Get comprehensive feature access for user's tier"""
        try:
            tier = self.get_user_tier(user_id)
            limits = self.get_tier_limits(tier)

            return {
                'basic_chat': True,  # Available to all tiers
                'advanced_explanations': 'advanced_features' in limits.features,
                'quest_integration': 'quest_integration' in limits.features,
                'conversation_modes': 'conversation_modes' in limits.features,
                'learning_analytics': 'learning_analytics' in limits.features,
                'priority_support': limits.priority_support,
                'advanced_analytics': limits.advanced_analytics,
                'parent_monitoring': limits.parent_monitoring,
                'custom_modes': limits.custom_modes,
                'unlimited_chat': 'unlimited_chat' in limits.features,
                'detailed_progress': 'detailed_progress_tracking' in limits.features,
                'custom_learning_paths': 'custom_learning_paths' in limits.features,
                'tier_name': tier.value,
                'daily_limit': limits.daily_message_limit,
                'max_conversations': limits.max_conversation_history
            }
        except Exception as e:
            logger.error(f"Failed to get feature access for {user_id}: {e}")
            return self._get_default_access()

    def get_upgrade_suggestions(self, user_id: str) -> Dict[str, Any]:
        """Get upgrade suggestions based on current usage and tier"""
        try:
            current_tier = self.get_user_tier(user_id)
            current_limits = self.get_tier_limits(current_tier)

            suggestions = []

            if current_tier == TutorTier.EXPLORE:
                suggestions.append({
                    'target_tier': 'Accelerate',
                    'benefits': [
                        '50 messages per day (5x more)',
                        'Advanced conversation modes',
                        'Quest integration',
                        'Learning analytics',
                        'Context-aware responses'
                    ],
                    'price_info': 'Accelerate tier starts at $39.99/month'
                })

            if current_tier == TutorTier.ACCELERATE:
                suggestions.append({
                    'target_tier': 'Achieve',
                    'benefits': [
                        '100 daily messages (2x more)',
                        'Team collaboration features',
                        'Priority responses',
                        'Advanced learning paths'
                    ],
                    'price_info': 'Achieve tier starts at $199.99/month'
                })

            if current_tier == TutorTier.ACHIEVE:
                suggestions.append({
                    'target_tier': 'Excel',
                    'benefits': [
                        'Unlimited daily messages',
                        'Priority support',
                        'Advanced analytics',
                        'Custom learning paths',
                        'Detailed progress tracking',
                        'Accredited diploma'
                    ],
                    'price_info': 'Excel tier starts at $499.99/month'
                })

            return {
                'current_tier': current_tier.value,
                'current_limits': {
                    'daily_messages': current_limits.daily_message_limit,
                    'features': current_limits.features
                },
                'suggestions': suggestions
            }

        except Exception as e:
            logger.error(f"Failed to get upgrade suggestions for {user_id}: {e}")
            return {'current_tier': 'Explore', 'suggestions': []}

    def enforce_conversation_history_limit(self, user_id: str) -> None:
        """Enforce conversation history limit based on tier"""
        try:
            tier = self.get_user_tier(user_id)
            limits = self.get_tier_limits(tier)
            max_conversations = limits.max_conversation_history

            supabase = get_supabase_admin_client()

            # Get user's conversations ordered by last activity
            conversations = supabase.table('tutor_conversations').select(
                'id, last_message_at'
            ).eq('user_id', user_id).eq('is_active', True).order(
                'last_message_at', desc=True
            ).execute()

            if len(conversations.data) > max_conversations:
                # Deactivate oldest conversations
                conversations_to_deactivate = conversations.data[max_conversations:]
                conversation_ids = [conv['id'] for conv in conversations_to_deactivate]

                supabase.table('tutor_conversations').update({
                    'is_active': False
                }).in_('id', conversation_ids).execute()

                logger.info(f"Deactivated {len(conversation_ids)} conversations for user {user_id} (tier: {tier.value})")

        except Exception as e:
            logger.error(f"Failed to enforce conversation limit for {user_id}: {e}")

    def _create_default_settings(self, user_id: str, limits: TierLimits) -> None:
        """Create default tutor settings for user based on tier"""
        try:
            from datetime import date
            supabase = get_supabase_admin_client()

            default_settings = {
                'user_id': user_id,
                'daily_message_limit': limits.daily_message_limit,
                'messages_used_today': 0,
                'last_reset_date': date.today().isoformat(),
                'preferred_mode': 'study_buddy',
                'parent_monitoring_enabled': limits.parent_monitoring,
                'notification_preferences': {}
            }

            supabase.table('tutor_settings').upsert(default_settings).execute()

        except Exception as e:
            logger.error(f"Failed to create default settings for {user_id}: {e}")

    def _get_default_access(self) -> Dict[str, Any]:
        """Get default feature access (Explore tier)"""
        return {
            'basic_chat': True,
            'advanced_explanations': False,
            'quest_integration': False,
            'conversation_modes': False,
            'learning_analytics': False,
            'priority_support': False,
            'advanced_analytics': False,
            'parent_monitoring': True,
            'custom_modes': False,
            'unlimited_chat': False,
            'detailed_progress': False,
            'custom_learning_paths': False,
            'tier_name': 'Explore',
            'daily_limit': 10,
            'max_conversations': 3
        }

    def update_tier_limits_in_database(self) -> None:
        """Update tier limits in database table"""
        try:
            supabase = get_supabase_admin_client()

            # Clear existing limits
            supabase.table('tutor_tier_limits').delete().execute()

            # Insert current limits
            tier_data = []
            for tier_enum, limits in self.tier_limits.items():
                tier_data.append({
                    'tier': tier_enum.value,
                    'daily_message_limit': limits.daily_message_limit,
                    'features': limits.features
                })

            supabase.table('tutor_tier_limits').insert(tier_data).execute()
            logger.info("Updated tier limits in database")

        except Exception as e:
            logger.error(f"Failed to update tier limits in database: {e}")

# Global instance
tutor_tier_service = TutorTierService()