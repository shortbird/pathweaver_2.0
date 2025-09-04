from flask import Blueprint, request, jsonify
from flask_cors import cross_origin
from functools import wraps
import jwt
import os
from datetime import datetime

ratings_bp = Blueprint('ratings', __name__)

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization')
        
        if auth_header:
            try:
                token = auth_header.split(' ')[1]
            except IndexError:
                return jsonify({'error': 'Invalid token format'}), 401
        
        if not token:
            return jsonify({'error': 'Token is missing'}), 401
        
        try:
            data = jwt.decode(token, os.environ.get('SECRET_KEY'), algorithms=['HS256'])
            
            # Get user details from database
            from supabase import create_client
            supabase = create_client(
                os.environ.get('SUPABASE_URL'),
                os.environ.get('SUPABASE_SERVICE_KEY')
            )
            
            user_response = supabase.table('users').select('*').eq('id', data['user_id']).single().execute()
            if user_response.data:
                return f(user_response.data, *args, **kwargs)
            else:
                return jsonify({'error': 'User not found'}), 404
                
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
    
    return decorated

@ratings_bp.route('/quests/<quest_id>/rate', methods=['POST'])
@cross_origin()
@token_required
def rate_quest(user, quest_id):
    """Rate a quest (1-5 stars)"""
    try:
        data = request.get_json()
        rating = data.get('rating')
        
        if not rating or not isinstance(rating, int) or rating < 1 or rating > 5:
            return jsonify({'error': 'Rating must be an integer between 1 and 5'}), 400
        
        from supabase import create_client
        supabase = create_client(
            os.environ.get('SUPABASE_URL'),
            os.environ.get('SUPABASE_SERVICE_KEY')
        )
        
        # Check if quest exists
        quest_response = supabase.table('quests').select('*').eq('id', quest_id).single().execute()
        if not quest_response.data:
            return jsonify({'error': 'Quest not found'}), 404
        
        # For non-admin users, check if they have completed the quest
        if user['role'] != 'admin':
            submission_response = supabase.table('submissions').select('*').eq('user_id', user['id']).eq('quest_id', quest_id).eq('status', 'approved').execute()
            if not submission_response.data:
                return jsonify({'error': 'You must complete this quest before rating it'}), 403
        
        # Insert or update rating
        rating_data = {
            'quest_id': quest_id,
            'user_id': user['id'],
            'rating': rating,
            'created_at': datetime.utcnow().isoformat()
        }
        
        # Try to insert, if it fails due to unique constraint, update instead
        try:
            response = supabase.table('quest_ratings').insert(rating_data).execute()
        except:
            # Rating already exists, update it
            response = supabase.table('quest_ratings').update({
                'rating': rating,
                'created_at': datetime.utcnow().isoformat()
            }).eq('quest_id', quest_id).eq('user_id', user['id']).execute()
        
        # Recalculate average rating for the quest
        all_ratings = supabase.table('quest_ratings').select('rating').eq('quest_id', quest_id).execute()
        
        if all_ratings.data:
            ratings_list = [r['rating'] for r in all_ratings.data]
            average_rating = sum(ratings_list) / len(ratings_list)
            
            # Update quest with new average rating
            supabase.table('quests').update({
                'average_rating': round(average_rating, 2)
            }).eq('id', quest_id).execute()
            
            return jsonify({
                'message': 'Thank you for your feedback!',
                'average_rating': round(average_rating, 2),
                'total_ratings': len(ratings_list)
            }), 201
        
        return jsonify({'message': 'Rating saved successfully'}), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@ratings_bp.route('/quests/<quest_id>/rating', methods=['GET'])
@cross_origin()
def get_quest_rating(quest_id):
    """Get rating information for a quest"""
    try:
        from supabase import create_client
        supabase = create_client(
            os.environ.get('SUPABASE_URL'),
            os.environ.get('SUPABASE_SERVICE_KEY')
        )
        
        # Get quest with rating info
        quest_response = supabase.table('quests').select('average_rating').eq('id', quest_id).single().execute()
        if not quest_response.data:
            return jsonify({'error': 'Quest not found'}), 404
        
        # Get total number of ratings
        ratings_response = supabase.table('quest_ratings').select('rating').eq('quest_id', quest_id).execute()
        
        return jsonify({
            'average_rating': quest_response.data.get('average_rating', 0),
            'total_ratings': len(ratings_response.data) if ratings_response.data else 0,
            'ratings_distribution': get_ratings_distribution(ratings_response.data) if ratings_response.data else {}
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@ratings_bp.route('/quests/<quest_id>/user-rating', methods=['GET'])
@cross_origin()
@token_required
def get_user_quest_rating(user, quest_id):
    """Get the current user's rating for a quest"""
    try:
        from supabase import create_client
        supabase = create_client(
            os.environ.get('SUPABASE_URL'),
            os.environ.get('SUPABASE_SERVICE_KEY')
        )
        
        response = supabase.table('quest_ratings').select('rating').eq('quest_id', quest_id).eq('user_id', user['id']).single().execute()
        
        if response.data:
            return jsonify({'user_rating': response.data['rating']}), 200
        else:
            return jsonify({'user_rating': None}), 200
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def get_ratings_distribution(ratings_data):
    """Calculate the distribution of ratings"""
    distribution = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    for rating in ratings_data:
        distribution[rating['rating']] += 1
    return distribution