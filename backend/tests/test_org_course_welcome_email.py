"""
Unit tests for the emails used by the partner-program "register a student for
courses" flow.

Validates that both YAML templates render end-to-end:
  - org_course_welcome  (new account: login email + temp password + course list)
  - org_courses_added   (returning student: course list, no credentials)
"""

from unittest.mock import patch

import pytest

from services.email_service import email_service


@pytest.mark.unit
def test_org_course_welcome_email_renders_credentials_and_courses():
    with patch.object(email_service, 'send_email', return_value=True) as mock_send:
        ok = email_service.send_org_course_welcome_email(
            to_email='jordan@example.com',
            student_name='Jordan',
            student_email='jordan@example.com',
            temp_password='TempPass123!',
            org_name='OnFire Learning',
            courses_sentence='Build a Tiny Model House and Launch a Store',
            course_count=2,
            login_url='https://www.optioeducation.com/login',
        )

    assert ok is True
    assert mock_send.called
    args, _ = mock_send.call_args
    to_email, subject, html_body = args[0], args[1], args[2]

    assert to_email == 'jordan@example.com'
    assert 'jordan@example.com' in html_body
    assert 'TempPass123!' in html_body
    assert 'Build a Tiny Model House and Launch a Store' in html_body
    assert 'OnFire Learning' in html_body
    assert 'https://www.optioeducation.com/login' in html_body
    # Feature bullets and the 6-month support promise must be present
    assert 'hands-on projects' in html_body
    assert '6 months of individual support' in html_body


@pytest.mark.unit
def test_org_courses_added_email_has_no_credentials():
    with patch.object(email_service, 'send_email', return_value=True) as mock_send:
        ok = email_service.send_org_courses_added_email(
            to_email='jordan@example.com',
            student_name='Jordan',
            org_name='OnFire Learning',
            courses_sentence='Cook a Week of Meals',
            course_count=1,
            login_url='https://www.optioeducation.com/login',
        )

    assert ok is True
    assert mock_send.called
    args, _ = mock_send.call_args
    html_body = args[2]

    assert 'Cook a Week of Meals' in html_body
    assert 'OnFire Learning' in html_body
    # A returning-student email must not contain a temporary password block
    assert 'Temporary password' not in html_body
