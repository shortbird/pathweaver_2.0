"""The retention guard for the evidence backup bucket.

These cases are the incident of 2026-09-05 written down. The bucket carried one
unscoped `{"age": 90, "Delete"}` rule -- correct for the nightly database dumps
it was written for, and a 90-day deletion timer on 3,548 student-evidence
objects once the storage mirror started sharing the bucket. `test_the_2026_09_05
_policy_is_rejected` is that exact policy; if it ever passes, the guard has
stopped guarding.
"""

import importlib.util
from pathlib import Path

import pytest

_SCRIPT = (Path(__file__).resolve().parents[3]
           / 'scripts' / 'check_backup_lifecycle.py')


def _load():
    spec = importlib.util.spec_from_file_location('check_backup_lifecycle', _SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


guard = _load()


def _bucket(rules, versioning=True):
    return {'versioning_enabled': versioning, 'lifecycle_config': {'rule': rules}}


def _delete(condition):
    return {'action': {'type': 'Delete'}, 'condition': condition}


def test_the_script_is_where_the_workflow_expects_it():
    """The workflow calls this by path; a rename must fail here, not in prod."""
    assert _SCRIPT.is_file(), f'{_SCRIPT} is missing'


def test_the_2026_09_05_policy_is_rejected():
    """The real incident. An unscoped age rule reaches the mirror."""
    problems = guard.check(_bucket([_delete({'age': 90})], versioning=False))
    assert problems, 'the policy that would have deleted the evidence passed'
    assert any('LIVE object' in p for p in problems)
    assert any('versioning is OFF' in p.lower() or 'versioning is off' in p.lower()
               for p in problems)


def test_the_policy_that_replaced_it_is_accepted():
    """The three prefix-scoped rules actually applied on 2026-09-05."""
    assert guard.check(_bucket([
        _delete({'age': 90, 'matchesPrefix': ['daily/'], 'isLive': True}),
        _delete({'daysSinceNoncurrentTime': 1, 'matchesPrefix': ['daily/']}),
        _delete({'daysSinceNoncurrentTime': 90, 'matchesPrefix': ['storage/']}),
    ])) == []


def test_an_age_rule_scoped_to_daily_cannot_reach_the_mirror():
    assert guard.check(_bucket([
        _delete({'age': 90, 'matchesPrefix': ['daily/']})])) == []


@pytest.mark.parametrize('condition', [
    {'age': 90, 'matchesPrefix': ['storage/'], 'isLive': False},
    {'daysSinceNoncurrentTime': 90, 'matchesPrefix': ['storage/']},
    {'numNewerVersions': 3, 'matchesPrefix': ['storage/']},
])
def test_noncurrent_only_rules_are_safe(condition):
    """Deleting a superseded version is the point; deleting a live one is not."""
    assert guard.check(_bucket([_delete(condition)])) == []


@pytest.mark.parametrize('prefixes', [
    None,            # unscoped -- the incident
    [],              # explicitly empty is still every object
    ['storage/'],
    ['st'],          # a partial prefix still reaches storage/
    ['storage/quest-evidence/'],   # narrower, but inside the mirror
])
def test_live_deletion_reaching_the_mirror_is_rejected(prefixes):
    cond = {'age': 30}
    if prefixes is not None:
        cond['matchesPrefix'] = prefixes
    assert guard.check(_bucket([_delete(cond)])), \
        f'a live-delete rule with prefixes={prefixes} was allowed'


def test_a_non_delete_action_is_not_flagged():
    """Moving the mirror to colder storage is fine; only deletion is not."""
    assert guard.check(_bucket([{
        'action': {'type': 'SetStorageClass', 'storageClass': 'COLDLINE'},
        'condition': {'age': 30},
    }])) == []


def test_versioning_off_is_a_problem_on_its_own():
    """Without it the noncurrent rules protect nothing."""
    problems = guard.check(_bucket([], versioning=False))
    assert any('versioning' in p.lower() for p in problems)


def test_the_raw_json_api_shape_is_understood_too():
    """gcloud says lifecycle_config/versioning_enabled; the API says otherwise."""
    assert guard.check({
        'versioning': {'enabled': True},
        'lifecycle': {'rule': [_delete({'age': 90, 'matchesPrefix': ['daily/']})]},
    }) == []


def test_an_empty_policy_is_safe_but_versioning_still_checked():
    assert guard.check({'versioning_enabled': True}) == []
