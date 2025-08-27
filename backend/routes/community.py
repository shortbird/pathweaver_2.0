from flask import Blueprint, request, jsonify
from database import get_supabase_client
from utils.auth.decorators import require_auth

bp = Blueprint('community', __name__)

@bp.route('/friends', methods=['GET'])
@require_auth
def get_friends(user_id):
    supabase = get_supabase_client()
    
    try:
        friendships = supabase.table('friendships').select('*, requester:users!requester_id(*), addressee:users!addressee_id(*)').or_(f'requester_id.eq.{user_id},addressee_id.eq.{user_id}').execute()
        
        friends = []
        pending_requests = []
        
        for friendship in friendships.data:
            if friendship['status'] == 'accepted':
                friend = friendship['addressee'] if friendship['requester_id'] == user_id else friendship['requester']
                friends.append(friend)
            elif friendship['status'] == 'pending' and friendship['addressee_id'] == user_id:
                pending_requests.append({
                    'friendship_id': friendship['id'],
                    'requester': friendship['requester']
                })
        
        return jsonify({
            'friends': friends,
            'pending_requests': pending_requests
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/friends/request', methods=['POST'])
@require_auth
def send_friend_request(user_id):
    data = request.json
    addressee_email = data.get('email')
    addressee_username = data.get('username')  # Support both for backward compatibility
    
    if not addressee_email and not addressee_username:
        return jsonify({'error': 'Email or username required'}), 400
    
    supabase = get_supabase_client()
    
    try:
        if addressee_email:
            # First get the user ID from auth.users table by email
            from database import get_supabase_admin_client
            admin_supabase = get_supabase_admin_client()
            auth_user = admin_supabase.auth.admin.list_users()
            
            addressee_id = None
            for user in auth_user:
                if user.email == addressee_email:
                    addressee_id = user.id
                    break
            
            if not addressee_id:
                return jsonify({'error': 'User not found'}), 404
                
            addressee = supabase.table('users').select('*').eq('id', addressee_id).single().execute()
        else:
            # Fallback to username for backward compatibility
            addressee = supabase.table('users').select('*').eq('username', addressee_username).single().execute()
        
        if not addressee.data:
            return jsonify({'error': 'User not found'}), 404
        
        if addressee.data['id'] == user_id:
            return jsonify({'error': 'Cannot send friend request to yourself'}), 400
        
        existing = supabase.table('friendships').select('*').or_(
            f"requester_id.eq.{user_id},addressee_id.eq.{addressee.data['id']}",
            f"requester_id.eq.{addressee.data['id']},addressee_id.eq.{user_id}"
        ).execute()
        
        if existing.data:
            return jsonify({'error': 'Friend request already exists'}), 400
        
        friendship = {
            'requester_id': user_id,
            'addressee_id': addressee.data['id'],
            'status': 'pending'
        }
        
        response = supabase.table('friendships').insert(friendship).execute()
        
        supabase.table('activity_log').insert({
            'user_id': user_id,
            'event_type': 'friend_request_sent',
            'event_details': {'addressee_id': addressee.data['id']}
        }).execute()
        
        return jsonify(response.data[0]), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/friends/accept/<friendship_id>', methods=['POST'])
@require_auth
def accept_friend_request(user_id, friendship_id):
    supabase = get_supabase_client()
    
    try:
        friendship = supabase.table('friendships').select('*').eq('id', friendship_id).single().execute()
        
        if not friendship.data:
            return jsonify({'error': 'Friend request not found'}), 404
        
        if friendship.data['addressee_id'] != user_id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        if friendship.data['status'] != 'pending':
            return jsonify({'error': 'Friend request already processed'}), 400
        
        response = supabase.table('friendships').update({
            'status': 'accepted'
        }).eq('id', friendship_id).execute()
        
        supabase.table('activity_log').insert({
            'user_id': user_id,
            'event_type': 'friend_request_accepted',
            'event_details': {'requester_id': friendship.data['requester_id']}
        }).execute()
        
        return jsonify(response.data[0]), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/friends/decline/<friendship_id>', methods=['DELETE'])
@require_auth
def decline_friend_request(user_id, friendship_id):
    supabase = get_supabase_client()
    
    try:
        friendship = supabase.table('friendships').select('*').eq('id', friendship_id).single().execute()
        
        if not friendship.data:
            return jsonify({'error': 'Friend request not found'}), 404
        
        if friendship.data['addressee_id'] != user_id and friendship.data['requester_id'] != user_id:
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
        user_quest = supabase.table('user_quests').select('*').eq('user_id', user_id).eq('quest_id', quest_id).eq('status', 'in_progress').single().execute()
        
        if not user_quest.data:
            return jsonify({'error': 'Quest not in progress'}), 400
        
        for friend_id in friend_ids:
            friendship = supabase.table('friendships').select('*').or_(
                f"requester_id.eq.{user_id},addressee_id.eq.{friend_id}",
                f"requester_id.eq.{friend_id},addressee_id.eq.{user_id}"
            ).eq('status', 'accepted').execute()
            
            if friendship.data:
                pass
        
        return jsonify({'message': f'Invited {len(friend_ids)} friends to quest'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400