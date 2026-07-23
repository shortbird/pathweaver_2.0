"""
Student learning context for AI task personalization.

Builds a compact, plain-text summary of what we know about a student's
long-term direction (e.g. trade school, college), per-subject year goals,
and hobbies/interests, so AI task suggestions can be tailored to the
individual student even though the parent quest/class is shared.

Sources (all best-effort; each read is independently wrapped so a failure
in one never blocks the others, and NO failure here may ever break task
generation):
- sis_student_goals: latest goals row for the student. Any status counts;
  when several rows exist we prefer the newest submitted/reviewed row over
  a newer draft's older siblings by taking rows ordered by updated_at and
  picking the first non-draft, falling back to the newest row overall.
- sis_student_records.profile: free-form profile jsonb; 'hobbies' (and, as a
  fallback, 'interests') may hold hobbies/interests text.
- users.bio is intentionally NOT read here: it is already injected into the
  personalization prompt separately as the vision statement.

Returns None when nothing useful exists so callers can leave their prompt
completely unchanged.
"""

from typing import Any, Optional

from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

# Per-field and whole-block size caps (characters).
MAX_FIELD_LEN = 300
MAX_BLOCK_LEN = 1200

# Statuses that indicate the goals were actually turned in / looked at.
_PREFERRED_STATUSES = ('submitted', 'reviewed')


def _clip(value: Any, limit: int = MAX_FIELD_LEN) -> str:
    """Coerce to a single-line string and truncate to limit chars."""
    if value is None:
        return ''
    text = ' '.join(str(value).split())
    if len(text) > limit:
        text = text[:limit].rstrip() + '...'
    return text


def _latest_goals_row(supabase, user_id: str) -> Optional[dict]:
    """Most recent sis_student_goals row for the student.

    Prefers the newest submitted/reviewed row; falls back to the newest row
    of any status (e.g. a draft is still better than nothing).
    """
    try:
        result = supabase.table('sis_student_goals')\
            .select('direction, direction_notes, subjects, status, school_year, updated_at')\
            .eq('student_user_id', user_id)\
            .order('updated_at', desc=True)\
            .limit(10)\
            .execute()
        rows = result.data or []
        if not rows:
            return None
        for row in rows:
            if (row.get('status') or '') in _PREFERRED_STATUSES:
                return row
        return rows[0]
    except Exception as e:
        logger.warning(f"Could not load student goals for {str(user_id)[:8]}: {e}")
        return None


def _hobbies_text(supabase, user_id: str) -> str:
    """Hobbies/interests text from the student's SIS record profile, if any."""
    try:
        result = supabase.table('sis_student_records')\
            .select('profile, updated_at')\
            .eq('student_user_id', user_id)\
            .order('updated_at', desc=True)\
            .limit(1)\
            .execute()
        rows = result.data or []
        if not rows:
            return ''
        profile = rows[0].get('profile') or {}
        if not isinstance(profile, dict):
            return ''
        raw = profile.get('hobbies') or profile.get('interests')
        if isinstance(raw, (list, tuple)):
            raw = ', '.join(str(item) for item in raw if item)
        return _clip(raw)
    except Exception as e:
        logger.warning(f"Could not load student record profile for {str(user_id)[:8]}: {e}")
        return ''


def get_student_learning_context(user_id: str) -> Optional[str]:
    """Best-effort compact text block describing the student's direction,
    year goals, and hobbies/interests, for inclusion in AI prompts.

    Returns None when the student has no goals/record data (or on any
    error), so callers keep their prompt byte-identical in that case.
    """
    if not user_id:
        return None
    try:
        # admin client justified: read-only aggregation of the student's own
        # SIS goal/record rows; callers are @require_auth routes acting for
        # that student, and the output only feeds an AI prompt.
        supabase = get_supabase_admin_client()

        parts = []

        goals = _latest_goals_row(supabase, user_id)
        if goals:
            direction = _clip(goals.get('direction'))
            if direction:
                parts.append(f"Long-term direction: {direction}.")
            notes = _clip(goals.get('direction_notes'))
            if notes:
                parts.append(f"Direction notes: {notes}.")

            subjects = goals.get('subjects')
            subject_bits = []
            if isinstance(subjects, list):
                for entry in subjects:
                    if not isinstance(entry, dict):
                        continue
                    name = _clip(entry.get('subject'), 100)
                    year_goal = _clip(entry.get('year_goal'))
                    long_term = _clip(entry.get('long_term'))
                    if not name or not (year_goal or long_term):
                        continue
                    bit = f"{name}: {year_goal}" if year_goal else f"{name}:"
                    if long_term:
                        bit += f" (long-term: {long_term})"
                    subject_bits.append(bit)
            if subject_bits:
                parts.append("This year's goals: " + '; '.join(subject_bits) + ".")

        hobbies = _hobbies_text(supabase, user_id)
        if hobbies:
            parts.append(f"Interests and hobbies: {hobbies}.")

        if not parts:
            return None

        block = "Student context: " + ' '.join(parts)
        if len(block) > MAX_BLOCK_LEN:
            block = block[:MAX_BLOCK_LEN].rstrip() + '...'
        return block

    except Exception as e:
        logger.warning(f"Could not build student learning context for {str(user_id)[:8]}: {e}")
        return None
