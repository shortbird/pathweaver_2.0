"""
Collaboration endpoints for Quest V3 system.
Handles team-up invitations and collaboration management.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client, get_supabase_client
from utils.auth.decorators import require_auth, require_paid_tier
from utils.user_sync import ensure_user_exists, get_user_name
from datetime import datetime
from typing import Dict, List, Optional

bp = Blueprint('collaborations', __name__, url_prefix='/api/v3/collaborations')

@bp.route('/invite', methods=['POST'])
@require_auth
@require_paid_tier
def send_collaboration_invite(user_id: str):
    """
    Send a team-up invitation to a friend for a specific quest.
    """
    try:
        supabase = get_supabase_admin_client()
        
        data = request.get_json()
        quest_id = data.get('quest_id')
        friend_id = data.get('friend_id')
        
        if not quest_id or not friend_id:
            return jsonify({
                'success': False,
                'error': 'Quest ID and friend ID are required'
            }), 400
        
        # Prevent self-invitation
        if user_id == friend_id:
            return jsonify({
                'success': False,
                'error': 'You cannot invite yourself'
            }), 400
        
        # Check if quest exists and is active
        quest = supabase.table('quests')\
            .select('id, title')\
            .eq('id', quest_id)\
            .eq('is_active', True)\
            .single()\
            .execute()
        
        if not quest.data:
            return jsonify({
                'success': False,
                'error': 'Quest not found or inactive'
            }), 404
        
        # Check if sender is enrolled in the quest
        sender_enrollment = supabase.table('user_quests')\
            .select('user_id')\
            .eq('quest_id', quest_id)\
            .eq('user_id', user_id)\
            .execute()
        
        # Auto-enroll sender if not enrolled
        if not sender_enrollment.data:
            enrollment_result = supabase.table('user_quests')\
                .insert({
                    'user_id': user_id,
                    'quest_id': quest_id,
                    'started_at': datetime.utcnow().isoformat(),
                    'is_active': True
                })\
                .execute()
            
            if not enrollment_result.data:
                return jsonify({
                    'success': False,
                    'error': 'Failed to enroll you in the quest'
                }), 500
        
        # Check for existing collaboration (pending or accepted)
        existing = supabase.table('quest_collaborations')\
            .select('id, status')\
            .eq('quest_id', quest_id)\
            .or_(f'requester_id.eq.{user_id},requester_id.eq.{friend_id}')\
            .or_(f'partner_id.eq.{user_id},partner_id.eq.{friend_id}')\
            .in_('status', ['pending', 'accepted'])\
            .execute()
        
        if existing.data:
            status = existing.data[0]['status']
            if status == 'accepted':
                return jsonify({
                    'success': False,
                    'error': 'You already have an active collaboration for this quest'
                }), 400
            else:
                return jsonify({
                    'success': False,
                    'error': 'A pending invitation already exists for this quest'
                }), 400
        
        # Get friend's name for notification (ensure user exists first)
        ensure_user_exists(friend_id)
        friend_first, friend_last = get_user_name(friend_id)
        
        # Create collaboration invitation
        try:
            invitation = supabase.table('quest_collaborations')\
                .insert({
                    'quest_id': quest_id,
                    'requester_id': user_id,
                    'partner_id': friend_id,
                    'status': 'pending',
                    'created_at': datetime.utcnow().isoformat()
                })\
                .execute()
            
            if not invitation.data:
                print(f"Failed to insert invitation - no data returned")
                return jsonify({
                    'success': False,
                    'error': 'Failed to send invitation - database insert failed'
                }), 500
        except Exception as insert_error:
            print(f"Error inserting collaboration invitation: {str(insert_error)}")
            # Check if table exists
            if 'relation "quest_collaborations" does not exist' in str(insert_error):
                return jsonify({
                    'success': False,
                    'error': 'Team-up feature not yet configured. Please run the database migration.'
                }), 500
            return jsonify({
                'success': False,
                'error': f'Database error: {str(insert_error)}'
            }), 500
        
        # Get requester's name for response
        requester_info = supabase.table('users')\
            .select('first_name, last_name')\
            .eq('id', user_id)\
            .execute()
        
        # Provide fallback if user doesn't exist
        if not requester_info.data or len(requester_info.data) == 0:
            requester_info.data = [{'first_name': 'User', 'last_name': 'Account'}]
        
        friend_name = f"{friend_first} {friend_last}"
        requester_name = f"{requester_info.data[0]['first_name']} {requester_info.data[0]['last_name']}"
        
        return jsonify({
            'success': True,
            'message': f'Team-up invitation sent to {friend_name}',
            'invitation': {
                **invitation.data[0],
                'quest_title': quest.data['title'],
                'friend_name': friend_name,
                'requester_name': requester_name
            }
        })
        
    except Exception as e:
        print(f"Error sending collaboration invite: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to send invitation'
        }), 500

@bp.route('/invites', methods=['GET'])
@require_auth
@require_paid_tier
def get_pending_invites(user_id: str):
    """
    Get all pending team-up invitations for the current user.
    """
    try:
        supabase = get_supabase_client()
        
        print(f"Fetching invitations for user: {user_id}")
        
        # Get invitations where user is the partner
        invitations = supabase.table('quest_collaborations')\
            .select('*')\
            .eq('partner_id', user_id)\
            .eq('status', 'pending')\
            .order('created_at', desc=True)\
            .execute()
        
        print(f"Found {len(invitations.data or [])} pending invitations")
        
        if not invitations.data:
            return jsonify({
                'success': True,
                'invitations': [],
                'message': 'No pending invitations'
            })
        
        # Format invitations for display - fetch related data separately
        formatted_invites = []
        for invite in invitations.data:
            # Get quest details
            quest = supabase.table('quests')\
                .select('id, title, header_image_url')\
                .eq('id', invite['quest_id'])\
                .single()\
                .execute()
            
            # Get requester details - use execute() without single() to handle missing users
            requester = supabase.table('users')\
                .select('id, first_name, last_name, avatar_url')\
                .eq('id', invite['requester_id'])\
                .execute()
            
            # Handle case where user doesn't exist in users table
            if not requester.data or len(requester.data) == 0:
                # Create a placeholder for missing user
                requester.data = [{
                    'id': invite['requester_id'],
                    'first_name': 'Unknown',
                    'last_name': 'User',
                    'avatar_url': None
                }]
            
            formatted_invites.append({
                'id': invite['id'],
                'quest': quest.data if quest.data else None,
                'requester': requester.data[0] if requester.data else None,
                'created_at': invite['created_at'],
                'status': invite['status']
            })
        
        return jsonify({
            'success': True,
            'invitations': formatted_invites,
            'total': len(formatted_invites)
        })
        
    except Exception as e:
        print(f"Error getting pending invites: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch invitations'
        }), 500

@bp.route('/<invite_id>/accept', methods=['POST'])
@require_auth
@require_paid_tier
def accept_invitation(user_id: str, invite_id: str):
    """
    Accept a team-up invitation.
    """
    try:
        supabase = get_supabase_admin_client()
        
        # Get the invitation
        invitation = supabase.table('quest_collaborations')\
            .select('*, quests(title)')\
            .eq('id', invite_id)\
            .eq('partner_id', user_id)\
            .eq('status', 'pending')\
            .single()\
            .execute()
        
        if not invitation.data:
            return jsonify({
                'success': False,
                'error': 'Invitation not found or already processed'
            }), 404
        
        quest_id = invitation.data['quest_id']
        
        # Auto-enroll the accepting user if not already enrolled
        user_enrollment = supabase.table('user_quests')\
            .select('id')\
            .eq('quest_id', quest_id)\
            .eq('user_id', user_id)\
            .execute()
        
        if not user_enrollment.data:
            enrollment_result = supabase.table('user_quests')\
                .insert({
                    'user_id': user_id,
                    'quest_id': quest_id,
                    'started_at': datetime.utcnow().isoformat(),
                    'is_active': True
                })\
                .execute()
            
            if not enrollment_result.data:
                return jsonify({
                    'success': False,
                    'error': 'Failed to enroll you in the quest'
                }), 500
        
        # Update invitation status
        updated = supabase.table('quest_collaborations')\
            .update({
                'status': 'accepted',
                'accepted_at': datetime.utcnow().isoformat()
            })\
            .eq('id', invite_id)\
            .execute()
        
        if not updated.data:
            return jsonify({
                'success': False,
                'error': 'Failed to accept invitation'
            }), 500
        
        # Get requester's name for notification
        requester = supabase.table('users')\
            .select('first_name, last_name')\
            .eq('id', invitation.data['requester_id'])\
            .single()\
            .execute()
        
        requester_name = f"{requester.data['first_name']} {requester.data['last_name']}"
        
        return jsonify({
            'success': True,
            'message': f'Team-up accepted! You and {requester_name} will earn 2x XP for "{invitation.data["quests"]["title"]}"',
            'collaboration': updated.data[0]
        })
        
    except Exception as e:
        print(f"Error accepting invitation: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to accept invitation'
        }), 500

@bp.route('/<invite_id>/decline', methods=['POST'])
@require_auth
@require_paid_tier
def decline_invitation(user_id: str, invite_id: str):
    """
    Decline a team-up invitation.
    """
    try:
        supabase = get_supabase_admin_client()
        
        # Get the invitation
        invitation = supabase.table('quest_collaborations')\
            .select('id')\
            .eq('id', invite_id)\
            .eq('partner_id', user_id)\
            .eq('status', 'pending')\
            .single()\
            .execute()
        
        if not invitation.data:
            return jsonify({
                'success': False,
                'error': 'Invitation not found or already processed'
            }), 404
        
        # Update invitation status
        updated = supabase.table('quest_collaborations')\
            .update({
                'status': 'declined'
            })\
            .eq('id', invite_id)\
            .execute()
        
        if not updated.data:
            return jsonify({
                'success': False,
                'error': 'Failed to decline invitation'
            }), 500
        
        return jsonify({
            'success': True,
            'message': 'Invitation declined',
            'collaboration': updated.data[0]
        })
        
    except Exception as e:
        print(f"Error declining invitation: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to decline invitation'
        }), 500

@bp.route('/active', methods=['GET'])
@require_auth
@require_paid_tier
def get_active_collaborations(user_id: str):
    """
    Get all active collaborations for the current user.
    """
    try:
        supabase = get_supabase_client()
        
        # Get collaborations where user is either requester or partner
        collaborations = supabase.table('quest_collaborations')\
            .select('*, quests(id, title, header_image_url)')\
            .eq('status', 'accepted')\
            .or_(f'requester_id.eq.{user_id},partner_id.eq.{user_id}')\
            .execute()
        
        if not collaborations.data:
            return jsonify({
                'success': True,
                'collaborations': [],
                'message': 'No active collaborations'
            })
        
        # Format collaborations with partner info
        formatted_collabs = []
        for collab in collaborations.data:
            # Determine the partner ID
            partner_id = collab['partner_id'] if collab['requester_id'] == user_id else collab['requester_id']
            
            # Get partner info (ensure user exists first)
            user_data = ensure_user_exists(partner_id)
            
            if user_data:
                partner_data = {
                    'id': partner_id,
                    'first_name': user_data.get('first_name', 'User'),
                    'last_name': user_data.get('last_name', 'Account'),
                    'avatar_url': user_data.get('avatar_url')
                }
            else:
                partner_data = {
                    'id': partner_id,
                    'first_name': 'User',
                    'last_name': 'Account',
                    'avatar_url': None
                }
            
            formatted_collabs.append({
                'id': collab['id'],
                'quest': collab['quests'],
                'partner': partner_data,
                'accepted_at': collab['accepted_at'],
                'role': 'requester' if collab['requester_id'] == user_id else 'partner'
            })
        
        return jsonify({
            'success': True,
            'collaborations': formatted_collabs,
            'total': len(formatted_collabs)
        })
        
    except Exception as e:
        print(f"Error getting active collaborations: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch collaborations'
        }), 500

@bp.route('/<collab_id>/complete', methods=['POST'])
@require_auth
@require_paid_tier
def mark_collaboration_complete(user_id: str, collab_id: str):
    """
    Mark a collaboration as completed when the quest is finished.
    """
    try:
        supabase = get_supabase_admin_client()
        
        # Get the collaboration
        collaboration = supabase.table('quest_collaborations')\
            .select('*')\
            .eq('id', collab_id)\
            .eq('status', 'accepted')\
            .or_(f'requester_id.eq.{user_id},partner_id.eq.{user_id}')\
            .single()\
            .execute()
        
        if not collaboration.data:
            return jsonify({
                'success': False,
                'error': 'Collaboration not found or not active'
            }), 404
        
        # Update collaboration status
        updated = supabase.table('quest_collaborations')\
            .update({
                'status': 'completed'
            })\
            .eq('id', collab_id)\
            .execute()
        
        if not updated.data:
            return jsonify({
                'success': False,
                'error': 'Failed to mark collaboration as complete'
            }), 500
        
        return jsonify({
            'success': True,
            'message': 'Collaboration marked as complete',
            'collaboration': updated.data[0]
        })
        
    except Exception as e:
        print(f"Error marking collaboration complete: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to complete collaboration'
        }), 500