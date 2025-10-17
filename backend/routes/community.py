from flask import Blueprint, request, jsonify
from database import get_supabase_client
from utils.auth.decorators import require_auth, require_paid_tier
import sys

bp = Blueprint('community', __name__)

@bp.route('/friends', methods=['GET'])
@require_auth
def get_friends(user_id):
    supabase = get_supabase_client()
    from database import get_supabase_admin_client
    admin_supabase = get_supabase_admin_client()

    try:
        print(f"[GET_FRIENDS] Fetching friends for user: {user_id}")

        # Use a single query with OR condition to reduce database connections
        try:
            friendships = supabase.table('friendships')\
                .select('*')\
                .or_(f'requester_id.eq.{user_id},addressee_id.eq.{user_id}')\
                .execute()

            all_friendships = friendships.data or []
            print(f"[GET_FRIENDS] Total friendships found: {len(all_friendships)}")

        except Exception as db_error:
            print(f"[GET_FRIENDS] Database error: {str(db_error)}")
            print(f"[GET_FRIENDS] Falling back to separate queries")

            # Fallback to separate queries if OR fails
            friendships_as_requester = supabase.table('friendships')\
                .select('*')\
                .eq('requester_id', user_id)\
                .execute()

            print(f"[GET_FRIENDS] Friendships as requester: {len(friendships_as_requester.data or [])} found")

            friendships_as_addressee = supabase.table('friendships')\
                .select('*')\
                .eq('addressee_id', user_id)\
                .execute()

            print(f"[GET_FRIENDS] Friendships as addressee: {len(friendships_as_addressee.data or [])} found")

            # Combine both results
            all_friendships = (friendships_as_requester.data or []) + (friendships_as_addressee.data or [])
        
        friends = []
        pending_requests = []
        sent_requests = []

        # Now fetch user data for each friendship
        for friendship in all_friendships:
            print(f"[GET_FRIENDS] Processing friendship: {friendship}")
            if friendship['status'] == 'accepted':
                # Determine which user is the friend
                friend_id = friendship['addressee_id'] if friendship['requester_id'] == user_id else friendship['requester_id']
                print(f"[GET_FRIENDS] Looking up friend with ID: {friend_id}")
                # Fetch friend's user data using admin client to bypass RLS
                friend_result = admin_supabase.table('users').select('*').eq('id', friend_id).execute()
                if friend_result.data and len(friend_result.data) > 0:
                    friends.append(friend_result.data[0])
            elif friendship['status'] == 'pending':
                if friendship['addressee_id'] == user_id:
                    # Incoming pending request - fetch requester's data
                    requester_result = admin_supabase.table('users').select('*').eq('id', friendship['requester_id']).execute()
                    if requester_result.data and len(requester_result.data) > 0:
                        pending_requests.append({
                            'friendship_id': friendship['id'],
                            'requester': requester_result.data[0],
                            'created_at': friendship.get('created_at'),
                            'updated_at': friendship.get('updated_at')
                        })
                elif friendship['requester_id'] == user_id:
                    # Outgoing pending request - fetch addressee's data
                    addressee_result = admin_supabase.table('users').select('*').eq('id', friendship['addressee_id']).execute()
                    if addressee_result.data and len(addressee_result.data) > 0:
                        sent_requests.append({
                            'friendship_id': friendship['id'],
                            'addressee': addressee_result.data[0],
                            'status': friendship['status'],
                            'created_at': friendship.get('created_at'),
                            'updated_at': friendship.get('updated_at')
                        })

        print(f"[GET_FRIENDS] Returning {len(friends)} friends, {len(pending_requests)} pending requests, and {len(sent_requests)} sent requests")

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
    data = request.json
    addressee_email = data.get('email')
    
    if not addressee_email:
        return jsonify({'error': 'Email required'}), 400
    
    supabase = get_supabase_client()
    
    try:
        if addressee_email:
            # Get the user ID from auth.users table by email
            from database import get_supabase_admin_client
            admin_supabase = get_supabase_admin_client()
            
            print(f"[FRIEND_REQUEST] Looking for user with email: {addressee_email}")
            
            addressee_id = None
            try:
                # list_users() returns a list of user objects
                auth_users = admin_supabase.auth.admin.list_users()
                print(f"[FRIEND_REQUEST] Found {len(auth_users) if auth_users else 0} total users")
                
                # Search through the users for matching email
                for auth_user in auth_users:
                    user_email = getattr(auth_user, 'email', None)
                    if user_email and user_email.lower() == addressee_email.lower():  # Case-insensitive comparison
                        addressee_id = auth_user.id
                        print(f"[FRIEND_REQUEST] Found user ID: {addressee_id} for email: {addressee_email}")
                        break
                
            except Exception as e:
                print(f"[FRIEND_REQUEST] Error listing auth users: {e}")
                return jsonify({'error': 'Failed to search users'}), 500
            
            if not addressee_id:
                print(f"[FRIEND_REQUEST] No user found with email: {addressee_email}")
                return jsonify({'error': 'User not found'}), 404
                
            # Now get the user data from the users table (use admin client to bypass RLS)
            addressee_result = admin_supabase.table('users').select('*').eq('id', addressee_id).execute()
            print(f"[FRIEND_REQUEST] User query result: {addressee_result.data}")
            
            # If user doesn't exist in users table, create a basic entry
            if not addressee_result.data:
                print(f"[FRIEND_REQUEST] User not in users table, creating entry")
                
                # Get the auth user details to create the users table entry
                try:
                    auth_user_details = None
                    for auth_user in auth_users:
                        if auth_user.id == addressee_id:
                            auth_user_details = auth_user
                            break
                    
                    if auth_user_details:
                        # Create a basic user entry
                        new_user = {
                            'id': addressee_id,
                            'first_name': 'User',  # Default values
                            'last_name': 'Account',
                            'role': 'student'
                        }
                        
                        print(f"[FRIEND_REQUEST] Creating user entry: {new_user}")
                        # Use admin client to create user entry (bypasses RLS)
                        create_result = admin_supabase.table('users').insert(new_user).execute()
                        
                        if create_result.data:
                            addressee = {'data': create_result.data[0]}
                        else:
                            print(f"[FRIEND_REQUEST] Failed to create user entry")
                            addressee = {'data': None}
                    else:
                        addressee = {'data': None}
                        
                except Exception as e:
                    print(f"[FRIEND_REQUEST] Error creating user entry: {e}")
                    addressee = {'data': None}
            else:
                addressee = {'data': addressee_result.data[0]}
                
        
        print(f"[FRIEND_REQUEST] Addressee data: {addressee}")
        
        if not addressee['data']:
            print(f"[FRIEND_REQUEST] User not found and could not be created")
            return jsonify({'error': 'User not found. The user may need to complete their profile first.'}), 404
        
        if addressee['data']['id'] == user_id:
            return jsonify({'error': 'Cannot send friend request to yourself'}), 400
        
        # Check if friendship already exists (in either direction)
        # Need to check both directions of the friendship
        print(f"[FRIEND_REQUEST] Checking for existing friendship between {user_id} and {addressee['data']['id']}")
        
        existing_query1 = supabase.table('friendships').select('*')\
            .eq('requester_id', user_id)\
            .eq('addressee_id', addressee['data']['id'])\
            .execute()
        
        existing_query2 = supabase.table('friendships').select('*')\
            .eq('requester_id', addressee['data']['id'])\
            .eq('addressee_id', user_id)\
            .execute()
        
        existing = existing_query1.data or existing_query2.data
        
        if existing:
            print(f"[FRIEND_REQUEST] Existing friendship found: {existing}")
            return jsonify({'error': 'Friend request already exists'}), 400
        
        friendship = {
            'requester_id': user_id,
            'addressee_id': addressee['data']['id'],
            'status': 'pending'
        }
        
        print(f"[FRIEND_REQUEST] Creating friendship: {friendship}")
        
        response = supabase.table('friendships').insert(friendship).execute()
        
        if not response.data:
            print(f"[FRIEND_REQUEST] Failed to create friendship")
            return jsonify({'error': 'Failed to create friend request'}), 500
        
        print(f"[FRIEND_REQUEST] Friendship created: {response.data[0]}")
        
        # Try to log activity but don't fail if it doesn't work
        try:
            supabase.table('activity_log').insert({
                'user_id': user_id,
                'event_type': 'friend_request_sent',
                'event_details': {'addressee_id': addressee['data']['id']}
            }).execute()
        except Exception as log_error:
            print(f"[FRIEND_REQUEST] Failed to log activity: {log_error}")
        
        return jsonify(response.data[0]), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/friends/accept/<friendship_id>', methods=['POST'])
@require_auth
def accept_friend_request(user_id, friendship_id):
    supabase = get_supabase_client()
    from database import get_supabase_admin_client
    admin_supabase = get_supabase_admin_client()

    try:
        print(f"[ACCEPT_FRIEND] User {user_id} attempting to accept friendship {friendship_id}")

        friendship_result = supabase.table('friendships').select('*').eq('id', friendship_id).execute()
        friendship = {'data': friendship_result.data[0] if friendship_result.data else None}

        print(f"[ACCEPT_FRIEND] Friendship data: {friendship['data']}")

        if not friendship['data']:
            print(f"[ACCEPT_FRIEND] Friend request not found for ID: {friendship_id}")
            return jsonify({'error': 'Friend request not found'}), 404

        if friendship['data']['addressee_id'] != user_id:
            print(f"[ACCEPT_FRIEND] Unauthorized: addressee_id {friendship['data']['addressee_id']} != user_id {user_id}")
            return jsonify({'error': 'Unauthorized'}), 403

        if friendship['data']['status'] != 'pending':
            print(f"[ACCEPT_FRIEND] Status not pending: {friendship['data']['status']}")
            return jsonify({'error': 'Friend request already processed'}), 400

        # Update friendship status using admin client to bypass RLS
        print(f"[ACCEPT_FRIEND] Updating friendship {friendship_id} to accepted status")

        # Ensure friendship_id is an integer (Supabase expects correct type)
        try:
            friendship_id_int = int(friendship_id)
        except ValueError:
            print(f"[ACCEPT_FRIEND] Invalid friendship ID: {friendship_id}")
            return jsonify({'error': 'Invalid friendship ID'}), 400

        # Use a database function to bypass any triggers that might be causing issues
        try:
            # First, try using an RPC call to a custom database function
            response = admin_supabase.rpc('update_friendship_status', {
                'friendship_id': friendship_id_int,
                'new_status': 'accepted'
            }).execute()

            print(f"[ACCEPT_FRIEND] RPC Update response: {response}")

        except Exception as rpc_error:
            print(f"[ACCEPT_FRIEND] RPC failed: {str(rpc_error)}, trying direct SQL")

            # Fallback: Use raw SQL via PostgREST
            try:
                # Execute a raw SQL update using the PostgREST interface
                import requests
                import os

                supabase_url = os.getenv('SUPABASE_URL')
                supabase_key = os.getenv('SUPABASE_SERVICE_KEY')

                headers = {
                    'apikey': supabase_key,
                    'Authorization': f'Bearer {supabase_key}',
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                }

                # Use PostgREST to execute the update
                update_url = f"{supabase_url}/rest/v1/friendships?id=eq.{friendship_id_int}"
                update_data = {'status': 'accepted'}

                response_raw = requests.patch(update_url, json=update_data, headers=headers)

                if response_raw.status_code == 200:
                    response_data = response_raw.json()
                    # Create a mock response object that matches Supabase format
                    response = type('MockResponse', (), {
                        'data': response_data if response_data else [{'id': friendship_id_int, 'status': 'accepted'}],
                        'error': None
                    })()
                    print(f"[ACCEPT_FRIEND] Direct SQL Update successful: {response.data}")
                else:
                    print(f"[ACCEPT_FRIEND] Direct SQL failed: {response_raw.status_code} - {response_raw.text}")
                    raise Exception(f"HTTP {response_raw.status_code}: {response_raw.text}")

            except Exception as sql_error:
                print(f"[ACCEPT_FRIEND] All update methods failed: {str(sql_error)}")
                raise sql_error

        print(f"[ACCEPT_FRIEND] Update response: {response}")

        if not response.data:
            print(f"[ACCEPT_FRIEND] No data returned from update operation")
            return jsonify({'error': 'Failed to update friendship status'}), 500

        # Log activity (non-critical - don't fail if this fails)
        try:
            supabase.table('activity_log').insert({
                'user_id': user_id,
                'event_type': 'friend_request_accepted',
                'event_details': {'requester_id': friendship['data']['requester_id']}
            }).execute()
        except Exception as log_error:
            print(f"Warning: Failed to log activity: {log_error}")

        return jsonify(response.data[0]), 200

    except Exception as e:
        print(f"[ACCEPT_FRIEND] Error: {str(e)}")
        print(f"[ACCEPT_FRIEND] Error type: {type(e).__name__}")

        # Check if it's a Supabase error with more details
        if hasattr(e, 'details'):
            print(f"[ACCEPT_FRIEND] Error details: {e.details}")
        if hasattr(e, 'code'):
            print(f"[ACCEPT_FRIEND] Error code: {e.code}")
        if hasattr(e, 'message'):
            print(f"[ACCEPT_FRIEND] Error message: {e.message}")

        return jsonify({'error': f'Failed to accept friend request: {str(e)}'}), 500

@bp.route('/friends/decline/<friendship_id>', methods=['DELETE'])
@require_auth
@require_paid_tier
def decline_friend_request(user_id, friendship_id):
    supabase = get_supabase_client()

    try:
        friendship_result = supabase.table('friendships').select('*').eq('id', friendship_id).execute()
        friendship = {'data': friendship_result.data[0] if friendship_result.data else None}

        if not friendship['data']:
            return jsonify({'error': 'Friend request not found'}), 404

        if friendship['data']['addressee_id'] != user_id and friendship['data']['requester_id'] != user_id:
            return jsonify({'error': 'Unauthorized'}), 403

        supabase.table('friendships').delete().eq('id', friendship_id).execute()

        return jsonify({'message': 'Friend request declined'}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/friends/cancel/<friendship_id>', methods=['DELETE'])
@require_auth
@require_paid_tier
def cancel_friend_request(user_id, friendship_id):
    supabase = get_supabase_client()

    try:
        print(f"[CANCEL_FRIEND] User {user_id} attempting to cancel friendship {friendship_id}")

        friendship_result = supabase.table('friendships').select('*').eq('id', friendship_id).execute()
        friendship = {'data': friendship_result.data[0] if friendship_result.data else None}

        if not friendship['data']:
            print(f"[CANCEL_FRIEND] Friend request not found for ID: {friendship_id}")
            return jsonify({'error': 'Friend request not found'}), 404

        # Only the requester can cancel their own request
        if friendship['data']['requester_id'] != user_id:
            print(f"[CANCEL_FRIEND] Unauthorized: requester_id {friendship['data']['requester_id']} != user_id {user_id}")
            return jsonify({'error': 'You can only cancel your own friend requests'}), 403

        # Only pending requests can be cancelled
        if friendship['data']['status'] != 'pending':
            print(f"[CANCEL_FRIEND] Status not pending: {friendship['data']['status']}")
            return jsonify({'error': 'Can only cancel pending friend requests'}), 400

        # Delete the friendship record
        delete_result = supabase.table('friendships').delete().eq('id', friendship_id).execute()

        print(f"[CANCEL_FRIEND] Delete result: {delete_result}")

        # Try to log activity but don't fail if it doesn't work
        try:
            supabase.table('activity_log').insert({
                'user_id': user_id,
                'event_type': 'friend_request_cancelled',
                'event_details': {'addressee_id': friendship['data']['addressee_id']}
            }).execute()
        except Exception as log_error:
            print(f"[CANCEL_FRIEND] Failed to log activity: {log_error}")

        return jsonify({'message': 'Friend request cancelled successfully'}), 200

    except Exception as e:
        print(f"[CANCEL_FRIEND] Error: {str(e)}")
        return jsonify({'error': str(e)}), 400

@bp.route('/quests/<quest_id>/invite', methods=['POST'])
@require_auth
@require_paid_tier
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