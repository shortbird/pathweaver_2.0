"""
Admin FERPA Compliance Routes

Provides endpoints for FERPA disclosure reporting and student data access auditing.
Required for educational institutions to track and report on student record access.
"""

from flask import Blueprint, request, jsonify, Response
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
import csv
import io

from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from utils.access_logger import AccessLogger
from utils.logger import get_logger

logger = get_logger(__name__)
bp = Blueprint('admin_ferpa_compliance', __name__)


@bp.route('/api/admin/ferpa/disclosure-report', methods=['GET'])
@require_admin
def get_disclosure_report(user_id: str):
    """
    Generate FERPA disclosure report showing all access to student records.

    Query parameters:
        student_id: Optional UUID to filter by specific student
        start_date: ISO format date (default: 30 days ago)
        end_date: ISO format date (default: now)
        format: 'json' or 'csv' (default: 'json')
        limit: Max records for JSON (default: 100, max: 1000)
        page: Page number for JSON pagination (default: 1)

    Returns:
        200: Disclosure report in requested format
        400: Invalid parameters
        403: Not authorized (requires admin role)
        500: Server error
    """
    try:
        # Parse date parameters
        end_date_str = request.args.get('end_date')
        start_date_str = request.args.get('start_date')

        if end_date_str:
            end_date = datetime.fromisoformat(end_date_str.replace('Z', '+00:00'))
        else:
            end_date = datetime.utcnow()

        if start_date_str:
            start_date = datetime.fromisoformat(start_date_str.replace('Z', '+00:00'))
        else:
            start_date = end_date - timedelta(days=30)

        # Parse optional filters
        student_id = request.args.get('student_id')
        export_format = request.args.get('format', 'json').lower()

        # Validate format
        if export_format not in ['json', 'csv']:
            return jsonify({'error': 'Format must be either "json" or "csv"'}), 400

        # Build query
        supabase = get_supabase_admin_client()
        query = supabase.table('student_access_logs').select('*')

        # Apply filters
        if student_id:
            query = query.eq('student_id', student_id)

        query = query.gte('access_timestamp', start_date.isoformat())
        query = query.lte('access_timestamp', end_date.isoformat())
        query = query.order('access_timestamp', desc=True)

        # For JSON, apply pagination
        if export_format == 'json':
            page = max(1, int(request.args.get('page', 1)))
            limit = min(1000, max(1, int(request.args.get('limit', 100))))
            offset = (page - 1) * limit

            # Get total count first
            count_result = supabase.table('student_access_logs').select('id', count='exact')
            if student_id:
                count_result = count_result.eq('student_id', student_id)
            count_result = count_result.gte('access_timestamp', start_date.isoformat())
            count_result = count_result.lte('access_timestamp', end_date.isoformat())
            count_data = count_result.execute()
            total = count_data.count

            # Apply pagination
            query = query.range(offset, offset + limit - 1)

        # Execute query
        result = query.execute()
        logs = result.data

        # Enrich with user details
        if logs:
            # Get unique user IDs
            student_ids = list(set(log['student_id'] for log in logs if log.get('student_id')))
            accessor_ids = list(set(log['accessor_id'] for log in logs if log.get('accessor_id')))
            all_user_ids = list(set(student_ids + accessor_ids))

            if all_user_ids:
                users = supabase.table('users') \
                    .select('id, email, display_name, first_name, last_name, role') \
                    .in_('id', all_user_ids) \
                    .execute()

                user_map = {user['id']: user for user in users.data}

                # Enrich logs
                for log in logs:
                    log['student_info'] = user_map.get(log['student_id'], {})
                    log['accessor_info'] = user_map.get(log['accessor_id'], {}) if log.get('accessor_id') else None

        # Return based on format
        if export_format == 'csv':
            return _generate_csv_report(logs, start_date, end_date)
        else:
            # JSON response
            response_data = {
                'report_metadata': {
                    'generated_at': datetime.utcnow().isoformat() + 'Z',
                    'start_date': start_date.isoformat() + 'Z',
                    'end_date': end_date.isoformat() + 'Z',
                    'student_filter': student_id,
                    'total_records': total if export_format == 'json' else len(logs)
                },
                'logs': logs
            }

            if export_format == 'json':
                response_data['pagination'] = {
                    'page': page,
                    'limit': limit,
                    'total': total,
                    'pages': (total + limit - 1) // limit
                }

            return jsonify(response_data), 200

    except ValueError as e:
        logger.error(f"[FERPA] Invalid parameters: {str(e)}")
        return jsonify({'error': f'Invalid parameters: {str(e)}'}), 400
    except Exception as e:
        logger.error(f"[FERPA] Error generating disclosure report: {str(e)}")
        return jsonify({'error': 'Failed to generate disclosure report'}), 500


@bp.route('/api/admin/ferpa/student-access-summary/<student_id>', methods=['GET'])
@require_admin
def get_student_access_summary(user_id: str, student_id: str):
    """
    Get summary of who has accessed a specific student's records.

    Query parameters:
        start_date: ISO format date (default: 90 days ago)
        end_date: ISO format date (default: now)

    Returns:
        200: Summary grouped by accessor
        400: Invalid parameters
        403: Not authorized
        404: Student not found
        500: Server error
    """
    try:
        # Verify student exists
        supabase = get_supabase_admin_client()
        student = supabase.table('users').select('id, email, display_name').eq('id', student_id).execute()

        if not student.data:
            return jsonify({'error': 'Student not found'}), 404

        # Parse dates
        end_date_str = request.args.get('end_date')
        start_date_str = request.args.get('start_date')

        if end_date_str:
            end_date = datetime.fromisoformat(end_date_str.replace('Z', '+00:00'))
        else:
            end_date = datetime.utcnow()

        if start_date_str:
            start_date = datetime.fromisoformat(start_date_str.replace('Z', '+00:00'))
        else:
            start_date = end_date - timedelta(days=90)

        # Get summary from AccessLogger
        summary = AccessLogger.get_access_summary_by_accessor(
            student_id=student_id,
            start_date=start_date,
            end_date=end_date
        )

        # Enrich with full user details
        if summary:
            accessor_ids = [s['accessor_id'] for s in summary if s['accessor_id'] != 'public']
            if accessor_ids:
                users = supabase.table('users') \
                    .select('id, email, display_name, first_name, last_name, role') \
                    .in_('id', accessor_ids) \
                    .execute()

                user_map = {user['id']: user for user in users.data}

                for item in summary:
                    if item['accessor_id'] != 'public':
                        item['accessor_details'] = user_map.get(item['accessor_id'], {})
                    else:
                        item['accessor_details'] = {
                            'display_name': 'Public Access',
                            'role': 'public'
                        }

        return jsonify({
            'student': student.data[0],
            'period': {
                'start_date': start_date.isoformat() + 'Z',
                'end_date': end_date.isoformat() + 'Z'
            },
            'access_summary': summary,
            'total_accesses': sum(s['access_count'] for s in summary),
            'unique_accessors': len(summary)
        }), 200

    except ValueError as e:
        logger.error(f"[FERPA] Invalid parameters: {str(e)}")
        return jsonify({'error': f'Invalid parameters: {str(e)}'}), 400
    except Exception as e:
        logger.error(f"[FERPA] Error getting access summary: {str(e)}")
        return jsonify({'error': 'Failed to get access summary'}), 500


@bp.route('/api/admin/ferpa/access-purposes', methods=['GET'])
@require_admin
def get_access_purposes(user_id: str):
    """
    Get list of valid FERPA access purposes.

    Returns:
        200: List of valid purposes with descriptions
    """
    purposes = [
        {
            'value': 'legitimate_educational_interest',
            'label': 'Legitimate Educational Interest',
            'description': 'School officials with legitimate educational interest (teachers, advisors, staff)'
        },
        {
            'value': 'parent_request',
            'label': 'Parent/Guardian Request',
            'description': 'Parent or legal guardian accessing dependent student records'
        },
        {
            'value': 'student_request',
            'label': 'Student Request',
            'description': 'Student accessing their own educational records'
        },
        {
            'value': 'directory_info',
            'label': 'Directory Information',
            'description': 'Public directory information (name, achievements, portfolio)'
        },
        {
            'value': 'admin_review',
            'label': 'Administrative Review',
            'description': 'Platform administrators reviewing for quality assurance or support'
        },
        {
            'value': 'observer_view',
            'label': 'Observer Access',
            'description': 'Authorized observer (mentor, family friend) viewing student progress'
        },
        {
            'value': 'compliance_audit',
            'label': 'Compliance Audit',
            'description': 'Compliance or security audit of student records'
        }
    ]

    return jsonify({'purposes': purposes}), 200


def _generate_csv_report(logs: List[Dict[str, Any]], start_date: datetime, end_date: datetime) -> Response:
    """
    Generate CSV export of disclosure report.

    Args:
        logs: List of access log entries
        start_date: Report start date
        end_date: Report end date

    Returns:
        Response with CSV file
    """
    # Create CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)

    # Write header
    writer.writerow([
        'Access Timestamp',
        'Student Email',
        'Student Name',
        'Accessor Email',
        'Accessor Name',
        'Accessor Role',
        'Data Type',
        'Fields Accessed',
        'Purpose',
        'IP Address',
        'Endpoint'
    ])

    # Write data rows
    for log in logs:
        student_info = log.get('student_info', {})
        accessor_info = log.get('accessor_info', {})
        data_accessed = log.get('data_accessed', {})

        writer.writerow([
            log.get('access_timestamp', ''),
            student_info.get('email', ''),
            student_info.get('display_name', ''),
            accessor_info.get('email', 'N/A') if accessor_info else 'Public',
            accessor_info.get('display_name', 'N/A') if accessor_info else 'Public',
            log.get('accessor_role', ''),
            data_accessed.get('type', ''),
            ', '.join(data_accessed.get('fields', [])),
            log.get('purpose', ''),
            log.get('ip_address', ''),
            data_accessed.get('endpoint', '')
        ])

    # Prepare response
    output.seek(0)
    filename = f"ferpa_disclosure_report_{start_date.strftime('%Y%m%d')}_{end_date.strftime('%Y%m%d')}.csv"

    return Response(
        output.getvalue(),
        mimetype='text/csv',
        headers={
            'Content-Disposition': f'attachment; filename={filename}'
        }
    )
