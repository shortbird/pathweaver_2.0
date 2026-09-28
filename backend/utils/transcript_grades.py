"""
Letter grades and GPA on the Optio transcript.

Two kinds of grade reach a transcript, and the rule for each is fixed:

  Credit earned at Optio -- subject XP, awarded classes -- is an A. The
  evidence was reviewed and accepted; there is no partial grade for it.

  A transfer course carries the grade the family or the sending school gave
  it, stored on its course line item: transfer_credits.course_names is
  {subject: [{name, credits, grade}]}. A transfer line with no grade prints as
  an A, which is what every transfer line printed before grades existed, so
  no transcript already issued changes.

GPA is the credit-weighted mean of those grades on a 4-point scale, over
completed credit only. Planned and in-progress credit has no grade yet.
"""

from typing import Any, Dict, Iterable, List, Optional

GRADE_POINTS = {'A': 4.0, 'B': 3.0, 'C': 2.0, 'D': 1.0, 'F': 0.0}

OPTIO_GRADE = 'A'


def normalize_grade(value: Any) -> Optional[str]:
    """'b' -> 'B'; blank -> None; anything off the A-F scale -> ValueError."""
    if value is None:
        return None
    grade = str(value).strip().upper()
    if not grade:
        return None
    if grade not in GRADE_POINTS:
        raise ValueError(f'Grade must be one of A, B, C, D or F (got "{value}")')
    return grade


def course_grade(course: Dict[str, Any]) -> str:
    """The grade a transfer course line prints."""
    try:
        return normalize_grade((course or {}).get('grade')) or OPTIO_GRADE
    except ValueError:
        return OPTIO_GRADE


def graded_lines(earned_credits: Dict[str, Dict[str, Any]],
                 class_credits: Iterable[Dict[str, Any]],
                 transfer_credits: Iterable[Dict[str, Any]]) -> List[tuple]:
    """(credits, grade) for every completed line, in the shapes the transcript
    routes already build."""
    lines = []
    for info in (earned_credits or {}).values():
        lines.append((float(info.get('credits') or 0), OPTIO_GRADE))
    for cc in class_credits or []:
        lines.append((float(cc.get('credits') or 0), cc.get('grade') or OPTIO_GRADE))
    for tc in transfer_credits or []:
        course_names = tc.get('course_names') or {}
        for subject, info in (tc.get('subjects') or {}).items():
            courses = course_names.get(subject) or []
            if courses:
                for course in courses:
                    lines.append((float(course.get('credits') or 0), course_grade(course)))
            else:
                lines.append((float(info.get('credits') or 0), OPTIO_GRADE))
    return lines


def compute_gpa(earned_credits, class_credits, transfer_credits) -> Optional[float]:
    """Credit-weighted GPA, two decimals; None when nothing is graded yet."""
    lines = [(c, g) for c, g in graded_lines(earned_credits, class_credits, transfer_credits)
             if c > 0 and g in GRADE_POINTS]
    total = sum(c for c, _ in lines)
    if total <= 0:
        return None
    return round(sum(c * GRADE_POINTS[g] for c, g in lines) / total, 2)
