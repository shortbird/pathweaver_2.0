"""Contract test for SubjectClassificationService.classify_task_subjects.

Most callers invoke it with `title=`/`description=` keyword args. The method's
params were once named `task_title`/`task_description`, so every keyword caller
raised "unexpected keyword argument 'title'" and subject distribution silently
failed on task accept / manual add / course mgmt / backfill (OPTIO-BACKEND-4/5/6).

This pins the public kwarg signature: a future rename would fail here instead of
in production. Built via __new__ + forced fallback so it needs no AI/DB.
"""

from services.subject_classification_service import SubjectClassificationService


def _service_without_init():
    svc = SubjectClassificationService.__new__(SubjectClassificationService)
    # Force the rule-based fallback so no Gemini call / network happens.
    svc._model_available = False
    return svc


def test_classify_task_subjects_accepts_title_description_kwargs():
    svc = _service_without_init()
    result = svc.classify_task_subjects(
        title='Build a birdhouse',
        description='A woodworking project measuring and cutting wood',
        pillar='stem',
        xp_value=100,
    )
    assert isinstance(result, dict)
    assert result, 'expected a non-empty subject distribution'
    # The fallback distributes the full XP across subjects.
    assert sum(result.values()) == 100


def test_classify_task_subjects_works_positionally_too():
    # Some callers pass positionally; both must keep working.
    svc = _service_without_init()
    result = svc.classify_task_subjects('Title', 'Description', 'art', 50)
    assert isinstance(result, dict)
    assert sum(result.values()) == 50
