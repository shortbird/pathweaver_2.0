"""
Bulk User Import Routes

Handles CSV-based bulk user import for org admins and superadmins.
Allows microschools to quickly onboard multiple students/staff.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_org_admin
from utils.validation import sanitize_input
from utils.logger import get_logger
from middleware.rate_limiter import rate_limit
import csv
import io
import re
import secrets
import string
from datetime import datetime, date

logger = get_logger(__name__)

bp = Blueprint('bulk_import', __name__, url_prefix='/api/admin/organizations')

# Valid roles that can be assigned via bulk import
VALID_IMPORT_ROLES = ['student', 'parent', 'advisor', 'org_admin', 'observer']


def generate_temp_password(length=12):
    """Generate a secure temporary password"""
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def validate_email(email):
    """Basic email validation"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None


def validate_date_of_birth(dob_str):
    """Validate date of birth format (YYYY-MM-DD)"""
    if not dob_str or not dob_str.strip():
        return True, None  # Optional field
    try:
        dob = datetime.strptime(dob_str.strip(), '%Y-%m-%d').date()
        # Check if date is reasonable (not in future, not too old)
        today = date.today()
        if dob > today:
            return False, "Date of birth cannot be in the future"
        age_days = (today - dob).days
        if age_days < 0 or age_days > 36500:  # ~100 years
            return False, "Invalid date of birth"
        return True, dob.isoformat()
    except ValueError:
        return False, "Invalid date format. Use YYYY-MM-DD"


def parse_csv_file(file_content, expected_headers):
    """Parse CSV content and validate structure"""
    try:
        # Try to detect encoding
        try:
            content = file_content.decode('utf-8')
        except UnicodeDecodeError:
            content = file_content.decode('latin-1')

        # Parse CSV
        reader = csv.DictReader(io.StringIO(content))

        # Normalize headers (lowercase, strip)
        if reader.fieldnames:
            normalized_headers = [h.strip().lower() for h in reader.fieldnames]
        else:
            return None, "CSV file is empty or has no headers"

        # Check required headers
        required = ['email', 'first_name', 'last_name']
        missing = [h for h in required if h not in normalized_headers]
        if missing:
            return None, f"Missing required columns: {', '.join(missing)}"

        rows = []
        for i, row in enumerate(reader):
            # Normalize row keys
            normalized_row = {k.strip().lower(): v.strip() if v else '' for k, v in row.items()}
            normalized_row['_row_number'] = i + 2  # +2 for 1-indexed and header row
            rows.append(normalized_row)

        return rows, None

    except csv.Error as e:
        return None, f"Invalid CSV format: {str(e)}"
    except Exception as e:
        logger.error(f"CSV parsing error: {e}")
        return None, f"Failed to parse CSV: {str(e)}"


def validate_row(row, row_number, existing_emails):
    """Validate a single row of import data"""
    errors = []

    # Required fields
    email = row.get('email', '').strip().lower()
    first_name = row.get('first_name', '').strip()
    last_name = row.get('last_name', '').strip()
    role = row.get('role', 'student').strip().lower()
    dob = row.get('date_of_birth', '').strip()

    # Email validation
    if not email:
        errors.append("Email is required")
    elif not validate_email(email):
        errors.append("Invalid email format")
    elif email in existing_emails:
        errors.append("Duplicate email in import file")

    # Name validation
    if not first_name:
        errors.append("First name is required")
    if not last_name:
        errors.append("Last name is required")

    # Role validation
    if role and role not in VALID_IMPORT_ROLES:
        errors.append(f"Invalid role '{role}'. Valid roles: {', '.join(VALID_IMPORT_ROLES)}")

    # Date of birth validation
    dob_valid, dob_result = validate_date_of_birth(dob)
    if not dob_valid:
        errors.append(dob_result)

    return errors


@bp.route('/<org_id>/users/bulk-import', methods=['POST'])
@require_org_admin
@rate_limit(max_requests=5, window_seconds=300)  # 5 imports per 5 minutes
def bulk_import_users(current_user_id, current_org_id, is_superadmin, org_id):
    """
    Bulk import users from CSV file.

    Expected CSV format:
    email,first_name,last_name,role,date_of_birth
    student1@example.com,John,Doe,student,2012-05-15
    parent1@example.com,Jane,Doe,parent,

    Returns:
    {
        "success": true,
        "created": 15,
        "failed": 2,
        "skipped": 1,
        "results": [
            {"row": 2, "email": "...", "status": "created", "temp_password": "..."},
            {"row": 3, "email": "...", "status": "failed", "error": "..."}
        ]
    }
    """
    # Verify access - org admin can only import to their org
    if not is_superadmin and current_org_id != org_id:
        return jsonify({'error': 'Access denied'}), 403

    # Check for file
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'No file selected'}), 400

    if not file.filename.lower().endswith('.csv'):
        return jsonify({'error': 'File must be a CSV'}), 400

    # Read file content
    try:
        file_content = file.read()
        if len(file_content) > 1024 * 1024:  # 1MB limit
            return jsonify({'error': 'File too large. Maximum size is 1MB'}), 400
    except Exception as e:
        logger.error(f"Failed to read uploaded file: {e}")
        return jsonify({'error': 'Failed to read file'}), 400

    # Parse CSV
    expected_headers = ['email', 'first_name', 'last_name', 'role', 'date_of_birth']
    rows, parse_error = parse_csv_file(file_content, expected_headers)

    if parse_error:
        return jsonify({'error': parse_error}), 400

    if not rows:
        return jsonify({'error': 'CSV file has no data rows'}), 400

    if len(rows) > 100:
        return jsonify({'error': 'Maximum 100 users per import. Please split your file.'}), 400

    # Get option flags
    send_invites = request.form.get('send_invites', 'false').lower() == 'true'

    supabase = get_supabase_admin_client()

    # Get existing emails in the system to check for duplicates
    try:
        existing_result = supabase.table('users').select('email').execute()
        existing_emails_db = {u['email'].lower() for u in existing_result.data if u.get('email')}
    except Exception as e:
        logger.error(f"Failed to fetch existing emails: {e}")
        return jsonify({'error': 'Failed to check existing users'}), 500

    # First pass: validate all rows
    validation_errors = []
    seen_emails = set()

    for row in rows:
        row_num = row['_row_number']
        email = row.get('email', '').strip().lower()

        # Validate row
        row_errors = validate_row(row, row_num, seen_emails)

        # Check if email already exists in database
        if email and email in existing_emails_db:
            row_errors.append("Email already registered in system")

        if row_errors:
            validation_errors.append({
                'row': row_num,
                'email': email or '(empty)',
                'errors': row_errors
            })
        else:
            seen_emails.add(email)

    # If validation fails, return errors without creating any users
    if validation_errors:
        return jsonify({
            'success': False,
            'error': 'Validation failed',
            'validation_errors': validation_errors,
            'total_rows': len(rows),
            'failed_rows': len(validation_errors)
        }), 400

    # Second pass: create users
    # Optimize by batching profile inserts and skill initialization
    results = []
    created_count = 0
    failed_count = 0
    skipped_count = 0

    # Collect successful user data for batch operations
    users_to_insert = []
    skills_to_insert = []

    for row in rows:
        row_num = row['_row_number']
        email = row.get('email', '').strip().lower()
        first_name = sanitize_input(row.get('first_name', '').strip())
        last_name = sanitize_input(row.get('last_name', '').strip())
        role = row.get('role', 'student').strip().lower() or 'student'
        dob = row.get('date_of_birth', '').strip()

        try:
            # Generate temporary password
            temp_password = generate_temp_password()

            # Create auth user via Supabase Auth (must be done one at a time)
            auth_response = supabase.auth.admin.create_user({
                'email': email,
                'password': temp_password,
                'email_confirm': True,  # Auto-confirm for bulk import
                'user_metadata': {
                    'first_name': first_name,
                    'last_name': last_name
                }
            })

            if not auth_response.user:
                results.append({
                    'row': row_num,
                    'email': email,
                    'status': 'failed',
                    'error': 'Failed to create auth user'
                })
                failed_count += 1
                continue

            user_id = auth_response.user.id

            # Prepare user profile for batch insert
            user_data = {
                'id': user_id,
                'email': email,
                'first_name': first_name,
                'last_name': last_name,
                'role': role,
                'organization_id': org_id
            }

            # Add optional date of birth
            if dob:
                user_data['date_of_birth'] = dob
                dob_date = datetime.strptime(dob, '%Y-%m-%d').date()
                age = (date.today() - dob_date).days / 365.25
                if age < 13:
                    user_data['requires_parental_consent'] = True

            users_to_insert.append(user_data)

            # Prepare skill records for batch insert
            skill_categories = ['Arts & Creativity', 'STEM & Logic', 'Life & Wellness',
                               'Language & Communication', 'Society & Culture']
            for pillar in skill_categories:
                skills_to_insert.append({
                    'user_id': user_id,
                    'pillar': pillar,
                    'xp_amount': 0
                })

            results.append({
                'row': row_num,
                'email': email,
                'status': 'created',
                'temp_password': temp_password,
                'user_id': user_id
            })
            created_count += 1

        except Exception as e:
            error_str = str(e).lower()

            if 'already registered' in error_str or 'already exists' in error_str:
                results.append({
                    'row': row_num,
                    'email': email,
                    'status': 'skipped',
                    'error': 'Email already registered'
                })
                skipped_count += 1
            else:
                logger.error(f"Failed to create user {email}: {e}")
                results.append({
                    'row': row_num,
                    'email': email,
                    'status': 'failed',
                    'error': str(e)[:100]
                })
                failed_count += 1

    # Batch insert user profiles
    if users_to_insert:
        try:
            supabase.table('users').insert(users_to_insert).execute()
            logger.info(f"Bulk import: Batch inserted {len(users_to_insert)} user profiles")
        except Exception as batch_error:
            logger.error(f"Batch user insert failed, falling back to individual: {batch_error}")
            # Fallback to individual inserts
            for user_data in users_to_insert:
                try:
                    supabase.table('users').insert(user_data).execute()
                except Exception as ind_error:
                    logger.error(f"Individual insert failed for {user_data.get('email')}: {ind_error}")

    # Batch insert skills
    if skills_to_insert:
        try:
            supabase.table('user_skill_xp').upsert(skills_to_insert, on_conflict='user_id,pillar').execute()
            logger.info(f"Bulk import: Batch inserted {len(skills_to_insert)} skill records")
        except Exception as skill_error:
            logger.warning(f"Batch skill insert failed: {skill_error}")

    # Log the import
    try:
        supabase.table('admin_audit_logs').insert({
            'user_id': current_user_id,
            'action': 'bulk_user_import',
            'entity_type': 'organization',
            'entity_id': org_id,
            'details': {
                'total_rows': len(rows),
                'created': created_count,
                'failed': failed_count,
                'skipped': skipped_count
            }
        }).execute()
    except Exception as log_error:
        logger.warning(f"Failed to create audit log for bulk import: {log_error}")

    return jsonify({
        'success': True,
        'total': len(rows),
        'created': created_count,
        'failed': failed_count,
        'skipped': skipped_count,
        'results': results
    }), 200


@bp.route('/<org_id>/users/bulk-import/template', methods=['GET'])
@require_org_admin
def download_import_template(current_user_id, current_org_id, is_superadmin, org_id):
    """Download a CSV template for bulk import"""
    # Verify access
    if not is_superadmin and current_org_id != org_id:
        return jsonify({'error': 'Access denied'}), 403

    template = """email,first_name,last_name,role,date_of_birth
student1@example.com,John,Doe,student,2012-05-15
student2@example.com,Jane,Smith,student,2013-08-22
parent1@example.com,Bob,Johnson,parent,
advisor1@example.com,Mary,Williams,advisor,"""

    from flask import Response

    return Response(
        template,
        mimetype='text/csv',
        headers={
            'Content-Disposition': 'attachment; filename=bulk_import_template.csv'
        }
    )


@bp.route('/<org_id>/users/bulk-import/validate', methods=['POST'])
@require_org_admin
def validate_import_file(current_user_id, current_org_id, is_superadmin, org_id):
    """
    Validate a CSV file before import (preview mode).
    Returns validation results without creating any users.
    """
    # Verify access
    if not is_superadmin and current_org_id != org_id:
        return jsonify({'error': 'Access denied'}), 403

    # Check for file
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if not file.filename or not file.filename.lower().endswith('.csv'):
        return jsonify({'error': 'File must be a CSV'}), 400

    try:
        file_content = file.read()
        if len(file_content) > 1024 * 1024:
            return jsonify({'error': 'File too large. Maximum size is 1MB'}), 400
    except Exception as e:
        return jsonify({'error': 'Failed to read file'}), 400

    # Parse CSV
    expected_headers = ['email', 'first_name', 'last_name', 'role', 'date_of_birth']
    rows, parse_error = parse_csv_file(file_content, expected_headers)

    if parse_error:
        return jsonify({'error': parse_error}), 400

    if not rows:
        return jsonify({'error': 'CSV file has no data rows'}), 400

    supabase = get_supabase_admin_client()

    # Get existing emails
    try:
        existing_result = supabase.table('users').select('email').execute()
        existing_emails_db = {u['email'].lower() for u in existing_result.data if u.get('email')}
    except Exception as e:
        return jsonify({'error': 'Failed to check existing users'}), 500

    # Validate all rows
    valid_rows = []
    invalid_rows = []
    seen_emails = set()

    for row in rows:
        row_num = row['_row_number']
        email = row.get('email', '').strip().lower()

        row_errors = validate_row(row, row_num, seen_emails)

        if email and email in existing_emails_db:
            row_errors.append("Email already registered")

        row_info = {
            'row': row_num,
            'email': email or '(empty)',
            'first_name': row.get('first_name', ''),
            'last_name': row.get('last_name', ''),
            'role': row.get('role', 'student') or 'student'
        }

        if row_errors:
            row_info['errors'] = row_errors
            invalid_rows.append(row_info)
        else:
            seen_emails.add(email)
            valid_rows.append(row_info)

    return jsonify({
        'success': True,
        'total_rows': len(rows),
        'valid_count': len(valid_rows),
        'invalid_count': len(invalid_rows),
        'valid_rows': valid_rows[:20],  # Preview first 20
        'invalid_rows': invalid_rows,
        'can_import': len(invalid_rows) == 0
    }), 200
