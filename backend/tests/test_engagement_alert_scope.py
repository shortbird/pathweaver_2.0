"""
A teacher's "Needs attention" card must show a teacher's own students.

iCreate, 2026-08-26: "Not all teachers should see things in the Needs attention
section such as 'Annika Larson - Algebra 1 has had no quest activity for 14...'"

The endpoint scoped with class_scope(), which returns None -- unrestricted --
for anyone holding org_admin or campus_coordinator. At a microschool the person
teaching a class is very often also an admin, so their teacher dashboard listed
every student in the school, while every other card on that same page stayed
scoped to their own classes.

?scope=mine resolves the caller's own taught classes regardless of role. Without
it nothing changes, so the admin-facing callers keep the org-wide view.
"""

import pytest
from flask import Flask

import app  # noqa: F401 — import graph ordering
from routes.sis import engagement as engagement_routes

ORG = 'org-1'
TEACHER_ADMIN = 'user-teaching-admin'
MY_CLASSES = ['class-a', 'class-b']


@pytest.fixture
def flask_app():
    return Flask(__name__)


@pytest.fixture(autouse=True)
def _stub_scopes(monkeypatch):
    """class_scope: unrestricted for an admin. advisor_class_ids: what they teach."""
    monkeypatch.setattr(engagement_routes.sis_service, 'class_scope',
                        lambda user_id, org_id: None)
    monkeypatch.setattr(engagement_routes.sis_service, 'advisor_class_ids',
                        lambda user_id, org_id: list(MY_CLASSES))


def _scope(flask_app, query=''):
    with flask_app.test_request_context(f'/engagement-alerts{query}'):
        return engagement_routes._alert_scope(TEACHER_ADMIN, ORG)


def test_scope_mine_limits_an_admin_to_their_own_classes(flask_app):
    assert _scope(flask_app, '?scope=mine') == MY_CLASSES


def test_without_the_parameter_an_admin_still_sees_the_whole_org(flask_app):
    assert _scope(flask_app) is None


def test_an_unrelated_scope_value_is_ignored(flask_app):
    assert _scope(flask_app, '?scope=everything') is None


def test_the_parameter_is_whitespace_tolerant(flask_app):
    assert _scope(flask_app, '?scope=%20mine%20') == MY_CLASSES


def test_a_plain_advisor_is_unaffected_by_the_parameter(flask_app, monkeypatch):
    """An advisor is already restricted; asking for 'mine' resolves the same
    classes either way."""
    monkeypatch.setattr(engagement_routes.sis_service, 'class_scope',
                        lambda user_id, org_id: list(MY_CLASSES))
    assert _scope(flask_app) == MY_CLASSES
    assert _scope(flask_app, '?scope=mine') == MY_CLASSES
