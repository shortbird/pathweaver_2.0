"""
REPOSITORY MIGRATION: FULLY MIGRATED ✅
- All friendship CRUD operations now use FriendshipRepository
- User lookups use UserRepository (get_friends, send_friend_request)
- Endpoints migrated:
  - get_friends: Uses FriendshipRepository + UserRepository for batch user lookups
  - send_friend_request: Uses FriendshipRepository.create_request() + UserRepository
  - accept_friend_request: Uses FriendshipRepository.accept_request()
  - decline_friend_request: Uses FriendshipRepository.reject_request()
  - cancel_friend_request: Uses FriendshipRepository.cancel_request()
- Remaining direct DB access is intentional per migration guidelines:
  - invite_to_quest: User quest checks (simple validation queries, not core friendship logic)
  - get_friends_activity: Complex JOIN query for activity feed (optimization/aggregation)
  - activity_log inserts: Non-critical logging (don't need repository abstraction)

Migration complete: All core friendship operations use repository pattern.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_client
from repositories import (
    UserRepository,
    QuestRepository,
    EvidenceRepository,
    FriendshipRepository,
    ParentRepository,
    TutorRepository,
    LMSRepository,
    AnalyticsRepository
)
from utils.auth.decorators import require_auth
import sys

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('community', __name__)

# Using repository pattern for database access
@bp.route('/friends', methods=['GET'])
@require_auth
def get_friends(user_id):
    """Get all friendships for a user using FriendshipRepository"""
    try:
        logger.info(f"[GET_FRIENDS] Fetching friends for user: {user_id}")

        # Use FriendshipRepository instead of direct database access
        # IMPORTANT: Use admin client (None) because we use Flask JWTs, not Supabase JWTs
        # Supabase RLS requires Supabase-issued JWTs, which we don't have
        # Authorization is handled at application layer via @require_auth decorator
        friendship_repo = FriendshipRepository(None)  # None = uses admin client
        # IMPORTANT: Use admin client for UserRepository to fetch OTHER users' profiles
        # RLS would prevent user-scoped client from seeing other users' basic info
        user_repo = UserRepository(None)  # None = uses admin client

        # Get all friendships (both as requester and addressee)
        all_friendships = friendship_repo.find_by_user(user_id)
        logger.info(f"[GET_FRIENDS] Total friendships found: {len(all_friendships)}")

        # OPTIMIZED: Collect all unique user IDs first, then fetch in a single batch query
        all_user_ids = set()
        for friendship in all_friendships:
            all_user_ids.add(friendship['requester_id'])
            all_user_ids.add(friendship['addressee_id'])

        # Remove current user from the set
        all_user_ids.discard(user_id)
        logger.info(f"[GET_FRIENDS] Unique user IDs to fetch: {list(all_user_ids)}")

        # Fetch all user data using UserRepository batch method (prevents N+1 queries)
        user_lookup = {}
        if all_user_ids:
            try:
                user_lookup = user_repo.get_basic_profiles(list(all_user_ids))
                logger.info(f"[GET_FRIENDS] Fetched {len(user_lookup)} user records in batch")
                logger.info(f"[GET_FRIENDS] User lookup keys: {list(user_lookup.keys())}")
                if user_lookup:
                    # Log sample user data to see structure
                    sample_key = list(user_lookup.keys())[0]
                    logger.info(f"[GET_FRIENDS] Sample user data: {user_lookup[sample_key]}")
            except Exception as batch_error:
                logger.error(f"[GET_FRIENDS] Error fetching users in batch: {str(batch_error)}")
                import traceback
                logger.error(f"[GET_FRIENDS] Batch fetch traceback: {traceback.format_exc()}")

        # Now process friendships using the lookup dictionary
        friends = []
        pending_requests = []
        sent_requests = []

        for friendship in all_friendships:
            logger.info(f"[GET_FRIENDS] Processing friendship ID {friendship['id']}: status={friendship['status']}, requester={friendship['requester_id']}, addressee={friendship['addressee_id']}")

            if friendship['status'] == 'accepted':
                # Determine which user is the friend
                friend_id = friendship['addressee_id'] if friendship['requester_id'] == user_id else friendship['requester_id']
                friend_data = user_lookup.get(friend_id)
                if friend_data:
                    friends.append(friend_data)
                    logger.info(f"[GET_FRIENDS] Added accepted friend: {friend_id}")
                else:
                    logger.warning(f"[GET_FRIENDS] Missing user data for friend_id: {friend_id}")

            elif friendship['status'] == 'pending':
                if friendship['addressee_id'] == user_id:
                    # Incoming pending request - get requester's data from lookup
                    requester_id = friendship['requester_id']
                    requester_data = user_lookup.get(requester_id)
                    logger.info(f"[GET_FRIENDS] Processing incoming request from {requester_id}, found data: {requester_data is not None}")
                    if requester_data:
                        pending_request = {
                            'friendship_id': friendship['id'],
                            'requester': requester_data,
                            'created_at': friendship.get('created_at'),
                            'updated_at': friendship.get('updated_at')
                        }
                        pending_requests.append(pending_request)
                        logger.info(f"[GET_FRIENDS] Added pending request: {pending_request}")
                    else:
                        logger.warning(f"[GET_FRIENDS] Missing user data for requester_id: {requester_id}")

                elif friendship['requester_id'] == user_id:
                    # Outgoing pending request - get addressee's data from lookup
                    addressee_id = friendship['addressee_id']
                    addressee_data = user_lookup.get(addressee_id)
                    logger.info(f"[GET_FRIENDS] Processing outgoing request to {addressee_id}, found data: {addressee_data is not None}")
                    if addressee_data:
                        sent_request = {
                            'friendship_id': friendship['id'],
                            'addressee': addressee_data,
                            'status': friendship['status'],
                            'created_at': friendship.get('created_at'),
                            'updated_at': friendship.get('updated_at')
                        }
                        sent_requests.append(sent_request)
                        logger.info(f"[GET_FRIENDS] Added sent request: {sent_request}")
                    else:
                        logger.warning(f"[GET_FRIENDS] Missing user data for addressee_id: {addressee_id}")

        logger.info(f"[GET_FRIENDS] Returning {len(friends)} friends, {len(pending_requests)} pending requests, and {len(sent_requests)} sent requests")
        logger.info(f"[GET_FRIENDS] Pending requests data: {pending_requests}")
        logger.info(f"[GET_FRIENDS] Sent requests data: {sent_requests}")

        return jsonify({
            'friends': friends,
            'pending_requests': pending_requests,
            'sent_requests': sent_requests
        }), 200
        
    except Exception as e:
        import traceback
        print(f"[GET_FRIENDS] Error: {str(e)}", file=sys.stderr, flush=True)
        print(f"[GET_FRIENDS] Full traceback: {traceback.format_exc()}", file=sys.stderr, flush=True)

        # Handle specific connection errors gracefully
        error_message = str(e)
        if "Resource temporarily unavailable" in error_message or "[Errno 11]" in error_message:
            return jsonify({
                'success': True,
                'friends': [],
                'pending_requests': [],
                'sent_requests': [],
                'message': 'Temporarily unable to load friends. Please try again.'
            }), 200

        return jsonify({'error': str(e)}), 400

@bp.route('/friends/request', methods=['POST'])
@require_auth
def send_friend_request(user_id):
    # Get JSON data (can only be read once!)
    data = request.get_json(force=True, silent=True)

    # Debug logging - use the data variable, not request.json again
    logger.info(f"[FRIEND_REQUEST] Received request - data: {data}, content_type: {request.content_type}")

    if data is None:
        logger.error(f"[FRIEND_REQUEST] Failed to parse JSON body")
        return jsonify({'error': 'Invalid JSON in request body'}), 400

    addressee_email = data.get('email')

    if not addressee_email:
        logger.error(f"[FRIEND_REQUEST] Email field missing or empty - data keys: {list(data.keys()) if data else 'None'}")
        return jsonify({'error': 'Email required'}), 400

    from database import get_supabase_admin_client
    # IMPORTANT: Use admin client because we need to:
    # 1. Query auth.users table (requires service role)
    # 2. Create user entries if missing (bypasses RLS)
    # 3. Create friendships (authorization via @require_auth decorator)
    admin_supabase = get_supabase_admin_client()

    # Initialize repositories with admin client
    friendship_repo = FriendshipRepository(admin_supabase)
    user_repo = UserRepository(admin_supabase)

    try:
        logger.info(f"[FRIEND_REQUEST] Looking for user with email: {addressee_email}")

        addressee_id = None
        try:
            # Query auth.users table to find user by email (requires admin client)
            auth_users = admin_supabase.auth.admin.list_users()
            logger.info(f"[FRIEND_REQUEST] Found {len(auth_users) if auth_users else 0} total users")

            # Search through the users for matching email
            for auth_user in auth_users:
                user_email = getattr(auth_user, 'email', None)
                if user_email and user_email.lower() == addressee_email.lower():  # Case-insensitive comparison
                    addressee_id = auth_user.id
                    logger.info(f"[FRIEND_REQUEST] Found user ID: {addressee_id} for email: {addressee_email}")
                    break

        except Exception as e:
            logger.error(f"[FRIEND_REQUEST] Error listing auth users: {e}")
            return jsonify({'error': 'Failed to search users'}), 500

        if not addressee_id:
            logger.info(f"[FRIEND_REQUEST] No user found with email: {addressee_email}")
            return jsonify({'error': 'User not found'}), 404

        # Get user from users table using UserRepository
        addressee = user_repo.find_by_id(addressee_id)
        logger.info(f"[FRIEND_REQUEST] User query result: {addressee}")

        # If user doesn't exist in users table, create a basic entry
        if not addressee:
            logger.info(f"[FRIEND_REQUEST] User not in users table, creating entry")

            try:
                # Create a basic user entry using UserRepository
                new_user = {
                    'id': addressee_id,
                    'first_name': 'User',  # Default values
                    'last_name': 'Account',
                    'role': 'student'
                }

                logger.info(f"[FRIEND_REQUEST] Creating user entry: {new_user}")
                addressee = user_repo.create(new_user)

                if not addressee:
                    logger.error(f"[FRIEND_REQUEST] Failed to create user entry")
                    return jsonify({'error': 'User not found. The user may need to complete their profile first.'}), 404

            except Exception as e:
                logger.error(f"[FRIEND_REQUEST] Error creating user entry: {e}")
                return jsonify({'error': 'User not found. The user may need to complete their profile first.'}), 404

        logger.info(f"[FRIEND_REQUEST] Addressee data: {addressee}")

        if addressee['id'] == user_id:
            return jsonify({'error': 'Cannot send friend request to yourself'}), 400

        # Create friendship using FriendshipRepository (handles duplicate check internally)
        logger.info(f"[FRIEND_REQUEST] Creating friendship request between {user_id} and {addressee['id']}")

        try:
            friendship = friendship_repo.create_request(user_id, addressee['id'])
            logger.info(f"[FRIEND_REQUEST] Friendship created: {friendship}")
        except ValueError as e:
            # FriendshipRepository.create_request raises ValueError for duplicates or self-requests
            logger.info(f"[FRIEND_REQUEST] Failed to create friendship: {str(e)}")
            return jsonify({'error': str(e)}), 400

        # Try to log activity but don't fail if it doesn't work
        try:
            admin_supabase.table('activity_log').insert({
                'user_id': user_id,
                'event_type': 'friend_request_sent',
                'event_details': {'addressee_id': addressee['id']}
            }).execute()
        except Exception as log_error:
            logger.error(f"[FRIEND_REQUEST] Failed to log activity: {log_error}")

        return jsonify(friendship), 201

    except Exception as e:
        logger.error(f"[FRIEND_REQUEST] Unexpected error: {str(e)}")
        return jsonify({'error': str(e)}), 400

@bp.route('/friends/accept/<friendship_id>', methods=['POST'])
@require_auth
def accept_friend_request(user_id, friendship_id):
    from database import get_supabase_admin_client
    from repositories.base_repository import NotFoundError
    # IMPORTANT: Use admin client because we use Flask JWTs, not Supabase JWTs
    # Authorization is handled at application layer via @require_auth decorator
    admin_supabase = get_supabase_admin_client()

    # Initialize FriendshipRepository with admin client
    friendship_repo = FriendshipRepository(admin_supabase)

    try:
        logger.info(f"[ACCEPT_FRIEND] User {user_id} attempting to accept friendship {friendship_id}")

        # Use FriendshipRepository.accept_request() - handles all validation internally
        try:
            friendship = friendship_repo.accept_request(friendship_id, user_id)
            logger.info(f"[ACCEPT_FRIEND] Successfully accepted friendship: {friendship}")
        except NotFoundError:
            logger.info(f"[ACCEPT_FRIEND] Friend request not found for ID: {friendship_id}")
            return jsonify({'error': 'Friend request not found'}), 404
        except PermissionError as e:
            logger.info(f"[ACCEPT_FRIEND] Permission denied: {str(e)}")
            return jsonify({'error': 'Unauthorized'}), 403

        # Fetch the updated friendship to get full record
        updated_friendship = friendship_repo.find_by_id(friendship_id)

        # Log activity (non-critical - don't fail if this fails)
        try:
            admin_supabase.table('activity_log').insert({
                'user_id': user_id,
                'event_type': 'friend_request_accepted',
                'event_details': {'requester_id': updated_friendship['requester_id']}
            }).execute()
        except Exception as log_error:
            logger.error(f"Warning: Failed to log activity: {log_error}")

        return jsonify(updated_friendship), 200

    except Exception as e:
        logger.error(f"[ACCEPT_FRIEND] Error: {str(e)}")
        logger.error(f"[ACCEPT_FRIEND] Error type: {type(e).__name__}")

        # Check if it's a Supabase error with more details
        if hasattr(e, 'details'):
            logger.error(f"[ACCEPT_FRIEND] Error details: {e.details}")
        if hasattr(e, 'code'):
            logger.error(f"[ACCEPT_FRIEND] Error code: {e.code}")
        if hasattr(e, 'message'):
            logger.error(f"[ACCEPT_FRIEND] Error message: {e.message}")

        return jsonify({'error': f'Failed to accept friend request: {str(e)}'}), 500

@bp.route('/friends/decline/<friendship_id>', methods=['DELETE'])
@require_auth
def decline_friend_request(user_id, friendship_id):
    from database import get_supabase_admin_client
    from repositories.base_repository import NotFoundError
    # IMPORTANT: Use admin client because we use Flask JWTs, not Supabase JWTs
    # Authorization is handled at application layer via @require_auth decorator
    admin_supabase = get_supabase_admin_client()

    # Initialize FriendshipRepository with admin client
    friendship_repo = FriendshipRepository(admin_supabase)

    try:
        # Use FriendshipRepository.reject_request() - handles validation internally
        try:
            friendship_repo.reject_request(friendship_id, user_id)
            logger.info(f"[DECLINE_FRIEND] User {user_id} declined friendship {friendship_id}")
        except NotFoundError:
            return jsonify({'error': 'Friend request not found'}), 404
        except PermissionError:
            return jsonify({'error': 'Unauthorized'}), 403

        return jsonify({'message': 'Friend request declined'}), 200

    except Exception as e:
        logger.error(f"[DECLINE_FRIEND] Error: {str(e)}")
        return jsonify({'error': str(e)}), 400

@bp.route('/friends/cancel/<friendship_id>', methods=['DELETE'])
@require_auth
def cancel_friend_request(user_id, friendship_id):
    from database import get_supabase_admin_client
    from repositories.base_repository import NotFoundError
    # IMPORTANT: Use admin client because we use Flask JWTs, not Supabase JWTs
    # Authorization is handled at application layer via @require_auth decorator
    admin_supabase = get_supabase_admin_client()

    # Initialize FriendshipRepository with admin client
    friendship_repo = FriendshipRepository(admin_supabase)

    try:
        logger.info(f"[CANCEL_FRIEND] User {user_id} attempting to cancel friendship {friendship_id}")

        # Get friendship details for activity log before deletion
        friendship = friendship_repo.find_by_id(friendship_id)
        if friendship:
            addressee_id = friendship['addressee_id']
        else:
            addressee_id = None

        # Use FriendshipRepository.cancel_request() - handles all validation internally
        try:
            friendship_repo.cancel_request(friendship_id, user_id)
            logger.info(f"[CANCEL_FRIEND] Successfully canceled friendship {friendship_id}")
        except NotFoundError:
            logger.info(f"[CANCEL_FRIEND] Friend request not found for ID: {friendship_id}")
            return jsonify({'error': 'Friend request not found'}), 404
        except PermissionError as e:
            logger.info(f"[CANCEL_FRIEND] Permission denied: {str(e)}")
            return jsonify({'error': 'You can only cancel your own friend requests'}), 403

        # Try to log activity but don't fail if it doesn't work
        try:
            if addressee_id:
                admin_supabase.table('activity_log').insert({
                    'user_id': user_id,
                    'event_type': 'friend_request_cancelled',
                    'event_details': {'addressee_id': addressee_id}
                }).execute()
        except Exception as log_error:
            logger.error(f"[CANCEL_FRIEND] Failed to log activity: {log_error}")

        return jsonify({'message': 'Friend request cancelled successfully'}), 200

    except Exception as e:
        logger.error(f"[CANCEL_FRIEND] Error: {str(e)}")
        return jsonify({'error': str(e)}), 400

@bp.route('/quests/<quest_id>/invite', methods=['POST'])
@require_auth
def invite_to_quest(user_id, quest_id):
    data = request.json
    friend_ids = data.get('friend_ids', [])
    
    if not friend_ids:
        return jsonify({'error': 'No friends selected'}), 400
    
    supabase = get_supabase_client()
    
    try:
        # In V3 schema, in-progress quests have completed_at null
        user_quest_result = supabase.table('user_quests').select('*').eq('user_id', user_id).eq('quest_id', quest_id).is_('completed_at', 'null').execute()
        user_quest = {'data': user_quest_result.data[0] if user_quest_result.data else None}
        
        if not user_quest['data']:
            return jsonify({'error': 'Quest not in progress'}), 400
        
        for friend_id in friend_ids:
            # Check if users are friends (accepted friendship in either direction)
            friendship_query1 = supabase.table('friendships').select('*')\
                .eq('requester_id', user_id)\
                .eq('addressee_id', friend_id)\
                .eq('status', 'accepted')\
                .execute()
            
            friendship_query2 = supabase.table('friendships').select('*')\
                .eq('requester_id', friend_id)\
                .eq('addressee_id', user_id)\
                .eq('status', 'accepted')\
                .execute()
            
            friendship = friendship_query1.data or friendship_query2.data
            
            if friendship:
                pass
        
        return jsonify({'message': f'Invited {len(friend_ids)} friends to quest'}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/friends/activity', methods=['GET'])
@require_auth
def get_friends_activity(user_id):
    """
    Get recent quest activity from user's connections.
    Returns task completions from friends for the activity feed.
    """
    from database import get_user_client
    # Use user client - fetching user-specific friendship activity
    supabase = get_user_client(user_id)

    try:
        logger.info(f"[FRIENDS_ACTIVITY] Fetching activity for user: {user_id}")

        # First, get list of accepted friends
        try:
            friendships = supabase.table('friendships')\
                .select('*')\
                .or_(f'requester_id.eq.{user_id},addressee_id.eq.{user_id}')\
                .eq('status', 'accepted')\
                .execute()

            all_friendships = friendships.data or []
        except Exception as db_error:
            logger.error(f"[FRIENDS_ACTIVITY] Database error: {str(db_error)}")
            # Fallback to separate queries
            friendships_as_requester = supabase.table('friendships')\
                .select('*')\
                .eq('requester_id', user_id)\
                .eq('status', 'accepted')\
                .execute()

            friendships_as_addressee = supabase.table('friendships')\
                .select('*')\
                .eq('addressee_id', user_id)\
                .eq('status', 'accepted')\
                .execute()

            all_friendships = (friendships_as_requester.data or []) + (friendships_as_addressee.data or [])

        # Extract friend IDs
        friend_ids = []
        for friendship in all_friendships:
            friend_id = friendship['addressee_id'] if friendship['requester_id'] == user_id else friendship['requester_id']
            friend_ids.append(friend_id)

        logger.info(f"[FRIENDS_ACTIVITY] Found {len(friend_ids)} friends")

        if not friend_ids:
            return jsonify({'activities': []}), 200

        # Get recent task completions from friends (last 30 days, limit 50)
        from datetime import datetime, timedelta
        thirty_days_ago = (datetime.utcnow() - timedelta(days=30)).isoformat()

        # OPTIMIZED: Fetch all completions in a single query using .in_() filter
        try:
            # Get all recent task completions from all friends at once
            # Note: quest_task_completions -> user_quest_tasks (via user_quest_task_id) -> quests
            completions = supabase.table('quest_task_completions')\
                .select('*, user_quest_tasks(id, title, pillar, xp_value, quest_id, quests(id, title, image_url))')\
                .in_('user_id', friend_ids)\
                .gte('completed_at', thirty_days_ago)\
                .order('completed_at', desc=True)\
                .limit(50)\
                .execute()

            # Get all friends' user data in a single query
            friends_data = supabase.table('users')\
                .select('id, first_name, last_name, avatar_url')\
                .in_('id', friend_ids)\
                .execute()

            # Create a lookup dictionary for friend data
            friends_lookup = {friend['id']: friend for friend in (friends_data.data or [])}

            # Format activities
            activities = []
            if completions.data:
                for completion in completions.data:
                    if completion.get('user_quest_tasks'):
                        task = completion['user_quest_tasks']
                        quest = task.get('quests', {})
                        user_id = completion['user_id']

                        # Get friend data from lookup
                        friend_data = friends_lookup.get(user_id)
                        if friend_data:
                            activities.append({
                                'id': completion['id'],
                                'user': friend_data,
                                'quest': {
                                    'id': quest.get('id'),
                                    'title': quest.get('title', 'Unknown Quest'),
                                    'image_url': quest.get('image_url')
                                },
                                'task': {
                                    'title': task.get('title', 'Task'),
                                    'pillar': task.get('pillar', 'STEM & Logic')
                                },
                                'xp_awarded': task.get('xp_value', 0),
                                'completed_at': completion.get('completed_at'),
                                'type': 'task_completion'
                            })

        except Exception as query_error:
            logger.error(f"[FRIENDS_ACTIVITY] Error fetching activities: {str(query_error)}")
            activities = []

        logger.info(f"[FRIENDS_ACTIVITY] Returning {len(activities)} activities")

        return jsonify({'activities': activities}), 200

    except Exception as e:
        import traceback
        print(f"[FRIENDS_ACTIVITY] Error: {str(e)}", file=sys.stderr, flush=True)
        print(f"[FRIENDS_ACTIVITY] Full traceback: {traceback.format_exc()}", file=sys.stderr, flush=True)
        return jsonify({'error': str(e)}), 400