"""
OEA Diploma Plan grading + progress math (pure functions, no DB).

PRD V2 section 4.4 (grading) and 4.6 (dashboard progress):
  - Letter grades A-F on a standard 4.0 scale.
  - Honors/AP/IB courses (is_weighted) add +1.0 to the weighted GPA only.
  - GPA is credit-weighted: sum(grade_points * credits) / sum(credits).
  - Both unweighted and weighted GPA are reported.
  - Progress is measured against the student's chosen pathway (oea_pathways.py):
    24 total credits, split into foundation vs elective, broken down by the
    pathway's requirement slots.

These functions take plain dicts (oea_credits rows + a pathway definition) so
they're trivially unit-testable and reusable by routes, transcripts, and the
diploma-completion check.
"""

from utils.oea_pathways import get_pathway

GRADE_POINTS = {'A': 4.0, 'B': 3.0, 'C': 2.0, 'D': 1.0, 'F': 0.0}


def _round2(value):
    """Round to 2 decimals, returning a float (None passes through)."""
    return None if value is None else round(value + 1e-9, 2)


def compute_gpa(credits):
    """
    Compute unweighted + weighted GPA from a list of oea_credits rows.

    Only completed credits that carry a valid letter grade count. Honors/AP/IB
    (is_weighted) add +1.0 to each weighted grade point (so an A in an AP course
    is 5.0 weighted, 4.0 unweighted). Credit-weighted average.

    Returns:
        {
          'unweighted': float | None,   # None when nothing is graded yet
          'weighted': float | None,
          'graded_credits': float,      # total credits counted toward GPA
        }
    """
    total_credits = 0.0
    unweighted_points = 0.0
    weighted_points = 0.0

    for c in credits or []:
        grade = c.get('letter_grade')
        if c.get('status') != 'complete' or grade not in GRADE_POINTS:
            continue
        credit_value = float(c.get('credits') or 0)
        if credit_value <= 0:
            continue
        base = GRADE_POINTS[grade]
        bonus = 1.0 if c.get('is_weighted') else 0.0
        total_credits += credit_value
        unweighted_points += base * credit_value
        weighted_points += (base + bonus) * credit_value

    if total_credits == 0:
        return {'unweighted': None, 'weighted': None, 'graded_credits': 0.0}

    return {
        'unweighted': _round2(unweighted_points / total_credits),
        'weighted': _round2(weighted_points / total_credits),
        'graded_credits': _round2(total_credits),
    }


def compute_progress(pathway_key, credits):
    """
    Summarize credit progress for a student against their chosen pathway.

    A credit counts as "earned" once status == 'complete'; credits still
    'in_progress' are reported separately. Earned credits per requirement are
    capped at that requirement's required amount so over-filling one slot can't
    inflate the totals (e.g. 4 Math credits on a 3-credit Math slot count as 3
    toward the requirement, though all 4 still appear in the GPA).

    Returns None if pathway_key is unknown; otherwise:
        {
          'pathway_key', 'total_required', 'total_earned', 'total_in_progress',
          'foundation_required', 'foundation_earned',
          'elective_required', 'elective_earned',
          'percent_complete',                 # 0-100, of total_required
          'is_complete',                      # all requirements met
          'requirements': [
            {key, label, category, required, earned, in_progress, is_met}
          ],
        }
    """
    pathway = get_pathway(pathway_key)
    if not pathway:
        return None

    # Tally earned + in-progress credits per requirement slot.
    earned_by_req = {}
    in_progress_by_req = {}
    for c in credits or []:
        key = c.get('requirement_key')
        value = float(c.get('credits') or 0)
        if c.get('status') == 'complete':
            earned_by_req[key] = earned_by_req.get(key, 0.0) + value
        else:
            in_progress_by_req[key] = in_progress_by_req.get(key, 0.0) + value

    requirements = []
    total_earned = 0.0
    foundation_earned = 0.0
    elective_earned = 0.0

    for req in pathway['requirements']:
        key = req['key']
        required = float(req['credits'])
        raw_earned = earned_by_req.get(key, 0.0)
        capped_earned = min(raw_earned, required)
        in_progress = in_progress_by_req.get(key, 0.0)

        total_earned += capped_earned
        if req['category'] == 'foundation':
            foundation_earned += capped_earned
        else:
            elective_earned += capped_earned

        requirements.append({
            'key': key,
            'label': req['label'],
            'category': req['category'],
            'subject_key': req.get('subject_key'),
            'required': required,
            'earned': _round2(capped_earned),
            'in_progress': _round2(in_progress),
            'is_met': capped_earned >= required,
        })

    total_required = float(pathway['total_credits'])
    total_in_progress = sum(in_progress_by_req.values())
    is_complete = all(r['is_met'] for r in requirements)

    return {
        'pathway_key': pathway_key,
        'total_required': total_required,
        'total_earned': _round2(total_earned),
        'total_in_progress': _round2(total_in_progress),
        'foundation_required': float(pathway['foundation_credits']),
        'foundation_earned': _round2(foundation_earned),
        'elective_required': float(pathway['elective_credits']),
        'elective_earned': _round2(elective_earned),
        'percent_complete': _round2(100.0 * total_earned / total_required) if total_required else 0.0,
        'is_complete': is_complete,
        'requirements': requirements,
    }
