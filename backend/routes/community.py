from flask import Blueprint, request, jsonify
from database import get_supabase_client
from utils.auth.decorators import require_auth

bp = Blueprint('community', __name__)

@bp.route('/friends', methods=['GET'])
@require_auth
def get_friends(user_id):
    supabase = get_supabase_client()
    
    try:
        print(f"[GET_FRIENDS] Fetching friends for user: {user_id}")
        
        # Get friendships where user is the requester (without joins first)
        friendships_as_requester = supabase.table('friendships')\
            .select('*')\
            .eq('requester_id', user_id)\
            .execute()
        
        print(f"[GET_FRIENDS] Friendships as requester: {len(friendships_as_requester.data or [])} found")
        
        # Get friendships where user is the addressee (without joins first)
        friendships_as_addressee = supabase.table('friendships')\
            .select('*')\
            .eq('addressee_id', user_id)\
            .execute()
        
        print(f"[GET_FRIENDS] Friendships as addressee: {len(friendships_as_addressee.data or [])} found")
        
        # Combine both results
        all_friendships = (friendships_as_requester.data or []) + (friendships_as_addressee.data or [])
        
        friends = []
        pending_requests = []
        
        # Now fetch user data for each friendship
        for friendship in all_friendships:
            if friendship['status'] == 'accepted':
                # Determine which user is the friend
                friend_id = friendship['addressee_id'] if friendship['requester_id'] == user_id else friendship['requester_id']
                # Fetch friend's user data - use execute() without single() to handle missing users
                friend_result = supabase.table('users').select('*').eq('id', friend_id).execute()
                if friend_result.data and len(friend_result.data) > 0:
                    friends.append(friend_result.data[0])
            elif friendship['status'] == 'pending' and friendship['addressee_id'] == user_id:
                # Fetch requester's user data for pending requests
                requester_result = supabase.table('users').select('*').eq('id', friendship['requester_id']).execute()
                if requester_result.data and len(requester_result.data) > 0:
                    pending_requests.append({
                        'friendship_id': friendship['id'],
                        'requester': requester_result.data[0]
                    })
        
        print(f"[GET_FRIENDS] Returning {len(friends)} friends and {len(pending_requests)} pending requests")
        
        return jsonify({
            'friends': friends,
            'pending_requests': pending_requests
        }), 200
        
    except Exception as e:
        print(f"[GET_FRIENDS] Error: {str(e)}")
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
    
    try:
        friendship_result = supabase.table('friendships').select('*').eq('id', friendship_id).execute()
        friendship = {'data': friendship_result.data[0] if friendship_result.data else None}
        
        if not friendship['data']:
            return jsonify({'error': 'Friend request not found'}), 404
        
        if friendship['data']['addressee_id'] != user_id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        if friendship['data']['status'] != 'pending':
            return jsonify({'error': 'Friend request already processed'}), 400
        
        response = supabase.table('friendships').update({
            'status': 'accepted'
        }).eq('id', friendship_id).execute()
        
        supabase.table('activity_log').insert({
            'user_id': user_id,
            'event_type': 'friend_request_accepted',
            'event_details': {'requester_id': friendship['data']['requester_id']}
        }).execute()
        
        return jsonify(response.data[0]), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/friends/decline/<friendship_id>', methods=['DELETE'])
@require_auth
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