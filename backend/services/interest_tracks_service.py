"""
Interest Tracks Service
=======================

Handles business logic for Interest Tracks - organizational containers
for grouping related learning moments.

Features:
- CRUD operations for tracks
- Track statistics and analytics
- Moment assignment and management
- AI-powered track suggestions
"""

from typing import Dict, List, Optional, Any
from datetime import datetime
import logging
from services.base_service import BaseService
from database import get_supabase_admin_client, get_user_client

from utils.logger import get_logger

logger = get_logger(__name__)


class InterestTracksService(BaseService):
    """Service for managing interest tracks and their moments."""

    # Default track colors (Tailwind-inspired)
    DEFAULT_COLORS = [
        '#6366f1',  # indigo
        '#8b5cf6',  # violet
        '#ec4899',  # pink
        '#f43f5e',  # rose
        '#f97316',  # orange
        '#eab308',  # yellow
        '#22c55e',  # green
        '#14b8a6',  # teal
        '#06b6d4',  # cyan
        '#3b82f6',  # blue
    ]

    # Default icons
    DEFAULT_ICONS = [
        'folder', 'star', 'book', 'code', 'paint',
        'music', 'science', 'globe', 'lightbulb', 'heart'
    ]

    @staticmethod
    def create_track(
        user_id: str,
        name: str,
        description: Optional[str] = None,
        color: Optional[str] = None,
        icon: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a new interest track.

        Args:
            user_id: The user creating the track
            name: Track name
            description: Optional description
            color: Optional hex color (defaults to random from palette)
            icon: Optional icon name

        Returns:
            Dictionary with success status and track data
        """
        try:
            supabase = get_supabase_admin_client()

            # Default color if not provided
            if not color:
                import random
                color = random.choice(InterestTracksService.DEFAULT_COLORS)

            # Default icon if not provided
            if not icon:
                icon = 'folder'

            track_data = {
                'user_id': user_id,
                'name': name,
                'description': description,
                'color': color,
                'icon': icon,
                'moment_count': 0
            }

            response = supabase.table('interest_tracks').insert(track_data).execute()

            if response.data and len(response.data) > 0:
                return {
                    'success': True,
                    'track': response.data[0]
                }
            else:
                return {
                    'success': False,
                    'error': 'Failed to create interest track'
                }

        except Exception as e:
            logger.error(f"Error creating interest track: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def get_user_tracks(
        user_id: str,
        include_moment_count: bool = True
    ) -> Dict[str, Any]:
        """
        Get all interest tracks for a user.

        Args:
            user_id: The user whose tracks to fetch
            include_moment_count: Whether to include moment counts

        Returns:
            Dictionary with success status and tracks list
        """
        try:
            supabase = get_supabase_admin_client()

            response = supabase.table('interest_tracks') \
                .select('*') \
                .eq('user_id', user_id) \
                .order('created_at', desc=True) \
                .execute()

            tracks = response.data or []

            return {
                'success': True,
                'tracks': tracks
            }

        except Exception as e:
            logger.error(f"Error fetching interest tracks: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'tracks': []
            }

    @staticmethod
    def get_track_with_moments(
        user_id: str,
        track_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Get a specific track with its learning moments.

        Args:
            user_id: The requesting user
            track_id: The track ID
            limit: Maximum moments to return
            offset: Pagination offset

        Returns:
            Dictionary with track data and moments
        """
        try:
            supabase = get_supabase_admin_client()

            # Get track
            track_response = supabase.table('interest_tracks') \
                .select('*') \
                .eq('id', track_id) \
                .eq('user_id', user_id) \
                .single() \
                .execute()

            if not track_response.data:
                return {
                    'success': False,
                    'error': 'Track not found'
                }

            track = track_response.data

            # Get moments in this track
            moments_response = supabase.table('learning_events') \
                .select('*, learning_event_evidence_blocks(*)') \
                .eq('track_id', track_id) \
                .eq('user_id', user_id) \
                .order('created_at', desc=True) \
                .limit(limit) \
                .offset(offset) \
                .execute()

            track['moments'] = moments_response.data or []

            return {
                'success': True,
                'track': track
            }

        except Exception as e:
            logger.error(f"Error fetching track with moments: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def get_track_stats(user_id: str, track_id: str) -> Dict[str, Any]:
        """
        Get statistics for a track.

        Args:
            user_id: The requesting user
            track_id: The track ID

        Returns:
            Dictionary with track statistics
        """
        try:
            supabase = get_supabase_admin_client()

            # Verify ownership
            track_response = supabase.table('interest_tracks') \
                .select('id, name, moment_count, created_at') \
                .eq('id', track_id) \
                .eq('user_id', user_id) \
                .single() \
                .execute()

            if not track_response.data:
                return {
                    'success': False,
                    'error': 'Track not found'
                }

            # Get pillar distribution
            moments_response = supabase.table('learning_events') \
                .select('pillars, created_at') \
                .eq('track_id', track_id) \
                .eq('user_id', user_id) \
                .execute()

            moments = moments_response.data or []

            # Calculate pillar distribution
            pillar_counts = {}
            date_range = {'earliest': None, 'latest': None}

            for moment in moments:
                pillars = moment.get('pillars', []) or []
                for pillar in pillars:
                    pillar_counts[pillar] = pillar_counts.get(pillar, 0) + 1

                created = moment.get('created_at')
                if created:
                    if not date_range['earliest'] or created < date_range['earliest']:
                        date_range['earliest'] = created
                    if not date_range['latest'] or created > date_range['latest']:
                        date_range['latest'] = created

            return {
                'success': True,
                'stats': {
                    'track_id': track_id,
                    'track_name': track_response.data['name'],
                    'moment_count': track_response.data['moment_count'],
                    'pillar_distribution': pillar_counts,
                    'date_range': date_range,
                    'created_at': track_response.data['created_at']
                }
            }

        except Exception as e:
            logger.error(f"Error fetching track stats: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def update_track(
        user_id: str,
        track_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        color: Optional[str] = None,
        icon: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Update an interest track.

        Args:
            user_id: The requesting user
            track_id: The track ID to update
            name: New name
            description: New description
            color: New color
            icon: New icon

        Returns:
            Dictionary with success status and updated track
        """
        try:
            supabase = get_supabase_admin_client()

            update_data = {'updated_at': datetime.utcnow().isoformat()}

            if name is not None:
                update_data['name'] = name
            if description is not None:
                update_data['description'] = description
            if color is not None:
                update_data['color'] = color
            if icon is not None:
                update_data['icon'] = icon

            if len(update_data) == 1:  # Only updated_at
                return {
                    'success': False,
                    'error': 'No fields to update'
                }

            response = supabase.table('interest_tracks') \
                .update(update_data) \
                .eq('id', track_id) \
                .eq('user_id', user_id) \
                .execute()

            if response.data and len(response.data) > 0:
                return {
                    'success': True,
                    'track': response.data[0]
                }
            else:
                return {
                    'success': False,
                    'error': 'Track not found or update failed'
                }

        except Exception as e:
            logger.error(f"Error updating interest track: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def delete_track(user_id: str, track_id: str) -> Dict[str, Any]:
        """
        Delete an interest track. Moments become unassigned (track_id = null).

        Args:
            user_id: The requesting user
            track_id: The track ID to delete

        Returns:
            Dictionary with success status
        """
        try:
            supabase = get_supabase_admin_client()

            # Delete track (moments will have track_id set to NULL due to ON DELETE SET NULL)
            response = supabase.table('interest_tracks') \
                .delete() \
                .eq('id', track_id) \
                .eq('user_id', user_id) \
                .execute()

            return {
                'success': True,
                'message': 'Track deleted successfully'
            }

        except Exception as e:
            logger.error(f"Error deleting interest track: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def get_unassigned_moments(
        user_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Get learning moments that are not assigned to any track.

        Args:
            user_id: The user whose moments to fetch
            limit: Maximum moments to return
            offset: Pagination offset

        Returns:
            Dictionary with unassigned moments
        """
        try:
            supabase = get_supabase_admin_client()

            response = supabase.table('learning_events') \
                .select('*, learning_event_evidence_blocks(*)') \
                .eq('user_id', user_id) \
                .is_('track_id', 'null') \
                .order('created_at', desc=True) \
                .limit(limit) \
                .offset(offset) \
                .execute()

            return {
                'success': True,
                'moments': response.data or []
            }

        except Exception as e:
            logger.error(f"Error fetching unassigned moments: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'moments': []
            }

    @staticmethod
    def assign_moment_to_track(
        user_id: str,
        moment_id: str,
        track_id: Optional[str]
    ) -> Dict[str, Any]:
        """
        Assign a learning moment to a track (or remove from track if track_id is None).

        Args:
            user_id: The requesting user
            moment_id: The moment to assign
            track_id: The track ID (or None to unassign)

        Returns:
            Dictionary with success status
        """
        try:
            supabase = get_supabase_admin_client()

            # Get current track assignment to update counts
            current_response = supabase.table('learning_events') \
                .select('track_id') \
                .eq('id', moment_id) \
                .eq('user_id', user_id) \
                .single() \
                .execute()

            if not current_response.data:
                return {
                    'success': False,
                    'error': 'Moment not found'
                }

            old_track_id = current_response.data.get('track_id')

            # Verify new track ownership if assigning
            if track_id:
                track_response = supabase.table('interest_tracks') \
                    .select('id') \
                    .eq('id', track_id) \
                    .eq('user_id', user_id) \
                    .single() \
                    .execute()

                if not track_response.data:
                    return {
                        'success': False,
                        'error': 'Track not found'
                    }

            # Update moment
            response = supabase.table('learning_events') \
                .update({'track_id': track_id}) \
                .eq('id', moment_id) \
                .eq('user_id', user_id) \
                .execute()

            if response.data and len(response.data) > 0:
                # Update track moment counts
                if old_track_id and old_track_id != track_id:
                    supabase.rpc('decrement_track_moment_count', {'track_id': old_track_id}).execute()

                if track_id and track_id != old_track_id:
                    supabase.rpc('increment_track_moment_count', {'track_id': track_id}).execute()

                return {
                    'success': True,
                    'moment': response.data[0]
                }
            else:
                return {
                    'success': False,
                    'error': 'Failed to assign moment to track'
                }

        except Exception as e:
            logger.error(f"Error assigning moment to track: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
