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

# Enhanced User Management Endpoints

@bp.route('/users', methods=['GET'])
@require_admin
def get_users_list(user_id):
    """Get paginated list of users with search and filtering capabilities"""
    supabase = get_supabase_admin_client()
    
    try:
        # Get query parameters
        page = request.args.get('page', 1, type=int)
        limit = request.args.get('limit', 20, type=int)
        search = request.args.get('search', '')
        subscription = request.args.get('subscription', 'all')
        activity = request.args.get('activity', 'all')
        sort_by = request.args.get('sort_by', 'created_at')
        sort_order = request.args.get('sort_order', 'desc')
        
        # Start building query
        query = supabase.table('users').select('*', count='exact')
        
        # Apply search filter
        if search:
            query = query.or_(f"first_name.ilike.%{search}%,last_name.ilike.%{search}%,email.ilike.%{search}%")
        
        # Apply subscription filter
        if subscription != 'all':
            if subscription == 'free':
                query = query.or_('subscription_tier.eq.free,subscription_tier.is.null')
            else:
                query = query.eq('subscription_tier', subscription)
        
        # Apply activity filter
        if activity != 'all':
            from datetime import datetime, timedelta
            if activity == 'active_7':
                cutoff = (datetime.utcnow() - timedelta(days=7)).isoformat()
                query = query.gte('last_active', cutoff)
            elif activity == 'active_30':
                cutoff = (datetime.utcnow() - timedelta(days=30)).isoformat()
                query = query.gte('last_active', cutoff)
            elif activity == 'inactive':
                cutoff = (datetime.utcnow() - timedelta(days=30)).isoformat()
                query = query.or_(f'last_active.lt.{cutoff},last_active.is.null')
        
        # Apply sorting
        if sort_order == 'desc':
            query = query.order(sort_by, desc=True)
        else:
            query = query.order(sort_by)
        
        # Apply pagination
        start = (page - 1) * limit
        end = start + limit - 1
        query = query.range(start, end)
        
        # Execute query
        response = query.execute()
        
        # Enhance user data with additional information
        users = response.data if response.data else []
        for user in users:
            # Calculate total XP across all pillars
            try:
                xp_response = supabase.table('user_skill_xp')\
                    .select('total_xp')\
                    .eq('user_id', user['id'])\
                    .execute()
                
                user['total_xp'] = sum(x['total_xp'] for x in xp_response.data) if xp_response.data else 0
            except:
                user['total_xp'] = 0
            
            # Set default status if not present
            if 'status' not in user:
                user['status'] = 'active'
        
        return jsonify({
            'users': users,
            'total': response.count if hasattr(response, 'count') else len(users),
            'page': page,
            'limit': limit
        }), 200
        
    except Exception as e:
        print(f"Error fetching users: {str(e)}")
        return jsonify({'error': str(e)}), 400

@bp.route('/users/<user_id>', methods=['GET'])
@require_admin
def get_user_details(admin_id, user_id):
    """Get detailed information about a specific user including activity and XP"""
    supabase = get_supabase_admin_client()
    
    try:
        # Get user basic info
        user_response = supabase.table('users')\
            .select('*')\
            .eq('id', user_id)\
            .single()\
            .execute()
        
        if not user_response.data:
            return jsonify({'error': 'User not found'}), 404
        
        user_data = user_response.data
        
        # Get XP by pillar
        xp_response = supabase.table('user_skill_xp')\
            .select('skill_category, total_xp')\
            .eq('user_id', user_id)\
            .execute()
        
        xp_by_pillar = {}
        total_xp = 0
        if xp_response.data:
            for xp in xp_response.data:
                pillar = xp['skill_category']
                # Map old categories to new pillars if needed
                pillar_map = {
                    'reading_writing': 'communication',
                    'thinking_skills': 'critical_thinking',
                    'personal_growth': 'creativity',
                    'life_skills': 'practical_skills',
                    'making_creating': 'creativity',
                    'world_understanding': 'cultural_literacy'
                }
                mapped_pillar = pillar_map.get(pillar, pillar)
                
                if mapped_pillar not in xp_by_pillar:
                    xp_by_pillar[mapped_pillar] = 0
                xp_by_pillar[mapped_pillar] += xp['total_xp']
                total_xp += xp['total_xp']
        
        # Get completed quests
        quests_response = supabase.table('user_quests')\
            .select('*, quests(title)')\
            .eq('user_id', user_id)\
            .not_.is_('completed_at', 'null')\
            .order('completed_at', desc=True)\
            .limit(10)\
            .execute()
        
        completed_quests = []
        quests_completed = 0
        if quests_response.data:
            quests_completed = len(quests_response.data)
            for q in quests_response.data:
                # Calculate XP earned (would need to sum from quest_skill_xp or quest_xp_awards)
                xp_earned = 0
                if q.get('quest_id'):
                    try:
                        xp_awards = supabase.table('quest_skill_xp')\
                            .select('xp_amount')\
                            .eq('quest_id', q['quest_id'])\
                            .execute()
                        if xp_awards.data:
                            xp_earned = sum(award['xp_amount'] for award in xp_awards.data)
                    except:
                        pass
                
                completed_quests.append({
                    'id': q['quest_id'],
                    'title': q['quests']['title'] if q.get('quests') else 'Unknown Quest',
                    'completed_at': q['completed_at'],
                    'xp_earned': xp_earned
                })
        
        # Get last active time from activity log
        try:
            activity_response = supabase.table('activity_log')\
                .select('created_at')\
                .eq('user_id', user_id)\
                .order('created_at', desc=True)\
                .limit(1)\
                .execute()
            
            last_active = activity_response.data[0]['created_at'] if activity_response.data else user_data.get('created_at')
        except:
            last_active = user_data.get('created_at')
        
        return jsonify({
            **user_data,
            'xp_by_pillar': xp_by_pillar,
            'total_xp': total_xp,
            'completed_quests': completed_quests,
            'quests_completed': quests_completed,
            'last_active': last_active,
            'current_streak': 0  # Would need to calculate from activity log
        }), 200
        
    except Exception as e:
        print(f"Error fetching user details: {str(e)}")
        return jsonify({'error': str(e)}), 400

@bp.route('/users/<user_id>', methods=['PUT'])
@require_admin
def update_user_profile(admin_id, user_id):
    """Update user profile information"""
    supabase = get_supabase_admin_client()
    data = request.json
    
    try:
        # Only allow updating certain fields
        allowed_fields = ['first_name', 'last_name', 'email', 'avatar_url']
        update_data = {k: v for k, v in data.items() if k in allowed_fields}
        
        if not update_data:
            return jsonify({'error': 'No valid fields to update'}), 400
        
        # Update user in database
        response = supabase.table('users')\
            .update(update_data)\
            .eq('id', user_id)\
            .execute()
        
        # If email was changed, update auth user as well
        if 'email' in update_data:
            try:
                # Update auth user email using admin client
                supabase.auth.admin.update_user_by_id(
                    user_id,
                    {'email': update_data['email']}
                )
            except Exception as e:
                print(f"Warning: Could not update auth email: {e}")
        
        return jsonify({'message': 'User profile updated successfully'}), 200
        
    except Exception as e:
        print(f"Error updating user profile: {str(e)}")
        return jsonify({'error': str(e)}), 400

@bp.route('/users/<user_id>/subscription', methods=['POST'])
@require_admin
def update_user_subscription(admin_id, user_id):
    """Update user subscription tier and expiration"""
    supabase = get_supabase_admin_client()
    data = request.json
    
    try:
        tier = data.get('tier', 'free')
        expires = data.get('expires')  # Optional expiration date
        
        if tier not in ['free', 'creator', 'visionary']:
            return jsonify({'error': 'Invalid subscription tier'}), 400
        
        update_data = {'subscription_tier': tier}
        if expires:
            update_data['subscription_expires'] = expires
        elif tier == 'free':
            # Clear expiration for free tier
            update_data['subscription_expires'] = None
        
        # Update user subscription
        response = supabase.table('users')\
            .update(update_data)\
            .eq('id', user_id)\
            .execute()
        
        # Log the subscription change
        try:
            supabase.table('activity_log').insert({
                'user_id': user_id,
                'event_type': 'subscription_changed',
                'event_details': {
                    'new_tier': tier,
                    'changed_by': admin_id,
                    'expires': expires
                }
            }).execute()
        except:
            pass  # Activity log is optional
        
        return jsonify({'message': f'Subscription updated to {tier}'}), 200
        
    except Exception as e:
        print(f"Error updating subscription: {str(e)}")
        return jsonify({'error': str(e)}), 400

@bp.route('/users/<user_id>/reset-password', methods=['POST'])
@require_admin
def reset_user_password(admin_id, user_id):
    """Send password reset email to user"""
    supabase = get_supabase_admin_client()
    
    try:
        # Get user email
        user_response = supabase.table('users')\
            .select('email')\
            .eq('id', user_id)\
            .single()\
            .execute()
        
        if not user_response.data:
            return jsonify({'error': 'User not found'}), 404
        
        email = user_response.data['email']
        
        # Send password reset email using Supabase Auth
        try:
            # Generate password reset link
            supabase.auth.admin.generate_link({
                'type': 'recovery',
                'email': email
            })
            
            # Note: In production, you'd send this link via email service
            # For now, we'll just log it
            print(f"Password reset requested for {email}")
            
            return jsonify({'message': 'Password reset email sent'}), 200
        except Exception as e:
            # Fallback: just mark that reset was requested
            print(f"Could not send reset email: {e}")
            return jsonify({'message': 'Password reset requested (manual email required)'}), 200
            
    except Exception as e:
        print(f"Error resetting password: {str(e)}")
        return jsonify({'error': str(e)}), 400

@bp.route('/users/<user_id>/toggle-status', methods=['POST'])
@require_admin
def toggle_user_status(admin_id, user_id):
    """Enable or disable a user account"""
    supabase = get_supabase_admin_client()
    
    try:
        # Get current status
        user_response = supabase.table('users')\
            .select('status')\
            .eq('id', user_id)\
            .single()\
            .execute()
        
        if not user_response.data:
            return jsonify({'error': 'User not found'}), 404
        
        current_status = user_response.data.get('status', 'active')
        new_status = 'disabled' if current_status == 'active' else 'active'
        
        # Update status in users table
        supabase.table('users')\
            .update({'status': new_status})\
            .eq('id', user_id)\
            .execute()
        
        # Also ban/unban in auth if needed
        try:
            if new_status == 'disabled':
                supabase.auth.admin.update_user_by_id(
                    user_id,
                    {'ban_duration': 'none'}  # Permanent ban
                )
            else:
                # Unban user
                supabase.auth.admin.update_user_by_id(
                    user_id,
                    {'ban_duration': None}
                )
        except Exception as e:
            print(f"Warning: Could not update auth ban status: {e}")
        
        # Log the action
        try:
            supabase.table('activity_log').insert({
                'user_id': user_id,
                'event_type': 'account_status_changed',
                'event_details': {
                    'new_status': new_status,
                    'changed_by': admin_id
                }
            }).execute()
        except:
            pass
        
        return jsonify({
            'message': f'User account {new_status}',
            'new_status': new_status
        }), 200
        
    except Exception as e:
        print(f"Error toggling user status: {str(e)}")
        return jsonify({'error': str(e)}), 400

@bp.route('/users/<user_id>', methods=['DELETE'])
@require_admin
def delete_user_account(admin_id, user_id):
    """Permanently delete a user account and all associated data"""
    supabase = get_supabase_admin_client()
    
    try:
        # Delete in order of dependencies
        
        # 1. Delete learning logs
        try:
            user_quests = supabase.table('user_quests').select('id').eq('user_id', user_id).execute()
            if user_quests.data:
                for uq in user_quests.data:
                    supabase.table('learning_logs').delete().eq('user_quest_id', uq['id']).execute()
        except:
            pass
        
        # 2. Delete submissions and evidence
        try:
            user_quests = supabase.table('user_quests').select('id').eq('user_id', user_id).execute()
            if user_quests.data:
                for uq in user_quests.data:
                    submissions = supabase.table('submissions').select('id').eq('user_quest_id', uq['id']).execute()
                    if submissions.data:
                        for sub in submissions.data:
                            supabase.table('submission_evidence').delete().eq('submission_id', sub['id']).execute()
                        supabase.table('submissions').delete().eq('user_quest_id', uq['id']).execute()
        except:
            pass
        
        # 3. Delete user quests
        try:
            supabase.table('user_quests').delete().eq('user_id', user_id).execute()
        except:
            pass
        
        # 4. Delete user XP records
        try:
            supabase.table('user_skill_xp').delete().eq('user_id', user_id).execute()
            supabase.table('user_xp').delete().eq('user_id', user_id).execute()
            supabase.table('user_skill_details').delete().eq('user_id', user_id).execute()
        except:
            pass
        
        # 5. Delete activity logs
        try:
            supabase.table('activity_log').delete().eq('user_id', user_id).execute()
        except:
            pass
        
        # 6. Delete community shares
        try:
            supabase.table('community_shares').delete().eq('user_id', user_id).execute()
        except:
            pass
        
        # 7. Delete from users table
        supabase.table('users').delete().eq('id', user_id).execute()
        
        # 8. Delete from auth
        try:
            supabase.auth.admin.delete_user(user_id)
        except Exception as e:
            print(f"Warning: Could not delete auth user: {e}")
        
        return jsonify({'message': 'User account deleted successfully'}), 200
        
    except Exception as e:
        print(f"Error deleting user: {str(e)}")
        return jsonify({'error': str(e)}), 400

@bp.route('/users/bulk-email', methods=['POST'])
@require_admin
def send_bulk_email(admin_id):
    """Send email to multiple users"""
    supabase = get_supabase_admin_client()
    data = request.json
    
    try:
        user_ids = data.get('user_ids', [])
        subject = data.get('subject')
        message = data.get('message')
        
        if not user_ids or not subject or not message:
            return jsonify({'error': 'user_ids, subject, and message are required'}), 400
        
        # Get user emails and info
        users_response = supabase.table('users')\
            .select('id, email, first_name, last_name')\
            .in_('id', user_ids)\
            .execute()
        
        if not users_response.data:
            return jsonify({'error': 'No valid users found'}), 404
        
        # Process email templates with user data
        emails_sent = []
        emails_failed = []
        
        for user in users_response.data:
            try:
                # Replace template variables
                personalized_message = message\
                    .replace('{{first_name}}', user.get('first_name', ''))\
                    .replace('{{last_name}}', user.get('last_name', ''))\
                    .replace('{{email}}', user.get('email', ''))
                
                # Get user's total XP if needed
                if '{{total_xp}}' in personalized_message:
                    xp_response = supabase.table('user_skill_xp')\
                        .select('total_xp')\
                        .eq('user_id', user['id'])\
                        .execute()
                    total_xp = sum(x['total_xp'] for x in xp_response.data) if xp_response.data else 0
                    personalized_message = personalized_message.replace('{{total_xp}}', str(total_xp))
                
                # TODO: Integrate with actual email service (SendGrid, AWS SES, etc.)
                # For now, we'll just log it
                print(f"Email to {user['email']}: {subject}")
                print(f"Message: {personalized_message}")
                
                emails_sent.append(user['email'])
                
                # Log the email send
                try:
                    supabase.table('activity_log').insert({
                        'user_id': user['id'],
                        'event_type': 'email_sent',
                        'event_details': {
                            'subject': subject,
                            'sent_by': admin_id
                        }
                    }).execute()
                except:
                    pass
                    
            except Exception as e:
                print(f"Failed to send to {user['email']}: {e}")
                emails_failed.append(user['email'])
        
        return jsonify({
            'message': f'Emails sent to {len(emails_sent)} users',
            'sent': emails_sent,
            'failed': emails_failed
        }), 200
        
    except Exception as e:
        print(f"Error sending bulk email: {str(e)}")
        return jsonify({'error': str(e)}), 400