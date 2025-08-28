from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from datetime import datetime
import csv
import io
import json
import os

bp = Blueprint('admin', __name__)

def award_skill_xp(supabase, user_id, quest_id):
    """Award skill-based XP when a quest is completed"""
    xp_awarded = False
    
    # Try new skill-based XP system first
    try:
        skill_awards = supabase.table('quest_skill_xp').select('*').eq('quest_id', quest_id).execute()
        
        if skill_awards.data:
            for award in skill_awards.data:
                # Get current XP for this skill category
                current_xp = supabase.table('user_skill_xp').select('*').eq('user_id', user_id).eq('skill_category', award['skill_category']).execute()
                
                if current_xp.data:
                    # Update existing XP
                    new_total = current_xp.data[0]['total_xp'] + award['xp_amount']
                    supabase.table('user_skill_xp').update({
                        'total_xp': new_total,
                        'last_updated': datetime.utcnow().isoformat()
                    }).eq('user_id', user_id).eq('skill_category', award['skill_category']).execute()
                else:
                    # Create new XP record
                    supabase.table('user_skill_xp').insert({
                        'user_id': user_id,
                        'skill_category': award['skill_category'],
                        'total_xp': award['xp_amount'],
                        'last_updated': datetime.utcnow().isoformat()
                    }).execute()
            xp_awarded = True
            print(f"Awarded skill-based XP for quest {quest_id} to user {user_id}")
    except Exception as e:
        print(f"Error awarding skill-based XP: {str(e)}")
    
    # Fallback to old subject-based XP system if skill-based fails or has no data
    if not xp_awarded:
        try:
            subject_awards = supabase.table('quest_xp_awards').select('*').eq('quest_id', quest_id).execute()
            
            if subject_awards.data:
                for award in subject_awards.data:
                    # For backward compatibility, we'll also track subject XP in user_xp table if it exists
                    try:
                        current_xp = supabase.table('user_xp').select('*').eq('user_id', user_id).eq('subject', award['subject']).execute()
                        
                        if current_xp.data:
                            new_total = current_xp.data[0]['total_xp'] + award['xp_amount']
                            supabase.table('user_xp').update({
                                'total_xp': new_total
                            }).eq('user_id', user_id).eq('subject', award['subject']).execute()
                        else:
                            supabase.table('user_xp').insert({
                                'user_id': user_id,
                                'subject': award['subject'],
                                'total_xp': award['xp_amount']
                            }).execute()
                        xp_awarded = True
                        print(f"Awarded subject-based XP for quest {quest_id} to user {user_id}")
                    except Exception as e2:
                        print(f"Error awarding subject XP: {str(e2)}")
        except Exception as e:
            print(f"Error checking subject-based XP: {str(e)}")
    
    # Track individual skills practiced (if available)
    try:
        quest = supabase.table('quests').select('core_skills').eq('id', quest_id).execute()
        if quest.data and quest.data[0].get('core_skills'):
            for skill in quest.data[0]['core_skills']:
                try:
                    # Check if skill detail exists
                    skill_detail = supabase.table('user_skill_details').select('*').eq('user_id', user_id).eq('skill_name', skill).execute()
                    
                    if skill_detail.data:
                        # Update existing skill detail
                        times_practiced = skill_detail.data[0]['times_practiced'] + 1
                        supabase.table('user_skill_details').update({
                            'times_practiced': times_practiced,
                            'last_practiced': datetime.utcnow().isoformat()
                        }).eq('user_id', user_id).eq('skill_name', skill).execute()
                    else:
                        # Create new skill detail
                        supabase.table('user_skill_details').insert({
                            'user_id': user_id,
                            'skill_name': skill,
                            'times_practiced': 1,
                            'last_practiced': datetime.utcnow().isoformat()
                        }).execute()
                except Exception as e:
                    print(f"Error tracking skill {skill}: {str(e)}")
    except Exception as e:
        print(f"Error tracking skills practiced: {str(e)}")
    
    return xp_awarded

@bp.route('/quests', methods=['POST'])
@require_admin
def create_quest(user_id):
    data = request.json
    supabase = get_supabase_admin_client()
    
    # Debug logging
    print(f"Creating quest with data keys: {list(data.keys())}")
    print(f"Primary pillar: {data.get('primary_pillar')}")
    print(f"Has big_idea: {'big_idea' in data}")
    print(f"Has description: {'description' in data}")
    
    try:
        # Base quest data - handle both Visual format and standard format
        quest_data = {
            'title': data['title'],
            'created_by': user_id,
            'created_at': datetime.utcnow().isoformat()
        }
        
        # Map Visual format fields to database fields if needed
        # The database can store both formats, we just pass through all fields
        
        # Add all fields from the request (Visual/Diploma Pillars format)
        visual_fields = [
            'big_idea', 'what_youll_create', 'primary_pillar', 'primary_pillar_icon',
            'intensity', 'estimated_time', 'your_mission', 'showcase_your_journey',
            'helpful_resources', 'core_competencies', 'collaboration_spark',
            'real_world_bonus', 'log_bonus', 'heads_up', 'location', 'total_xp',
            'collaboration_bonus', 'quest_banner_image'
        ]
        
        # Also support old fields for backward compatibility
        standard_fields = [
            'description', 'evidence_requirements', 'difficulty_level', 'effort_level', 
            'estimated_hours', 'accepted_evidence_types', 'example_submissions', 'core_skills',
            'resources_needed', 'location_requirements', 'optional_challenges',
            'safety_considerations', 'requires_adult_supervision', 'collaboration_ideas'
        ]
        
        # Add all present fields from either format
        for field in visual_fields + standard_fields:
            if field in data:
                quest_data[field] = data[field]
        
        quest_response = supabase.table('quests').insert(quest_data).execute()
        quest_id = quest_response.data[0]['id']
        
        # Handle skill-based XP awards (new system)
        if 'skill_xp_awards' in data:
            for award in data['skill_xp_awards']:
                try:
                    supabase.table('quest_skill_xp').insert({
                        'quest_id': quest_id,
                        'skill_category': award['skill_category'],
                        'xp_amount': award['xp_amount']
                    }).execute()
                except Exception:
                    # If skill table doesn't exist, skip
                    pass
        
        # Handle subject-based XP awards (old system fallback)
        if 'xp_awards' in data:
            for award in data['xp_awards']:
                try:
                    supabase.table('quest_xp_awards').insert({
                        'quest_id': quest_id,
                        'subject': award['subject'],
                        'xp_amount': award['xp_amount']
                    }).execute()
                except Exception:
                    # If old table doesn't exist, skip
                    pass
        
        return jsonify({'quest_id': quest_id}), 201
        
    except Exception as e:
        print(f"Error creating quest: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 400

@bp.route('/quests/complete-with-ai', methods=['POST'])
@require_admin
def complete_quest_with_ai(user_id):
    """Complete a partially filled quest form using AI"""
    data = request.json
    
    try:
        from services.quest_completion_service import QuestCompletionService
        
        service = QuestCompletionService()
        completed_quest = service.complete_quest(data)
        
        return jsonify(completed_quest), 200
        
    except ValueError as e:
        # GEMINI_API_KEY not configured
        return jsonify({'error': 'AI service not configured. Please set GEMINI_API_KEY in environment variables.'}), 503
    except Exception as e:
        print(f"Error completing quest with AI: {str(e)}")
        return jsonify({'error': 'Failed to complete quest with AI'}), 500

@bp.route('/quests/<quest_id>', methods=['PUT'])
@require_admin
def update_quest(user_id, quest_id):
    data = request.json
    supabase = get_supabase_admin_client()
    
    try:
        # Handle base64 image upload if provided
        if 'header_image_base64' in data and data['header_image_base64']:
            import base64
            import uuid
            from datetime import datetime
            
            # Extract base64 data
            base64_data = data['header_image_base64']
            if ',' in base64_data:
                base64_data = base64_data.split(',')[1]
            
            # Generate unique filename
            file_ext = 'jpg'
            if 'header_image_filename' in data:
                file_ext = data['header_image_filename'].split('.')[-1]
            filename = f"quest-{quest_id}-{uuid.uuid4().hex[:8]}.{file_ext}"
            
            # Upload to Supabase storage
            try:
                # Decode base64 to bytes
                image_bytes = base64.b64decode(base64_data)
                
                # First, try to delete existing image if it exists
                try:
                    # Try to delete any existing image with similar name pattern
                    existing_files = supabase.storage.from_('quest-images').list(path='', options={'search': f'quest-{quest_id}'})
                    for file in existing_files:
                        supabase.storage.from_('quest-images').remove([file['name']])
                except:
                    pass  # Ignore deletion errors
                
                # Upload to storage bucket
                storage_response = supabase.storage.from_('quest-images').upload(
                    filename,
                    image_bytes,
                    {'content-type': f'image/{file_ext}', 'upsert': 'true'}
                )
                
                # Get public URL
                image_url = supabase.storage.from_('quest-images').get_public_url(filename)
                
                # Add the URL to update data
                data['header_image_url'] = image_url
                print(f"Successfully uploaded image: {image_url}")
                
            except Exception as e:
                print(f"Error uploading image: {str(e)}")
                import traceback
                traceback.print_exc()
                # Try simpler approach - just store the base64 directly
                data['header_image_url'] = data['header_image_base64']
        
        # Expanded allowed fields for both Visual and standard formats
        visual_fields = [
            'title', 'big_idea', 'what_youll_create', 'primary_pillar', 'primary_pillar_icon',
            'intensity', 'estimated_time', 'your_mission', 'showcase_your_journey',
            'helpful_resources', 'core_competencies', 'collaboration_spark',
            'real_world_bonus', 'log_bonus', 'heads_up', 'location', 'total_xp',
            'collaboration_bonus', 'quest_banner_image', 'header_image_url', 'image_url'
        ]
        standard_fields = [
            'description', 'evidence_requirements', 'difficulty_level', 'effort_level',
            'estimated_hours', 'accepted_evidence_types', 'example_submissions', 'core_skills',
            'resources_needed', 'location_requirements', 'optional_challenges',
            'safety_considerations', 'requires_adult_supervision', 'collaboration_ideas'
        ]
        allowed_fields = visual_fields + standard_fields
        update_data = {k: v for k, v in data.items() if k in allowed_fields}
        
        if update_data:
            supabase.table('quests').update(update_data).eq('id', quest_id).execute()
        
        # Handle skill-based XP awards (new system)
        if 'skill_xp_awards' in data:
            try:
                supabase.table('quest_skill_xp').delete().eq('quest_id', quest_id).execute()
                for award in data['skill_xp_awards']:
                    supabase.table('quest_skill_xp').insert({
                        'quest_id': quest_id,
                        'skill_category': award['skill_category'],
                        'xp_amount': award['xp_amount']
                    }).execute()
            except Exception:
                pass
        
        # Handle subject-based XP awards (old system)
        if 'xp_awards' in data:
            try:
                supabase.table('quest_xp_awards').delete().eq('quest_id', quest_id).execute()
                for award in data['xp_awards']:
                    supabase.table('quest_xp_awards').insert({
                        'quest_id': quest_id,
                        'subject': award['subject'],
                        'xp_amount': award['xp_amount']
                    }).execute()
            except Exception:
                pass
        
        return jsonify({'message': 'Quest updated successfully'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/quests/<quest_id>', methods=['DELETE'])
@require_admin
def delete_quest(user_id, quest_id):
    supabase = get_supabase_admin_client()
    
    try:
        # Delete all related records first (in order of dependencies)
        
        # 1. Delete learning logs (depends on user_quests)
        user_quests_response = supabase.table('user_quests').select('id').eq('quest_id', quest_id).execute()
        if user_quests_response.data:
            print(f"DEBUG: user_quests data: {user_quests_response.data}")
            for uq in user_quests_response.data:
                print(f"DEBUG: uq['id'] = {uq['id']}, type = {type(uq['id'])}")
                try:
                    supabase.table('learning_logs').delete().eq('user_quest_id', uq['id']).execute()
                except Exception as e:
                    print(f"Warning: Could not delete learning logs: {e}")
        
        # 2. Delete submissions and submission evidence (depends on user_quests)
        if user_quests_response.data:
            for uq in user_quests_response.data:
                # Get submissions first
                # Check if id is actually a UUID string and needs conversion
                user_quest_id = uq['id']
                print(f"DEBUG: Checking submissions for user_quest_id = {user_quest_id}")
                
                # Try to handle both integer and UUID cases
                try:
                    submissions_response = supabase.table('submissions').select('id').eq('user_quest_id', user_quest_id).execute()
                except Exception as e:
                    print(f"Error querying submissions: {e}")
                    submissions_response = None
                    
                if submissions_response and submissions_response.data:
                    for submission in submissions_response.data:
                        # Delete submission evidence
                        try:
                            supabase.table('submission_evidence').delete().eq('submission_id', submission['id']).execute()
                        except Exception as e:
                            print(f"Warning: Could not delete submission evidence: {e}")
                    # Delete submissions
                    try:
                        supabase.table('submissions').delete().eq('user_quest_id', uq['id']).execute()
                    except Exception as e:
                        print(f"Warning: Could not delete submissions: {e}")
        
        # 3. Delete user_quests
        try:
            supabase.table('user_quests').delete().eq('quest_id', quest_id).execute()
        except Exception as e:
            print(f"Warning: Could not delete user_quests: {e}")
        
        # 4. Update ai_generated_quests to remove reference (table may still exist in production)
        try:
            supabase.table('ai_generated_quests').update({
                'published_quest_id': None
            }).eq('published_quest_id', quest_id).execute()
        except Exception as e:
            # Table may not exist, that's OK
            print(f"Info: Could not update ai_generated_quests (table may not exist): {e}")
        
        # 5. Delete community shares that reference this quest
        try:
            supabase.table('community_shares').delete().eq('quest_id', quest_id).execute()
        except Exception as e:
            print(f"Warning: Could not delete community shares: {e}")
        
        # 6. Delete quest ideas that might reference this quest
        try:
            supabase.table('quest_ideas').delete().eq('expanded_quest_id', quest_id).execute()
        except Exception as e:
            print(f"Warning: Could not delete quest ideas: {e}")
        
        # 7. Delete quest ratings if they exist
        try:
            supabase.table('quest_ratings').delete().eq('quest_id', quest_id).execute()
        except Exception as e:
            print(f"Info: Could not delete quest ratings (table may not exist): {e}")
        
        # 8. Delete quest_skill_xp
        try:
            supabase.table('quest_skill_xp').delete().eq('quest_id', quest_id).execute()
        except Exception as e:
            print(f"Warning: Could not delete quest_skill_xp: {e}")
        
        # 9. Delete quest_xp_awards (old table)
        try:
            supabase.table('quest_xp_awards').delete().eq('quest_id', quest_id).execute()
        except Exception as e:
            print(f"Warning: Could not delete quest_xp_awards: {e}")
        
        # 10. Delete from activity_log (if any references exist)
        try:
            # Fetch all activity logs
            activity_logs = supabase.table('activity_log').select('id, event_details').execute()
            if activity_logs.data:
                for log in activity_logs.data:
                    if log.get('event_details') and quest_id in str(log['event_details']):
                        try:
                            supabase.table('activity_log').delete().eq('id', log['id']).execute()
                        except:
                            pass
        except Exception as e:
            print(f"Warning: Could not check/delete activity logs: {e}")
        
        # 11. Finally, delete the quest itself
        result = supabase.table('quests').delete().eq('id', quest_id).execute()
        
        return jsonify({'message': 'Quest and all related data deleted successfully'}), 200
        
    except Exception as e:
        print(f"Error deleting quest {quest_id}: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Failed to delete quest: {str(e)}'}), 400

@bp.route('/quests/bulk-import', methods=['POST'])
@require_admin
def bulk_import_quests(user_id):
    supabase = get_supabase_admin_client()
    
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not file.filename.endswith('.csv'):
            return jsonify({'error': 'File must be a CSV'}), 400
        
        stream = io.StringIO(file.stream.read().decode("UTF8"), newline=None)
        csv_reader = csv.DictReader(stream)
        
        imported_count = 0
        errors = []
        
        for row_num, row in enumerate(csv_reader, start=2):
            try:
                quest_data = {
                    'title': row['title'].strip(),
                    'description': row['description'].strip(),
                    'evidence_requirements': row['evidence_requirements'].strip(),
                    'created_by': user_id,
                    'created_at': datetime.utcnow().isoformat()
                }
                
                quest_response = supabase.table('quests').insert(quest_data).execute()
                quest_id = quest_response.data[0]['id']
                
                subjects = [s.strip() for s in row['subjects'].split(',')]
                xp_amounts = [int(x.strip()) for x in row['xp_amounts'].split(',')]
                
                if len(subjects) != len(xp_amounts):
                    errors.append(f"Row {row_num}: Mismatched subjects and XP amounts")
                    continue
                
                for subject, xp_amount in zip(subjects, xp_amounts):
                    supabase.table('quest_xp_awards').insert({
                        'quest_id': quest_id,
                        'subject': subject,
                        'xp_amount': xp_amount
                    }).execute()
                
                imported_count += 1
                
            except Exception as e:
                errors.append(f"Row {row_num}: {str(e)}")
        
        response_data = {
            'imported': imported_count,
            'total': row_num - 1
        }
        
        if errors:
            response_data['errors'] = errors
        
        return jsonify(response_data), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/submissions/pending', methods=['GET'])
@require_admin
def get_pending_submissions(user_id):
    supabase = get_supabase_admin_client()
    
    try:
        # Get pagination parameters
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        
        # Calculate range for pagination
        start = (page - 1) * per_page
        end = start + per_page - 1
        
        # First get submissions with evidence - filter by pending status only
        print(f"Fetching submissions: start={start}, end={end}")
        submissions = supabase.table('submissions')\
            .select('*, submission_evidence(*)', count='exact')\
            .eq('status', 'pending')\
            .range(start, end)\
            .execute()
        print(f"Submissions fetched: {len(submissions.data) if submissions.data else 0} items")
        
        # Then enrich with user and quest data
        if submissions.data:
            for submission in submissions.data:
                # Get user quest details
                if submission.get('user_quest_id'):
                    user_quest = supabase.table('user_quests')\
                        .select('*, quests(*)')\
                        .eq('id', submission['user_quest_id'])\
                        .single()\
                        .execute()
                    if user_quest.data:
                        submission['user_quest'] = user_quest.data
                        # Get user details
                        if user_quest.data.get('user_id'):
                            user = supabase.table('users')\
                                .select('*')\
                                .eq('id', user_quest.data['user_id'])\
                                .single()\
                                .execute()
                            if user.data:
                                submission['user'] = user.data
        
        return jsonify({
            'submissions': submissions.data,
            'page': page,
            'per_page': per_page,
            'total': submissions.count if hasattr(submissions, 'count') else len(submissions.data)
        }), 200
        
    except Exception as e:
        print(f"Error in get_pending_submissions: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 400

@bp.route('/submissions/<submission_id>/review', methods=['POST'])
@require_admin
def review_submission(user_id, submission_id):
    data = request.json
    action = data.get('action')
    feedback = data.get('feedback', '')
    
    if action not in ['approve', 'request_changes']:
        return jsonify({'error': 'Invalid action'}), 400
    
    supabase = get_supabase_admin_client()
    
    try:
        submission = supabase.table('submissions').select('*, user_quests(*)').eq('id', submission_id).single().execute()
        
        if not submission.data:
            return jsonify({'error': 'Submission not found'}), 404
        
        supabase.table('submissions').update({
            'educator_id': user_id,
            'feedback': feedback
        }).eq('id', submission_id).execute()
        
        new_status = 'completed' if action == 'approve' else 'needs_changes'
        
        update_data = {'status': new_status}
        if action == 'approve':
            update_data['completed_at'] = datetime.utcnow().isoformat()
        
        supabase.table('user_quests').update(update_data).eq('id', submission.data['user_quest_id']).execute()
        
        if action == 'approve':
            user_quest = submission.data['user_quests']
            
            # Award skill-based XP
            award_skill_xp(supabase, user_quest['user_id'], user_quest['quest_id'])
            
            supabase.table('activity_log').insert({
                'user_id': user_quest['user_id'],
                'event_type': 'quest_completed',
                'event_details': {'quest_id': user_quest['quest_id']}
            }).execute()
        
        return jsonify({'message': f'Submission {action}d successfully'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/users', methods=['GET'])
@require_admin
def get_all_users(user_id):
    supabase = get_supabase_admin_client()
    
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        search = request.args.get('search', '')
        
        query = supabase.table('users').select('*')
        
        if search:
            query = query.or_(f"first_name.ilike.%{search}%,last_name.ilike.%{search}%")
        
        start = (page - 1) * per_page
        end = start + per_page - 1
        
        response = query.range(start, end).execute()
        
        return jsonify({
            'users': response.data,
            'page': page,
            'per_page': per_page
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# AI quest review endpoints removed - all quests will be created manually

# AI quest approval endpoint removed - all quests will be created manually

# AI quest rejection endpoint removed - all quests will be created manually

@bp.route('/analytics', methods=['GET'])
@require_admin
def get_analytics(user_id):
    supabase = get_supabase_admin_client()
    
    try:
        # Get total users count
        total_users = supabase.table('users').select('*', count='exact').execute()
        total_users_count = total_users.count if hasattr(total_users, 'count') else len(total_users.data)
        
        # Get monthly active users (users who have activity in the last 30 days)
        from datetime import datetime, timedelta
        thirty_days_ago = (datetime.utcnow() - timedelta(days=30)).isoformat()
        
        try:
            # Try to get active users from activity_log
            active_users_response = supabase.table('activity_log')\
                .select('user_id')\
                .gte('created_at', thirty_days_ago)\
                .execute()
            
            # Get unique user IDs
            active_user_ids = set()
            if active_users_response.data:
                for log in active_users_response.data:
                    if log.get('user_id'):
                        active_user_ids.add(log['user_id'])
            monthly_active_count = len(active_user_ids)
        except Exception:
            # If activity_log doesn't exist or fails, use a fallback
            monthly_active_count = 0
        
        # Get subscription breakdown
        subscription_breakdown = supabase.table('users').select('subscription_tier').execute()
        tier_counts = {'explorer': 0, 'creator': 0, 'visionary': 0}
        if subscription_breakdown.data:
            for user in subscription_breakdown.data:
                tier = user.get('subscription_tier', 'explorer')
                if tier in tier_counts:
                    tier_counts[tier] += 1
                else:
                    tier_counts['explorer'] += 1  # Default to explorer if unknown tier
        
        # Get quests completed count (V3 schema: completed_at not null means completed)
        quests_completed = supabase.table('user_quests')\
            .select('*', count='exact')\
            .not_.is_('completed_at', 'null')\
            .execute()
        quests_completed_count = quests_completed.count if hasattr(quests_completed, 'count') else len(quests_completed.data if quests_completed.data else [])
        
        return jsonify({
            'total_users': total_users_count,
            'monthly_active_users': monthly_active_count,
            'subscription_breakdown': tier_counts,
            'total_quests_completed': quests_completed_count
        }), 200
        
    except Exception as e:
        print(f"Error in analytics endpoint: {str(e)}")
        return jsonify({'error': str(e)}), 400

@bp.route('/complete-quest-form', methods=['POST'])
@require_admin  
def complete_quest_form(user_id):
    """
    Complete a partially filled quest creation form using Gemini AI
    """
    try:
        data = request.json
        partial_quest_data = data.get('quest_data')
        
        if not partial_quest_data:
            return jsonify({'error': 'quest_data is required'}), 400
        
        # Initialize quest completion service
        service = QuestCompletionService()
        
        # Complete the quest form
        completed_quest = service.complete_quest(partial_quest_data)
        
        if completed_quest is None:
            return jsonify({'error': 'Failed to complete quest form. Please check your input data and try again.'}), 400
        
        return jsonify({
            'completed_quest': completed_quest,
            'quality_score': completed_quest.get('_quality_score'),
            'message': 'Quest form completed successfully'
        }), 200
        
    except Exception as e:
        print(f"Error completing quest form: {str(e)}")
        return jsonify({'error': f'Quest completion failed: {str(e)}'}), 500

@bp.route('/batch-complete-quests', methods=['POST'])
@require_admin
def batch_complete_quests(user_id):
    """
    Complete multiple partially filled quest forms in batch
    """
    try:
        data = request.json
        quest_list = data.get('quest_list')
        
        if not quest_list or not isinstance(quest_list, list):
            return jsonify({'error': 'quest_list must be a non-empty array'}), 400
        
        if len(quest_list) > 10:
            return jsonify({'error': 'Maximum 10 quests allowed per batch'}), 400
        
        # Initialize quest completion service
        service = QuestCompletionService()
        
        # Complete quests in batch
        completed_quests = service.batch_complete_quests(quest_list)
        
        # Count successful completions
        successful_quests = [q for q in completed_quests if q is not None]
        failed_count = len(completed_quests) - len(successful_quests)
        
        return jsonify({
            'completed_quests': completed_quests,
            'success_count': len(successful_quests),
            'failure_count': failed_count,
            'total_requested': len(quest_list),
            'message': f'Completed {len(successful_quests)}/{len(quest_list)} quests successfully'
        }), 200
        
    except Exception as e:
        print(f"Error in batch quest completion: {str(e)}")
        return jsonify({'error': f'Batch completion failed: {str(e)}'}), 500

@bp.route('/clear-rate-limit', methods=['POST'])
@require_admin
def clear_rate_limit():
    """Clear rate limiting for a specific IP address (admin only)"""
    try:
        from middleware.rate_limiter import rate_limiter
        
        # Get IP from request body or use requester's IP
        data = request.json or {}
        ip_to_clear = data.get('ip', request.remote_addr)
        
        if ip_to_clear:
            rate_limiter.reset(ip_to_clear)
            return jsonify({'message': f'Rate limit cleared for IP: {ip_to_clear}'}), 200
        else:
            return jsonify({'error': 'No IP address provided'}), 400
            
    except Exception as e:
        return jsonify({'error': f'Failed to clear rate limit: {str(e)}'}), 500