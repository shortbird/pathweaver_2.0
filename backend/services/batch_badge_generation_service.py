"""
Batch Badge Generation Service
Handles bulk badge generation with AI for efficient content creation.
"""

from typing import Dict, List, Optional
import uuid
from datetime import datetime
from database import get_supabase_admin_client
from services.ai_badge_generation_service import AIBadgeGenerationService
import logging

logger = logging.getLogger(__name__)


class BatchBadgeGenerationService:
    """Service for batch badge generation and management."""

    @staticmethod
    def generate_batch(
        count: int,
        target_pillar: Optional[str] = None,
        complexity_level: Optional[str] = None,
        trending_topic: Optional[str] = None,
        batch_id: Optional[str] = None
    ) -> Dict:
        """
        Generate multiple badges in a single batch operation.

        Args:
            count: Number of badges to generate (1-10)
            target_pillar: Optional pillar focus
            complexity_level: Optional complexity (beginner/intermediate/advanced)
            trending_topic: Optional trending topic context
            batch_id: Optional batch identifier for tracking

        Returns:
            {
                'success': bool,
                'batch_id': str,
                'total_requested': int,
                'generated': List[Dict],  # Successfully generated badges
                'failed': List[Dict],  # Failed attempts with errors
                'submitted_to_review': int
            }
        """
        if count < 1 or count > 10:
            raise ValueError("Batch size must be between 1 and 10")

        # Generate or use provided batch_id
        if not batch_id:
            batch_id = str(uuid.uuid4())

        # Build generation parameters
        base_params = {
            'pillar_focus': target_pillar,
            'trending_topic': trending_topic or 'Student interests',
        }

        # Map complexity to XP ranges
        if complexity_level:
            complexity_mapping = {
                'beginner': {'min_xp': 1000, 'min_quests': 5},
                'intermediate': {'min_xp': 2000, 'min_quests': 7},
                'advanced': {'min_xp': 3000, 'min_quests': 10}
            }
            base_params['complexity'] = complexity_mapping.get(complexity_level, {})

        generated = []
        failed = []

        # Generate badges
        for i in range(count):
            try:
                # Add variety by varying the context slightly
                params = base_params.copy()
                if i > 0:
                    params['target_gap'] = f"Badge variation {i+1} for diverse content library"

                # Generate badge
                badge_data = AIBadgeGenerationService.generate_badge(params)

                # Add temporary ID for frontend tracking
                badge_data['temp_id'] = f"{batch_id}-badge-{i}"
                badge_data['batch_id'] = batch_id
                badge_data['batch_index'] = i

                # Apply complexity constraints if specified
                if complexity_level and 'complexity' in base_params:
                    badge_data['min_xp'] = base_params['complexity'].get('min_xp', badge_data.get('min_xp', 1500))
                    badge_data['min_quests'] = base_params['complexity'].get('min_quests', badge_data.get('min_quests', 5))

                generated.append(badge_data)
                logger.info(f"Generated badge {i+1}/{count}: {badge_data.get('name')}")

            except Exception as e:
                error_msg = str(e)
                logger.error(f"Failed to generate badge {i+1}/{count}: {error_msg}")
                failed.append({
                    'index': i,
                    'error': error_msg
                })

        return {
            'success': True,
            'batch_id': batch_id,
            'total_requested': count,
            'generated': generated,
            'failed': failed,
            'submitted_to_review': len(generated)
        }

    @staticmethod
    def get_batch_status(batch_id: str) -> Dict:
        """
        Get status of a batch generation job.

        Args:
            batch_id: Batch identifier

        Returns:
            Status information about the batch
        """
        supabase = get_supabase_admin_client()

        try:
            # Query for badges created with this batch_id
            # Note: We'd need a batch_id column in badges table to track this
            # For now, return basic info
            result = supabase.table('badges')\
                .select('*')\
                .eq('ai_generated', True)\
                .order('created_at', desc=True)\
                .limit(10)\
                .execute()

            return {
                'success': True,
                'batch_id': batch_id,
                'badges': result.data or []
            }

        except Exception as e:
            logger.error(f"Error getting batch status: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def create_badge_from_generation(
        badge_data: Dict,
        generate_image: bool = False,
        generate_quests: bool = False,
        quest_count: int = 10
    ) -> Dict:
        """
        Create a badge in the database from generated data.

        Args:
            badge_data: Badge data from generation
            generate_image: Whether to generate Pexels image
            generate_quests: Whether to generate initial quests
            quest_count: Number of quests to generate

        Returns:
            Created badge with optional quests/image
        """
        supabase = get_supabase_admin_client()

        try:
            # Remove temporary fields
            clean_data = badge_data.copy()
            clean_data.pop('temp_id', None)
            clean_data.pop('batch_id', None)
            clean_data.pop('batch_index', None)
            clean_data.pop('quality_score', None)
            clean_data.pop('quality_feedback', None)

            # Ensure required fields
            clean_data['ai_generated'] = True
            clean_data['status'] = clean_data.get('status', 'active')

            # Create badge
            result = supabase.table('badges').insert(clean_data).execute()

            if not result.data:
                raise ValueError("Failed to create badge in database")

            created_badge = result.data[0]
            badge_id = created_badge['id']

            response = {
                'success': True,
                'badge': created_badge
            }

            # Generate image if requested
            if generate_image:
                try:
                    from services.image_service import search_badge_image

                    image_url = search_badge_image(
                        created_badge['name'],
                        created_badge['identity_statement'],
                        created_badge.get('pillar_primary')
                    )

                    if image_url:
                        supabase.table('badges').update({
                            'image_url': image_url,
                            'image_generated_at': datetime.utcnow().isoformat(),
                            'image_generation_status': 'success'
                        }).eq('id', badge_id).execute()

                        response['image_generated'] = True
                        response['image_url'] = image_url
                    else:
                        response['image_generated'] = False
                        response['image_error'] = 'No suitable image found'

                except Exception as e:
                    logger.error(f"Error generating image: {str(e)}")
                    response['image_generated'] = False
                    response['image_error'] = str(e)

            # Generate quests if requested
            if generate_quests:
                try:
                    quests = AIBadgeGenerationService.create_initial_quests(badge_id, count=quest_count)
                    response['quests_generated'] = len(quests)
                    response['quests'] = quests

                except Exception as e:
                    logger.error(f"Error generating quests: {str(e)}")
                    response['quest_generation_error'] = str(e)

            return response

        except Exception as e:
            logger.error(f"Error creating badge: {str(e)}")
            raise ValueError(f"Failed to create badge: {str(e)}")
