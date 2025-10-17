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

bp = Blueprint('collaborations', __name__, url_prefix='/api/collaborations')

@bp.route('/invite', methods=['POST'])
@require_auth

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

def get_all_invites(user_id: str):
    """
    Get all team-up invitations for the current user (received and sent).
    """
    try:
        supabase = get_supabase_client()

        print(f"Fetching invitations for user: {user_id}")

        # Get all invitations where user is either partner or requester
        try:
            all_invitations = supabase.table('quest_collaborations')\
                .select('*')\
                .or_(f'partner_id.eq.{user_id},requester_id.eq.{user_id}')\
                .order('created_at', desc=True)\
                .execute()
        except Exception as db_error:
            print(f"Database error getting invitations: {str(db_error)}")
            # Fallback to separate queries
            received_invitations = supabase.table('quest_collaborations')\
                .select('*')\
                .eq('partner_id', user_id)\
                .order('created_at', desc=True)\
                .execute()

            sent_invitations = supabase.table('quest_collaborations')\
                .select('*')\
                .eq('requester_id', user_id)\
                .order('created_at', desc=True)\
                .execute()

            # Combine results
            all_invitations_data = (received_invitations.data or []) + (sent_invitations.data or [])
            all_invitations = type('MockResponse', (), {'data': all_invitations_data})()

        print(f"Found {len(all_invitations.data or [])} total invitations")

        if not all_invitations.data:
            return jsonify({
                'success': True,
                'invitations': [],
                'sent_invitations': [],
                'message': 'No invitations'
            })

        # Separate and format invitations
        formatted_received = []
        formatted_sent = []

        for invite in all_invitations.data:
            # Get quest details
            quest = supabase.table('quests')\
                .select('id, title, header_image_url')\
                .eq('id', invite['quest_id'])\
                .single()\
                .execute()

            if invite['partner_id'] == user_id:
                # This is a received invitation
                requester_data = ensure_user_exists(invite['requester_id'])

                if requester_data:
                    requester_info = {
                        'id': invite['requester_id'],
                        'first_name': requester_data.get('first_name', 'User'),
                        'last_name': requester_data.get('last_name', 'Account'),
                        'avatar_url': requester_data.get('avatar_url')
                    }
                else:
                    requester_info = {
                        'id': invite['requester_id'],
                        'first_name': 'User',
                        'last_name': 'Account',
                        'avatar_url': None
                    }

                formatted_received.append({
                    'id': invite['id'],
                    'quest': quest.data if quest.data else None,
                    'requester': requester_info,
                    'created_at': invite['created_at'],
                    'status': invite['status']
                })

            elif invite['requester_id'] == user_id:
                # This is a sent invitation
                partner_data = ensure_user_exists(invite['partner_id'])

                if partner_data:
                    partner_info = {
                        'id': invite['partner_id'],
                        'first_name': partner_data.get('first_name', 'User'),
                        'last_name': partner_data.get('last_name', 'Account'),
                        'avatar_url': partner_data.get('avatar_url')
                    }
                else:
                    partner_info = {
                        'id': invite['partner_id'],
                        'first_name': 'User',
                        'last_name': 'Account',
                        'avatar_url': None
                    }

                formatted_sent.append({
                    'id': invite['id'],
                    'quest': quest.data if quest.data else None,
                    'partner': partner_info,
                    'created_at': invite['created_at'],
                    'status': invite['status']
                })

        return jsonify({
            'success': True,
            'received_invitations': formatted_received,  # Received invitations
            'sent_invitations': formatted_sent,  # Sent invitations
            'total_received': len(formatted_received),
            'total_sent': len(formatted_sent)
        })

    except Exception as e:
        print(f"Error getting invitations: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch invitations'
        }), 500

@bp.route('/<invite_id>/accept', methods=['POST'])
@require_auth

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
        try:
            print(f"Attempting to update invitation {invite_id} to accepted status")
            updated = supabase.table('quest_collaborations')\
                .update({
                    'status': 'accepted',
                    'accepted_at': datetime.utcnow().isoformat()
                })\
                .eq('id', invite_id)\
                .execute()
            
            if not updated.data:
                print(f"Update failed - no data returned")
                return jsonify({
                    'success': False,
                    'error': 'Failed to accept invitation - no data returned'
                }), 500
                
        except Exception as update_error:
            print(f"Error updating invitation: {str(update_error)}")
            # Try without accepted_at field in case it doesn't exist
            try:
                print(f"Retrying update without accepted_at field")
                updated = supabase.table('quest_collaborations')\
                    .update({'status': 'accepted'})\
                    .eq('id', invite_id)\
                    .execute()
                
                if not updated.data:
                    return jsonify({
                        'success': False,
                        'error': 'Failed to accept invitation - retry also failed'
                    }), 500
                    
            except Exception as retry_error:
                print(f"Retry also failed: {str(retry_error)}")
                return jsonify({
                    'success': False,
                    'error': f'Database update failed: {str(retry_error)}'
                }), 500
        
        # Get requester's name for notification
        try:
            requester_data = ensure_user_exists(invitation.data['requester_id'])
            if requester_data:
                requester_name = f"{requester_data.get('first_name', 'User')} {requester_data.get('last_name', 'Account')}"
            else:
                requester_name = "Your friend"
        except Exception as name_error:
            print(f"Error getting requester name: {str(name_error)}")
            requester_name = "Your friend"
        
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

@bp.route('/<invite_id>/cancel', methods=['DELETE'])
@require_auth

def cancel_invitation(user_id: str, invite_id: str):
    """
    Cancel a team-up invitation that the user sent.
    """
    try:
        supabase = get_supabase_admin_client()

        print(f"User {user_id} attempting to cancel invitation {invite_id}")

        # Get the invitation
        invitation = supabase.table('quest_collaborations')\
            .select('id, requester_id, status')\
            .eq('id', invite_id)\
            .eq('requester_id', user_id)\
            .single()\
            .execute()

        if not invitation.data:
            print(f"Invitation not found or unauthorized for ID: {invite_id}")
            return jsonify({
                'success': False,
                'error': 'Invitation not found or you can only cancel your own invitations'
            }), 404

        # Only pending invitations can be cancelled
        if invitation.data['status'] != 'pending':
            print(f"Invitation status is not pending: {invitation.data['status']}")
            return jsonify({
                'success': False,
                'error': 'Can only cancel pending invitations'
            }), 400

        # Delete the invitation record
        deleted = supabase.table('quest_collaborations')\
            .delete()\
            .eq('id', invite_id)\
            .execute()

        print(f"Delete result: {deleted}")

        if not deleted.data:
            return jsonify({
                'success': False,
                'error': 'Failed to cancel invitation'
            }), 500

        return jsonify({
            'success': True,
            'message': 'Team-up invitation cancelled successfully'
        })

    except Exception as e:
        print(f"Error cancelling invitation: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to cancel invitation'
        }), 500

@bp.route('/quest/<quest_id>', methods=['GET'])
@require_auth

def get_quest_invitations(user_id: str, quest_id: str):
    """
    Get invitations and collaborations for a specific quest.
    Returns pending invitations for the user and active collaborators.
    """
    try:
        supabase = get_supabase_client()

        print(f"Getting quest invitations for user {user_id} on quest {quest_id}")

        # Get any pending invitation for this user to this quest
        pending_invitation = supabase.table('quest_collaborations')\
            .select('*')\
            .eq('quest_id', quest_id)\
            .eq('partner_id', user_id)\
            .eq('status', 'pending')\
            .execute()

        # Get any active collaboration for this user on this quest
        active_collaboration = supabase.table('quest_collaborations')\
            .select('*')\
            .eq('quest_id', quest_id)\
            .eq('status', 'accepted')\
            .or_(f'partner_id.eq.{user_id},requester_id.eq.{user_id}')\
            .execute()

        # Get all active collaborators for this quest (for display)
        all_collaborators = supabase.table('quest_collaborations')\
            .select('requester_id, partner_id')\
            .eq('quest_id', quest_id)\
            .eq('status', 'accepted')\
            .execute()

        # Format pending invitation if exists
        formatted_invitation = None
        if pending_invitation.data:
            invite = pending_invitation.data[0]
            # Get requester info
            requester_data = ensure_user_exists(invite['requester_id'])
            if requester_data:
                requester_info = {
                    'id': invite['requester_id'],
                    'first_name': requester_data.get('first_name', 'User'),
                    'last_name': requester_data.get('last_name', 'Account'),
                    'avatar_url': requester_data.get('avatar_url')
                }
            else:
                requester_info = {
                    'id': invite['requester_id'],
                    'first_name': 'User',
                    'last_name': 'Account',
                    'avatar_url': None
                }

            formatted_invitation = {
                'id': invite['id'],
                'requester': requester_info,
                'created_at': invite['created_at'],
                'status': invite['status']
            }

        # Format active collaboration if exists
        formatted_collaboration = None
        if active_collaboration.data:
            collab = active_collaboration.data[0]
            partner_id = collab['partner_id'] if collab['requester_id'] == user_id else collab['requester_id']

            partner_data = ensure_user_exists(partner_id)
            if partner_data:
                partner_info = {
                    'id': partner_id,
                    'first_name': partner_data.get('first_name', 'User'),
                    'last_name': partner_data.get('last_name', 'Account'),
                    'avatar_url': partner_data.get('avatar_url')
                }
            else:
                partner_info = {
                    'id': partner_id,
                    'first_name': 'User',
                    'last_name': 'Account',
                    'avatar_url': None
                }

            formatted_collaboration = {
                'id': collab['id'],
                'partner': partner_info,
                'accepted_at': collab.get('accepted_at'),
                'role': 'requester' if collab['requester_id'] == user_id else 'partner'
            }

        # Count total collaborators on this quest
        collaborator_count = len(all_collaborators.data or []) * 2  # Each collaboration involves 2 people

        return jsonify({
            'success': True,
            'quest_id': quest_id,
            'pending_invitation': formatted_invitation,
            'active_collaboration': formatted_collaboration,
            'total_collaborators': collaborator_count,
            'has_team_up_available': formatted_invitation is not None or formatted_collaboration is not None
        })

    except Exception as e:
        print(f"Error getting quest invitations: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch quest collaborations'
        }), 500

@bp.route('/active', methods=['GET'])
@require_auth

def get_active_collaborations(user_id: str):
    """
    Get all active collaborations for the current user.
    """
    try:
        supabase = get_supabase_client()

        # Get collaborations where user is either requester or partner
        try:
            collaborations = supabase.table('quest_collaborations')\
                .select('*, quests(id, title, header_image_url)')\
                .eq('status', 'accepted')\
                .or_(f'requester_id.eq.{user_id},partner_id.eq.{user_id}')\
                .execute()
        except Exception as db_error:
            print(f"Error getting active collaborations: {str(db_error)}")
            # Return empty result instead of crashing
            return jsonify({
                'success': True,
                'collaborations': [],
                'message': 'Temporarily unable to load collaborations'
            }), 200
        
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
        import traceback
        import sys
        print(f"Error getting active collaborations: {str(e)}", file=sys.stderr, flush=True)
        print(f"Full traceback: {traceback.format_exc()}", file=sys.stderr, flush=True)
        return jsonify({
            'success': False,
            'error': 'Failed to fetch collaborations'
        }), 500

@bp.route('/<collab_id>/complete', methods=['POST'])
@require_auth

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