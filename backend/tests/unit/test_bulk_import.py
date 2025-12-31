"""
Tests for bulk user import CSV parsing and validation

Tests the utility functions in backend/routes/admin/bulk_import.py:
- generate_temp_password: Secure password generation
- validate_email: Email format validation
- validate_date_of_birth: Date format and range validation
- parse_csv_file: CSV parsing with header normalization
- validate_row: Full row validation logic

Run with: pytest backend/tests/unit/test_bulk_import.py -v
"""

import pytest
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from routes.admin.bulk_import import (
    generate_temp_password,
    validate_email,
    validate_date_of_birth,
    parse_csv_file,
    validate_row,
    VALID_IMPORT_ROLES
)
from datetime import date, timedelta


class TestGenerateTempPassword:
    """Tests for temporary password generation"""

    def test_default_length(self):
        """Password should be 12 characters by default"""
        password = generate_temp_password()
        assert len(password) == 12

    def test_custom_length(self):
        """Password should respect custom length"""
        password = generate_temp_password(length=20)
        assert len(password) == 20

    def test_contains_valid_characters(self):
        """Password should only contain allowed characters"""
        import string
        allowed = set(string.ascii_letters + string.digits + "!@#$%")
        password = generate_temp_password()
        assert all(c in allowed for c in password)

    def test_passwords_are_unique(self):
        """Generated passwords should be different each time"""
        passwords = [generate_temp_password() for _ in range(100)]
        assert len(set(passwords)) == 100  # All unique

    def test_minimum_complexity(self):
        """Generated passwords should have reasonable complexity"""
        # Generate several and check that at least some have mixed case/numbers
        passwords = [generate_temp_password() for _ in range(10)]
        has_upper = any(any(c.isupper() for c in p) for p in passwords)
        has_lower = any(any(c.islower() for c in p) for p in passwords)
        has_digit = any(any(c.isdigit() for c in p) for p in passwords)
        assert has_upper and has_lower and has_digit


class TestValidateEmail:
    """Tests for email validation"""

    def test_valid_simple_email(self):
        """Simple email addresses should be valid"""
        assert validate_email('user@example.com')
        assert validate_email('test@domain.org')

    def test_valid_email_with_dots(self):
        """Emails with dots in local part should be valid"""
        assert validate_email('first.last@example.com')
        assert validate_email('user.name.here@domain.co.uk')

    def test_valid_email_with_plus(self):
        """Emails with plus signs should be valid"""
        assert validate_email('user+tag@example.com')

    def test_valid_email_with_underscore(self):
        """Emails with underscores should be valid"""
        assert validate_email('user_name@example.com')

    def test_valid_email_with_hyphen(self):
        """Emails with hyphens should be valid"""
        assert validate_email('user-name@example.com')

    def test_valid_email_with_numbers(self):
        """Emails with numbers should be valid"""
        assert validate_email('user123@example.com')
        assert validate_email('123user@example.com')

    def test_valid_email_with_subdomain(self):
        """Emails with subdomains should be valid"""
        assert validate_email('user@mail.example.com')
        assert validate_email('user@sub.domain.example.co.uk')

    def test_invalid_no_at_symbol(self):
        """Emails without @ should be invalid"""
        assert not validate_email('userexample.com')
        assert not validate_email('userdomain')

    def test_invalid_no_domain(self):
        """Emails without domain should be invalid"""
        assert not validate_email('user@')
        assert not validate_email('user@.')

    def test_invalid_no_tld(self):
        """Emails without TLD should be invalid"""
        assert not validate_email('user@example')
        assert not validate_email('user@example.')

    def test_invalid_short_tld(self):
        """Emails with single-char TLD should be invalid"""
        assert not validate_email('user@example.c')

    def test_invalid_multiple_at(self):
        """Emails with multiple @ should be invalid"""
        assert not validate_email('user@@example.com')
        assert not validate_email('user@name@example.com')

    def test_invalid_spaces(self):
        """Emails with spaces should be invalid"""
        assert not validate_email('user @example.com')
        assert not validate_email('user@ example.com')
        assert not validate_email(' user@example.com')

    def test_empty_email(self):
        """Empty string should be invalid"""
        assert not validate_email('')

    def test_none_email(self):
        """None should cause an error (test robustness)"""
        with pytest.raises(TypeError):
            validate_email(None)


class TestValidateDateOfBirth:
    """Tests for date of birth validation"""

    def test_valid_date_format(self):
        """Valid YYYY-MM-DD format should pass"""
        is_valid, result = validate_date_of_birth('2010-05-15')
        assert is_valid
        assert result == '2010-05-15'

    def test_valid_recent_date(self):
        """Recent valid date should pass"""
        is_valid, result = validate_date_of_birth('2015-12-31')
        assert is_valid
        assert result == '2015-12-31'

    def test_empty_string_allowed(self):
        """Empty string should be valid (optional field)"""
        is_valid, result = validate_date_of_birth('')
        assert is_valid
        assert result is None

    def test_whitespace_only_allowed(self):
        """Whitespace-only string should be treated as empty"""
        is_valid, result = validate_date_of_birth('   ')
        assert is_valid
        assert result is None

    def test_none_allowed(self):
        """None should be valid (optional field)"""
        is_valid, result = validate_date_of_birth(None)
        assert is_valid
        assert result is None

    def test_invalid_future_date(self):
        """Future date should be rejected"""
        future_date = (date.today() + timedelta(days=365)).isoformat()
        is_valid, result = validate_date_of_birth(future_date)
        assert not is_valid
        assert 'future' in result.lower()

    def test_invalid_tomorrow(self):
        """Tomorrow's date should be rejected"""
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        is_valid, result = validate_date_of_birth(tomorrow)
        assert not is_valid

    def test_valid_today(self):
        """Today's date should be valid (newborn)"""
        today = date.today().isoformat()
        is_valid, result = validate_date_of_birth(today)
        assert is_valid
        assert result == today

    def test_invalid_too_old(self):
        """Date > 100 years ago should be rejected"""
        old_date = (date.today() - timedelta(days=36600)).isoformat()  # ~100 years
        is_valid, result = validate_date_of_birth(old_date)
        assert not is_valid

    def test_invalid_format_slash(self):
        """Slash-separated dates should be rejected"""
        is_valid, result = validate_date_of_birth('05/15/2010')
        assert not is_valid
        assert 'format' in result.lower() or 'invalid' in result.lower()

    def test_invalid_format_reversed(self):
        """DD-MM-YYYY format should be rejected"""
        is_valid, result = validate_date_of_birth('15-05-2010')
        assert not is_valid

    def test_invalid_format_text(self):
        """Text dates should be rejected"""
        is_valid, result = validate_date_of_birth('May 15, 2010')
        assert not is_valid

    def test_invalid_nonexistent_date(self):
        """Non-existent dates should be rejected"""
        is_valid, result = validate_date_of_birth('2010-02-30')  # Feb 30 doesn't exist
        assert not is_valid

    def test_whitespace_trimmed(self):
        """Whitespace should be trimmed"""
        is_valid, result = validate_date_of_birth('  2010-05-15  ')
        assert is_valid
        assert result == '2010-05-15'


class TestParseCSVFile:
    """Tests for CSV file parsing"""

    def test_valid_csv_parsing(self):
        """Valid CSV should parse correctly"""
        csv_content = b'email,first_name,last_name\ntest@example.com,John,Doe'
        rows, error = parse_csv_file(csv_content, ['email', 'first_name', 'last_name'])
        assert error is None
        assert len(rows) == 1
        assert rows[0]['email'] == 'test@example.com'
        assert rows[0]['first_name'] == 'John'
        assert rows[0]['last_name'] == 'Doe'

    def test_multiple_rows(self):
        """Multiple rows should parse correctly"""
        csv_content = b'email,first_name,last_name\nuser1@example.com,John,Doe\nuser2@example.com,Jane,Smith'
        rows, error = parse_csv_file(csv_content, ['email', 'first_name', 'last_name'])
        assert error is None
        assert len(rows) == 2

    def test_header_normalization(self):
        """Headers should be normalized to lowercase"""
        csv_content = b'Email,First_Name,LAST_NAME\ntest@example.com,John,Doe'
        rows, error = parse_csv_file(csv_content, ['email', 'first_name', 'last_name'])
        assert error is None
        assert 'email' in rows[0]
        assert 'first_name' in rows[0]
        assert 'last_name' in rows[0]

    def test_header_whitespace_trimmed(self):
        """Header whitespace should be trimmed"""
        csv_content = b' email , first_name , last_name \ntest@example.com,John,Doe'
        rows, error = parse_csv_file(csv_content, ['email', 'first_name', 'last_name'])
        assert error is None
        assert 'email' in rows[0]

    def test_value_whitespace_trimmed(self):
        """Value whitespace should be trimmed"""
        csv_content = b'email,first_name,last_name\n test@example.com , John , Doe '
        rows, error = parse_csv_file(csv_content, ['email', 'first_name', 'last_name'])
        assert error is None
        assert rows[0]['email'] == 'test@example.com'
        assert rows[0]['first_name'] == 'John'
        assert rows[0]['last_name'] == 'Doe'

    def test_missing_required_header(self):
        """Missing required header should return error"""
        csv_content = b'email,first_name\ntest@example.com,John'
        rows, error = parse_csv_file(csv_content, ['email', 'first_name', 'last_name'])
        assert rows is None
        assert 'last_name' in error

    def test_empty_file(self):
        """Empty file should return error"""
        csv_content = b''
        rows, error = parse_csv_file(csv_content, ['email', 'first_name', 'last_name'])
        assert rows is None
        assert 'empty' in error.lower() or 'no headers' in error.lower()

    def test_headers_only(self):
        """File with only headers (no data) should return empty list"""
        csv_content = b'email,first_name,last_name\n'
        rows, error = parse_csv_file(csv_content, ['email', 'first_name', 'last_name'])
        assert error is None
        assert len(rows) == 0

    def test_extra_columns_preserved(self):
        """Extra columns should be preserved"""
        csv_content = b'email,first_name,last_name,role,notes\ntest@example.com,John,Doe,student,Some notes'
        rows, error = parse_csv_file(csv_content, ['email', 'first_name', 'last_name'])
        assert error is None
        assert rows[0].get('role') == 'student'
        assert rows[0].get('notes') == 'Some notes'

    def test_row_number_tracking(self):
        """Row numbers should be tracked correctly"""
        csv_content = b'email,first_name,last_name\nuser1@example.com,John,Doe\nuser2@example.com,Jane,Smith'
        rows, error = parse_csv_file(csv_content, ['email', 'first_name', 'last_name'])
        assert error is None
        assert rows[0]['_row_number'] == 2  # First data row (after header)
        assert rows[1]['_row_number'] == 3  # Second data row

    def test_utf8_encoding(self):
        """UTF-8 encoded content should parse correctly"""
        csv_content = 'email,first_name,last_name\ntest@example.com,José,García'.encode('utf-8')
        rows, error = parse_csv_file(csv_content, ['email', 'first_name', 'last_name'])
        assert error is None
        assert rows[0]['first_name'] == 'José'
        assert rows[0]['last_name'] == 'García'

    def test_latin1_fallback(self):
        """Latin-1 encoded content should fall back correctly"""
        csv_content = 'email,first_name,last_name\ntest@example.com,José,García'.encode('latin-1')
        rows, error = parse_csv_file(csv_content, ['email', 'first_name', 'last_name'])
        assert error is None
        # Content should still be readable

    def test_empty_values_handled(self):
        """Empty values should become empty strings"""
        csv_content = b'email,first_name,last_name,role\ntest@example.com,John,Doe,'
        rows, error = parse_csv_file(csv_content, ['email', 'first_name', 'last_name'])
        assert error is None
        assert rows[0].get('role') == ''


class TestValidateRow:
    """Tests for individual row validation"""

    def test_valid_row(self):
        """Valid row should have no errors"""
        row = {
            'email': 'test@example.com',
            'first_name': 'John',
            'last_name': 'Doe',
            'role': 'student',
            'date_of_birth': '2010-05-15'
        }
        errors = validate_row(row, 2, set())
        assert len(errors) == 0

    def test_valid_row_minimal(self):
        """Row with only required fields should be valid"""
        row = {
            'email': 'test@example.com',
            'first_name': 'John',
            'last_name': 'Doe'
        }
        errors = validate_row(row, 2, set())
        assert len(errors) == 0

    def test_missing_email(self):
        """Missing email should return error"""
        row = {
            'email': '',
            'first_name': 'John',
            'last_name': 'Doe'
        }
        errors = validate_row(row, 2, set())
        assert any('email' in e.lower() for e in errors)

    def test_invalid_email_format(self):
        """Invalid email format should return error"""
        row = {
            'email': 'not-an-email',
            'first_name': 'John',
            'last_name': 'Doe'
        }
        errors = validate_row(row, 2, set())
        assert any('email' in e.lower() for e in errors)

    def test_missing_first_name(self):
        """Missing first name should return error"""
        row = {
            'email': 'test@example.com',
            'first_name': '',
            'last_name': 'Doe'
        }
        errors = validate_row(row, 2, set())
        assert any('first name' in e.lower() for e in errors)

    def test_missing_last_name(self):
        """Missing last name should return error"""
        row = {
            'email': 'test@example.com',
            'first_name': 'John',
            'last_name': ''
        }
        errors = validate_row(row, 2, set())
        assert any('last name' in e.lower() for e in errors)

    def test_duplicate_email(self):
        """Duplicate email in file should return error"""
        row = {
            'email': 'duplicate@example.com',
            'first_name': 'John',
            'last_name': 'Doe'
        }
        existing_emails = {'duplicate@example.com'}
        errors = validate_row(row, 2, existing_emails)
        assert any('duplicate' in e.lower() for e in errors)

    def test_invalid_role(self):
        """Invalid role should return error"""
        row = {
            'email': 'test@example.com',
            'first_name': 'John',
            'last_name': 'Doe',
            'role': 'superadmin'  # Not allowed in bulk import
        }
        errors = validate_row(row, 2, set())
        assert any('role' in e.lower() for e in errors)

    def test_valid_roles(self):
        """All valid import roles should pass"""
        for role in VALID_IMPORT_ROLES:
            row = {
                'email': f'{role}@example.com',
                'first_name': 'Test',
                'last_name': 'User',
                'role': role
            }
            errors = validate_row(row, 2, set())
            assert len(errors) == 0, f"Role '{role}' should be valid"

    def test_empty_role_defaults_to_student(self):
        """Empty role should not cause an error (defaults to student)"""
        row = {
            'email': 'test@example.com',
            'first_name': 'John',
            'last_name': 'Doe',
            'role': ''
        }
        errors = validate_row(row, 2, set())
        # Empty role is handled as 'student' in the import logic
        assert not any('role' in e.lower() for e in errors)

    def test_invalid_date_of_birth(self):
        """Invalid date format should return error"""
        row = {
            'email': 'test@example.com',
            'first_name': 'John',
            'last_name': 'Doe',
            'date_of_birth': '05/15/2010'  # Wrong format
        }
        errors = validate_row(row, 2, set())
        assert any('date' in e.lower() for e in errors)

    def test_future_date_of_birth(self):
        """Future date of birth should return error"""
        future_date = (date.today() + timedelta(days=30)).isoformat()
        row = {
            'email': 'test@example.com',
            'first_name': 'John',
            'last_name': 'Doe',
            'date_of_birth': future_date
        }
        errors = validate_row(row, 2, set())
        assert len(errors) > 0

    def test_multiple_errors(self):
        """Row with multiple issues should return all errors"""
        row = {
            'email': 'not-valid',
            'first_name': '',
            'last_name': '',
            'role': 'invalid_role',
            'date_of_birth': 'not-a-date'
        }
        errors = validate_row(row, 2, set())
        # Should have at least 4 errors: email, first_name, last_name, date
        assert len(errors) >= 4

    def test_email_case_normalized(self):
        """Email should be normalized to lowercase for duplicate check"""
        row = {
            'email': 'TEST@EXAMPLE.COM',
            'first_name': 'John',
            'last_name': 'Doe'
        }
        existing_emails = {'test@example.com'}
        errors = validate_row(row, 2, existing_emails)
        assert any('duplicate' in e.lower() for e in errors)


class TestValidImportRoles:
    """Tests for VALID_IMPORT_ROLES constant"""

    def test_expected_roles_present(self):
        """All expected roles should be in VALID_IMPORT_ROLES"""
        expected = ['student', 'parent', 'advisor', 'org_admin', 'observer']
        for role in expected:
            assert role in VALID_IMPORT_ROLES

    def test_superadmin_not_importable(self):
        """Superadmin should not be a valid import role"""
        assert 'superadmin' not in VALID_IMPORT_ROLES

    def test_invalid_roles_excluded(self):
        """Invalid roles from CLAUDE.md should not be present"""
        invalid_roles = ['admin', 'teacher', 'educator', 'school_admin']
        for role in invalid_roles:
            assert role not in VALID_IMPORT_ROLES


# Integration-style tests (still unit tests but test combinations)
class TestCSVParsingIntegration:
    """Integration tests for full CSV parsing flow"""

    def test_full_valid_csv(self):
        """Complete valid CSV should parse with all fields"""
        csv_content = b'''email,first_name,last_name,role,date_of_birth
student1@school.edu,Alice,Johnson,student,2012-03-15
student2@school.edu,Bob,Smith,student,2011-08-22
parent1@email.com,Carol,Johnson,parent,
advisor@school.edu,David,Williams,advisor,1985-05-10'''

        rows, error = parse_csv_file(csv_content, ['email', 'first_name', 'last_name'])
        assert error is None
        assert len(rows) == 4

        # Validate each row
        seen_emails = set()
        for row in rows:
            errors = validate_row(row, row['_row_number'], seen_emails)
            assert len(errors) == 0, f"Row {row['_row_number']} should be valid: {errors}"
            seen_emails.add(row['email'].lower())

    def test_csv_with_validation_errors(self):
        """CSV with errors should identify specific problem rows"""
        csv_content = b'''email,first_name,last_name,role,date_of_birth
valid@school.edu,Alice,Johnson,student,2012-03-15
not-an-email,Bob,,student,2011-08-22
duplicate@school.edu,Carol,Smith,invalid_role,
duplicate@school.edu,David,Brown,student,2050-01-01'''

        rows, error = parse_csv_file(csv_content, ['email', 'first_name', 'last_name'])
        assert error is None
        assert len(rows) == 4

        seen_emails = set()
        row_errors = {}
        for row in rows:
            errors = validate_row(row, row['_row_number'], seen_emails)
            if errors:
                row_errors[row['_row_number']] = errors
            email = row.get('email', '').strip().lower()
            if email:
                seen_emails.add(email)

        # Row 2: no email (first data row is row 2)
        # Actually row 3 has invalid email and missing last_name
        # Row 4 has invalid role
        # Row 5 has duplicate email and future date
        assert 3 in row_errors  # not-an-email, missing last_name
        assert 4 in row_errors  # invalid_role
        assert 5 in row_errors  # duplicate, future date
