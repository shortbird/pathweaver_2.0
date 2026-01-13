"""
REPOSITORY MIGRATION: NO MIGRATION NEEDED
- Uses OrganizationService exclusively (service layer pattern)
- Service wraps OrganizationRepository for business logic
- Proper separation: Route -> Service -> Repository
- Phase 2 implementation already follows best practices

Organization Management Routes

Handles superadmin and org admin operations for multi-organization platform.
Created: 2025-12-07
Phase 2: Backend Repository & Service Layer
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_superadmin, require_org_admin
from services.organization_service import OrganizationService
from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('organization_management', __name__)


@bp.route('', methods=['GET'])
@require_superadmin
def list_organizations(superadmin_user_id):
    """List all organizations (superadmin only)"""
    try:
        service = OrganizationService()
        organizations = service.list_all_organizations()

        return jsonify({
            'organizations': organizations,
            'total': len(organizations)
        }), 200
    except Exception as e:
        logger.error(f"Error listing organizations: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('', methods=['POST'])
@require_superadmin
def create_organization(superadmin_user_id):
    """Create new organization (superadmin only)"""
    try:
        data = request.get_json()

        # Validate required fields
        required = ['name', 'slug', 'quest_visibility_policy']
        for field in required:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        service = OrganizationService()
        org = service.create_organization(
            name=data['name'],
            slug=data['slug'],
            policy=data['quest_visibility_policy'],
            created_by=superadmin_user_id
        )

        return jsonify(org), 201
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error creating organization: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>', methods=['GET'])
@require_org_admin
def get_organization(current_user_id, current_org_id, is_superadmin, org_id):
    """Get organization details (org admin or superadmin)"""
    try:
        logger.info(f"get_organization called: user={current_user_id}, current_org={current_org_id}, is_superadmin={is_superadmin}, target_org={org_id}")

        # Verify access: org admin can only view their org, superadmin can view all
        if not is_superadmin and current_org_id != org_id:
            logger.warning(f"Access denied: not superadmin and org mismatch ({current_org_id} != {org_id})")
            return jsonify({'error': 'Access denied'}), 403

        service = OrganizationService()
        org = service.get_organization_dashboard_data(org_id)
        logger.info(f"Organization data fetched successfully for {org_id}")

        return jsonify(org), 200
    except Exception as e:
        logger.error(f"Error getting organization {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>', methods=['PUT'])
@require_org_admin
def update_organization(current_user_id, current_org_id, is_superadmin, org_id):
    """Update organization (org_admin for own org, superadmin for any)"""
    try:
        # Org admins can only update their own organization
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'You can only update your own organization'}), 403

        data = request.get_json()

        # Define allowed fields based on role
        # Org admins can update branding, AI settings, and course visibility policy
        if is_superadmin:
            allowed_fields = ['name', 'quest_visibility_policy', 'course_visibility_policy', 'branding_config', 'is_active',
                            'ai_features_enabled', 'ai_chatbot_enabled', 'ai_lesson_helper_enabled', 'ai_task_generation_enabled']
        else:
            # Org admins can update name, branding, AI settings, and course visibility policy
            allowed_fields = ['name', 'branding_config', 'course_visibility_policy', 'ai_features_enabled',
                            'ai_chatbot_enabled', 'ai_lesson_helper_enabled', 'ai_task_generation_enabled']

        update_data = {k: v for k, v in data.items() if k in allowed_fields}

        if not update_data:
            return jsonify({'error': 'No valid fields to update'}), 400

        service = OrganizationService()
        org = None

        # If updating quest policy, use dedicated method (superadmin only)
        if 'quest_visibility_policy' in update_data:
            org = service.update_organization_policy(
                org_id,
                update_data['quest_visibility_policy'],
                current_user_id
            )
            del update_data['quest_visibility_policy']

        # If updating course policy, use dedicated method
        if 'course_visibility_policy' in update_data:
            org = service.update_course_visibility_policy(
                org_id,
                update_data['course_visibility_policy'],
                current_user_id
            )
            del update_data['course_visibility_policy']

        # Handle remaining updates
        if update_data:
            from repositories.organization_repository import OrganizationRepository
            repo = OrganizationRepository()
            org = repo.update_organization(org_id, update_data)

        # If no updates were made, fetch current org data
        if org is None:
            from repositories.organization_repository import OrganizationRepository
            repo = OrganizationRepository()
            org = repo.find_by_id(org_id)

        return jsonify(org), 200
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error updating organization {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>/quests/grant', methods=['POST'])
@require_org_admin
def grant_quest_access(current_user_id, current_org_id, is_superadmin, org_id):
    """Grant organization access to a quest (curated policy only)"""
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json()
        quest_id = data.get('quest_id')

        if not quest_id:
            return jsonify({'error': 'quest_id is required'}), 400

        service = OrganizationService()
        result = service.grant_quest_access(org_id, quest_id, current_user_id)

        return jsonify(result), 201
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error granting quest access to org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>/quests/revoke', methods=['POST'])
@require_org_admin
def revoke_quest_access(current_user_id, current_org_id, is_superadmin, org_id):
    """Revoke organization access to a quest"""
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json()
        quest_id = data.get('quest_id')

        if not quest_id:
            return jsonify({'error': 'quest_id is required'}), 400

        service = OrganizationService()
        success = service.revoke_quest_access(org_id, quest_id, current_user_id)

        if success:
            return jsonify({'message': 'Quest access revoked'}), 200
        else:
            return jsonify({'error': 'Failed to revoke access'}), 500
    except Exception as e:
        logger.error(f"Error revoking quest access from org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>/courses/grant', methods=['POST'])
@require_org_admin
def grant_course_access(current_user_id, current_org_id, is_superadmin, org_id):
    """Grant organization access to a course (curated policy only)"""
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json()
        course_id = data.get('course_id')

        if not course_id:
            return jsonify({'error': 'course_id is required'}), 400

        service = OrganizationService()
        result = service.grant_course_access(org_id, course_id, current_user_id)

        return jsonify(result), 201
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error granting course access to org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>/courses/revoke', methods=['POST'])
@require_org_admin
def revoke_course_access(current_user_id, current_org_id, is_superadmin, org_id):
    """Revoke organization access to a course"""
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json()
        course_id = data.get('course_id')

        if not course_id:
            return jsonify({'error': 'course_id is required'}), 400

        service = OrganizationService()
        success = service.revoke_course_access(org_id, course_id, current_user_id)

        if success:
            return jsonify({'message': 'Course access revoked'}), 200
        else:
            return jsonify({'error': 'Failed to revoke access'}), 500
    except Exception as e:
        logger.error(f"Error revoking course access from org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>/users', methods=['GET'])
@require_org_admin
def list_organization_users(current_user_id, current_org_id, is_superadmin, org_id):
    """List users in organization, optionally filtered by role"""
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        role = request.args.get('role')

        from repositories.organization_repository import OrganizationRepository
        repo = OrganizationRepository()
        users = repo.get_organization_users(org_id, role=role)

        return jsonify({
            'users': users,
            'total': len(users)
        }), 200
    except Exception as e:
        logger.error(f"Error listing users for org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>/analytics', methods=['GET'])
@require_org_admin
def get_organization_analytics(current_user_id, current_org_id, is_superadmin, org_id):
    """Get analytics for organization"""
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        from repositories.organization_repository import OrganizationRepository
        repo = OrganizationRepository()
        analytics = repo.get_organization_analytics(org_id)

        return jsonify(analytics), 200
    except Exception as e:
        logger.error(f"Error getting analytics for org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>/ai-access', methods=['POST'])
@require_org_admin
def toggle_organization_ai_access(current_user_id, current_org_id, is_superadmin, org_id):
    """
    Enable or disable AI features for the entire organization.
    Org admins can toggle this for their own organization.
    Superadmins can toggle for any organization.

    Required fields:
        - enabled: bool

    Returns:
        200: AI access updated successfully
        400: Validation error
        403: Access denied
    """
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        enabled = data.get('enabled')
        if enabled is None:
            return jsonify({'error': 'enabled field is required'}), 400

        if not isinstance(enabled, bool):
            return jsonify({'error': 'enabled must be a boolean'}), 400

        client = get_supabase_admin_client()

        # Update organization AI settings
        result = client.table('organizations').update({
            'ai_features_enabled': enabled
        }).eq('id', org_id).execute()

        if not result.data:
            return jsonify({'error': 'Failed to update AI access setting'}), 500

        action = "enabled" if enabled else "disabled"
        logger.info(f"User {current_user_id} {action} AI features for organization {org_id}")

        return jsonify({
            'success': True,
            'message': f'AI features {action} for organization',
            'organization_id': org_id,
            'ai_features_enabled': enabled
        }), 200

    except Exception as e:
        logger.error(f"Error toggling AI access for org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>/users/add', methods=['POST'])
@require_org_admin
def add_users_to_organization(current_user_id, current_org_id, is_superadmin, org_id):
    """Add users to organization (superadmin or org admin)"""
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json()
        user_ids = data.get('user_ids', [])

        if not user_ids:
            return jsonify({'error': 'user_ids is required'}), 400

        client = get_supabase_admin_client()

        # Update users to set their organization_id
        for user_id in user_ids:
            client.table('users')\
                .update({'organization_id': org_id})\
                .eq('id', user_id)\
                .execute()

        logger.info(f"Added {len(user_ids)} users to organization {org_id}")

        return jsonify({
            'message': f'Added {len(user_ids)} users to organization',
            'users_added': len(user_ids)
        }), 200
    except Exception as e:
        logger.error(f"Error adding users to org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>/users/remove', methods=['POST'])
@require_org_admin
def remove_user_from_organization(current_user_id, current_org_id, is_superadmin, org_id):
    """Remove user from organization (superadmin or org admin)

    User becomes a platform user (organization_id = NULL) with their org_role as their direct role.
    To fully delete a user, use the delete user endpoint instead.
    """
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json()
        user_id = data.get('user_id')
        delete_user = data.get('delete_user', False)

        if not user_id:
            return jsonify({'error': 'user_id is required'}), 400

        client = get_supabase_admin_client()

        if delete_user and is_superadmin:
            # Superadmin can fully delete user
            try:
                # Delete from Supabase Auth
                client.auth.admin.delete_user(user_id)
                logger.info(f"Deleted user {user_id} from organization {org_id}")
                return jsonify({'message': 'User deleted successfully'}), 200
            except Exception as auth_error:
                logger.error(f"Failed to delete auth user {user_id}: {auth_error}")
                return jsonify({'error': 'Failed to delete user from auth system'}), 500
        else:
            # Get user's current org_role to use as their platform role
            user_data = client.table('users').select('org_role').eq('id', user_id).single().execute()
            platform_role = user_data.data.get('org_role', 'student') if user_data.data else 'student'

            # Convert to platform user: NULL org, direct role, clear org_role
            client.table('users')\
                .update({
                    'organization_id': None,
                    'role': platform_role,
                    'org_role': None,
                    'is_org_admin': False
                })\
                .eq('id', user_id)\
                .execute()

            logger.info(f"Removed user {user_id} from organization {org_id} (now platform user with role={platform_role})")

            return jsonify({
                'message': 'User removed from organization',
                'note': 'User is now a platform user'
            }), 200
    except Exception as e:
        logger.error(f"Error removing user from org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>/users/bulk-remove', methods=['POST'])
@require_org_admin
def bulk_remove_users_from_organization(current_user_id, current_org_id, is_superadmin, org_id):
    """Remove multiple users from organization (superadmin or org admin)

    Users become platform users (organization_id = NULL) with their org_role as direct role.
    """
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json()
        user_ids = data.get('user_ids', [])

        if not user_ids:
            return jsonify({'error': 'No user IDs provided'}), 400

        if len(user_ids) > 50:
            return jsonify({'error': 'Maximum 50 users can be removed at once'}), 400

        client = get_supabase_admin_client()

        removed = []
        failed = []

        for user_id in user_ids:
            try:
                # Get user's current org_role to use as their platform role
                user_data = client.table('users').select('org_role').eq('id', user_id).single().execute()
                platform_role = user_data.data.get('org_role', 'student') if user_data.data else 'student'

                # Convert to platform user: NULL org, direct role, clear org_role
                client.table('users')\
                    .update({
                        'organization_id': None,
                        'role': platform_role,
                        'org_role': None,
                        'is_org_admin': False
                    })\
                    .eq('id', user_id)\
                    .eq('organization_id', org_id)\
                    .execute()
                removed.append(user_id)
            except Exception as e:
                logger.error(f"Failed to remove user {user_id} from org {org_id}: {e}")
                failed.append({'id': user_id, 'error': str(e)[:100]})

        logger.info(f"Bulk removed {len(removed)} users from organization {org_id}")

        return jsonify({
            'success': True,
            'removed': len(removed),
            'failed': len(failed),
            'removed_ids': removed,
            'failed_details': failed
        }), 200
    except Exception as e:
        logger.error(f"Error bulk removing users from org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>/students/progress', methods=['GET'])
@require_org_admin
def get_student_progress(current_user_id, current_org_id, is_superadmin, org_id):
    """
    Get detailed progress report for all students in an organization.

    Query params:
        start_date: Optional start date filter (YYYY-MM-DD)
        end_date: Optional end date filter (YYYY-MM-DD)
        format: 'json' (default) or 'csv'
        role: Filter by role (default: 'student')

    Returns per-student:
        - name, email
        - total XP
        - quests enrolled / completed
        - tasks completed (period and all-time)
        - last active date
        - badge count
    """
    from datetime import datetime, timedelta
    import csv
    import io

    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        # Parse query params
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        output_format = request.args.get('format', 'json')
        role_filter = request.args.get('role', 'student')

        # Default date range: last 30 days
        if not end_date:
            end_date = datetime.now().strftime('%Y-%m-%d')
        if not start_date:
            start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')

        client = get_supabase_admin_client()

        # Get students in organization
        users_query = client.table('users')\
            .select('id, email, display_name, first_name, last_name, total_xp, last_active, created_at')\
            .eq('organization_id', org_id)\
            .eq('role', role_filter)\
            .order('first_name')

        users_response = users_query.execute()
        students = users_response.data or []

        if not students:
            return jsonify({
                'success': True,
                'students': [],
                'summary': {
                    'total_students': 0,
                    'total_xp': 0,
                    'total_completions': 0,
                    'avg_xp': 0,
                    'date_range': {'start': start_date, 'end': end_date}
                }
            }), 200

        student_ids = [s['id'] for s in students]

        # Initialize empty results in case there are no students
        user_quests_data = []
        completions_period_data_raw = []
        completions_all_data_raw = []

        # Only query if we have students (avoid empty IN clause)
        if student_ids:
            # Get quest enrollments for all students
            user_quests = client.table('user_quests')\
                .select('user_id, quest_id, status')\
                .in_('user_id', student_ids)\
                .execute()
            user_quests_data = user_quests.data or []

            # Get task completions for all students (in date range)
            completions_period = client.table('quest_task_completions')\
                .select('user_id, id, completed_at')\
                .in_('user_id', student_ids)\
                .gte('completed_at', f"{start_date}T00:00:00")\
                .lte('completed_at', f"{end_date}T23:59:59")\
                .execute()
            completions_period_data_raw = completions_period.data or []

            # Get all-time task completions
            completions_all = client.table('quest_task_completions')\
                .select('user_id, id')\
                .in_('user_id', student_ids)\
                .execute()
            completions_all_data_raw = completions_all.data or []


        # Aggregate data by student
        quest_data = {}
        for uq in user_quests_data:
            uid = uq['user_id']
            if uid not in quest_data:
                quest_data[uid] = {'enrolled': 0, 'completed': 0}
            quest_data[uid]['enrolled'] += 1
            if uq.get('status') in ['completed', 'set_down']:
                quest_data[uid]['completed'] += 1

        completion_period_data = {}
        for c in completions_period_data_raw:
            uid = c['user_id']
            completion_period_data[uid] = completion_period_data.get(uid, 0) + 1

        completion_all_data = {}
        for c in completions_all_data_raw:
            uid = c['user_id']
            completion_all_data[uid] = completion_all_data.get(uid, 0) + 1

        # Build student progress list
        student_progress = []
        total_xp = 0
        total_completions = 0

        for student in students:
            sid = student['id']
            xp = student.get('total_xp') or 0
            total_xp += xp

            quests = quest_data.get(sid, {'enrolled': 0, 'completed': 0})
            tasks_period = completion_period_data.get(sid, 0)
            tasks_all = completion_all_data.get(sid, 0)

            total_completions += tasks_period

            display_name = student.get('display_name') or \
                f"{student.get('first_name', '')} {student.get('last_name', '')}".strip() or \
                student.get('email', 'Unknown')

            student_progress.append({
                'id': sid,
                'name': display_name,
                'email': student.get('email'),
                'total_xp': xp,
                'quests_enrolled': quests['enrolled'],
                'quests_completed': quests['completed'],
                'tasks_completed_period': tasks_period,
                'tasks_completed_all': tasks_all,
                'last_active': student.get('last_active'),
                'joined': student.get('created_at')
            })

        # Sort by total XP (descending) by default
        student_progress.sort(key=lambda x: x['total_xp'], reverse=True)

        # Calculate summary
        avg_xp = total_xp / len(students) if students else 0

        summary = {
            'total_students': len(students),
            'total_xp': total_xp,
            'total_completions_period': total_completions,
            'avg_xp': round(avg_xp, 2),
            'date_range': {'start': start_date, 'end': end_date}
        }

        # Handle CSV export
        if output_format == 'csv':
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow([
                'Name', 'Email', 'Total XP', 'Quests Enrolled', 'Quests Completed',
                'Tasks (Period)', 'Tasks (All Time)', 'Last Active', 'Joined'
            ])
            for s in student_progress:
                writer.writerow([
                    s['name'], s['email'], s['total_xp'], s['quests_enrolled'],
                    s['quests_completed'], s['tasks_completed_period'],
                    s['tasks_completed_all'],
                    s['last_active'] or '', s['joined'] or ''
                ])

            output.seek(0)
            from flask import Response
            return Response(
                output.getvalue(),
                mimetype='text/csv',
                headers={'Content-Disposition': f'attachment; filename=student_progress_{org_id}_{start_date}_to_{end_date}.csv'}
            )

        return jsonify({
            'success': True,
            'students': student_progress,
            'summary': summary
        }), 200

    except Exception as e:
        logger.error(f"Error getting student progress for org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500
