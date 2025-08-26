from flask import Blueprint, request, jsonify
from database import get_supabase_client
from utils.auth.decorators import require_auth
from datetime import datetime

bp = Blueprint('learning_log', __name__)

@bp.route('/quests/<int:user_quest_id>/log', methods=['POST'])
@require_auth
def add_learning_log(user_id, user_quest_id):
    """Add a learning log entry for a quest"""
    
    supabase = get_supabase_client()
    data = request.json
    
    # Validate input
    log_entry = data.get('log_entry')
    media_url = data.get('media_url', None)
    
    if not log_entry:
        return jsonify({'error': 'Log entry is required'}), 400
    
    if len(log_entry) < 10:
        return jsonify({'error': 'Log entry must be at least 10 characters'}), 400
    
    try:
        # Verify user owns this quest
        user_quest_response = supabase.table('user_quests')\
            .select('*, quests(log_bonus)')\
            .eq('id', user_quest_id)\
            .eq('user_id', user_id)\
            .execute()
        
        if not user_quest_response.data:
            return jsonify({'error': 'Quest not found or not owned by user'}), 404
        
        user_quest = user_quest_response.data[0]
        
        # Check if this is the first log entry
        existing_logs = supabase.table('learning_logs')\
            .select('id')\
            .eq('user_quest_id', user_quest_id)\
            .execute()
        
        is_first_log = len(existing_logs.data) == 0 if existing_logs.data else True
        
        # Create the log entry
        log_data = {
            'user_quest_id': user_quest_id,
            'user_id': user_id,
            'log_entry': log_entry,
            'media_url': media_url,
            'created_at': datetime.utcnow().isoformat()
        }
        
        log_response = supabase.table('learning_logs').insert(log_data).execute()
        
        if not log_response.data:
            return jsonify({'error': 'Failed to create log entry'}), 500
        
        # Award bonus XP if this is the first log and quest has log bonus
        bonus_awarded = None
        if is_first_log and user_quest.get('quests', {}).get('log_bonus'):
            log_bonus = user_quest['quests']['log_bonus']
            
            if isinstance(log_bonus, dict) and log_bonus.get('xp_amount'):
                # Get the quest's primary pillar
                quest_response = supabase.table('quests')\
                    .select('primary_pillar')\
                    .eq('id', user_quest['quest_id'])\
                    .execute()
                
                if quest_response.data and quest_response.data[0].get('primary_pillar'):
                    primary_pillar = quest_response.data[0]['primary_pillar']
                    xp_amount = log_bonus['xp_amount']
                    
                    # Award XP to user's skill category
                    xp_response = supabase.table('user_skill_xp')\
                        .select('*')\
                        .eq('user_id', user_id)\
                        .eq('skill_category', primary_pillar)\
                        .execute()
                    
                    if xp_response.data:
                        # Update existing XP
                        current_xp = xp_response.data[0]['total_xp']
                        supabase.table('user_skill_xp')\
                            .update({'total_xp': current_xp + xp_amount})\
                            .eq('user_id', user_id)\
                            .eq('skill_category', primary_pillar)\
                            .execute()
                    else:
                        # Create new XP record
                        supabase.table('user_skill_xp').insert({
                            'user_id': user_id,
                            'skill_category': primary_pillar,
                            'total_xp': xp_amount
                        }).execute()
                    
                    bonus_awarded = {
                        'pillar': primary_pillar,
                        'xp_amount': xp_amount,
                        'description': log_bonus.get('description', 'Learning log bonus')
                    }
        
        response_data = {
            'success': True,
            'log_id': log_response.data[0]['id'],
            'message': 'Learning log entry added successfully'
        }
        
        if bonus_awarded:
            response_data['bonus_awarded'] = bonus_awarded
        
        return jsonify(response_data), 201
        
    except Exception as e:
        print(f"Error adding learning log: {str(e)}")
        return jsonify({'error': 'Failed to add learning log entry'}), 500

@bp.route('/quests/<int:user_quest_id>/logs', methods=['GET'])
@require_auth
def get_learning_logs(user_id, user_quest_id):
    """Get all learning log entries for a quest"""
    
    supabase = get_supabase_client()
    
    try:
        # Verify user owns this quest
        user_quest_response = supabase.table('user_quests')\
            .select('id')\
            .eq('id', user_quest_id)\
            .eq('user_id', user_id)\
            .execute()
        
        if not user_quest_response.data:
            return jsonify({'error': 'Quest not found or not owned by user'}), 404
        
        # Get all logs for this quest
        logs_response = supabase.table('learning_logs')\
            .select('*')\
            .eq('user_quest_id', user_quest_id)\
            .order('created_at', desc=False)\
            .execute()
        
        return jsonify({
            'logs': logs_response.data if logs_response.data else [],
            'count': len(logs_response.data) if logs_response.data else 0
        }), 200
        
    except Exception as e:
        print(f"Error getting learning logs: {str(e)}")
        return jsonify({'error': 'Failed to get learning logs'}), 500

@bp.route('/logs/<log_id>', methods=['PUT'])
@require_auth
def update_learning_log(user_id, log_id):
    """Update a learning log entry"""
    
    supabase = get_supabase_client()
    data = request.json
    
    try:
        # Verify user owns this log
        log_response = supabase.table('learning_logs')\
            .select('*')\
            .eq('id', log_id)\
            .eq('user_id', user_id)\
            .execute()
        
        if not log_response.data:
            return jsonify({'error': 'Log not found or not owned by user'}), 404
        
        # Update the log
        update_data = {}
        if 'log_entry' in data:
            if len(data['log_entry']) < 10:
                return jsonify({'error': 'Log entry must be at least 10 characters'}), 400
            update_data['log_entry'] = data['log_entry']
        
        if 'media_url' in data:
            update_data['media_url'] = data['media_url']
        
        if not update_data:
            return jsonify({'error': 'No valid fields to update'}), 400
        
        update_response = supabase.table('learning_logs')\
            .update(update_data)\
            .eq('id', log_id)\
            .execute()
        
        if update_response.data:
            return jsonify({
                'success': True,
                'log': update_response.data[0]
            }), 200
        else:
            return jsonify({'error': 'Failed to update log'}), 500
            
    except Exception as e:
        print(f"Error updating learning log: {str(e)}")
        return jsonify({'error': 'Failed to update learning log'}), 500

@bp.route('/logs/<log_id>', methods=['DELETE'])
@require_auth
def delete_learning_log(user_id, log_id):
    """Delete a learning log entry"""
    
    supabase = get_supabase_client()
    
    try:
        # Verify user owns this log
        log_response = supabase.table('learning_logs')\
            .select('id')\
            .eq('id', log_id)\
            .eq('user_id', user_id)\
            .execute()
        
        if not log_response.data:
            return jsonify({'error': 'Log not found or not owned by user'}), 404
        
        # Delete the log
        delete_response = supabase.table('learning_logs')\
            .delete()\
            .eq('id', log_id)\
            .execute()
        
        return jsonify({
            'success': True,
            'message': 'Learning log deleted successfully'
        }), 200
            
    except Exception as e:
        print(f"Error deleting learning log: {str(e)}")
        return jsonify({'error': 'Failed to delete learning log'}), 500