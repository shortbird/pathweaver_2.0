"""
The seam for the analyzer that will read a prior-learning record and PROPOSE a
subject/credit split.

Nothing here calls a model yet, and that is deliberate — the judgement call
"four years of piano is worth 1.0 fine arts" is one the office has to make by
hand a few dozen times before it's safe to describe to a model. What this module
does now is fix the two halves that the future tool would otherwise invent
badly:

  build_analysis_payload   what the model gets to see, from one record — the
                           family's own words plus every piece of evidence,
                           normalized so a transcript scan and a typed paragraph
                           arrive in the same shape.
  store_suggestion         where the answer goes: ai_suggestion, which is a
                           SUGGESTION. It never touches awarded_credits. A human
                           reviewer copies it across by accepting the record.

When the analyzer is built it should use Config.GEMINI_MODEL like every other AI
call on the platform (see CLAUDE.md) — no model name belongs in this file.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from database import get_supabase_admin_client
from utils.logger import get_logger
from utils.school_subjects import SCHOOL_SUBJECT_DESCRIPTIONS, SCHOOL_SUBJECTS

logger = get_logger(__name__)

# The shape ai_suggestion holds. Written down here rather than left implicit so
# the frontend can render a suggestion before the producer exists.
SUGGESTION_SCHEMA = {
    'summary': 'str — one paragraph a reviewer can read instead of the evidence',
    'subjects': [{
        'subject': f'one of {SCHOOL_SUBJECTS}',
        'credits': 'float — proposed Carnegie units',
        'confidence': 'float 0..1',
        'rationale': 'str — which evidence supports this, in one sentence',
    }],
    'flags': ['str — anything a human must check (illegible scan, missing dates, '
              'evidence that does not match the claim)'],
}

# Evidence a text-only model can read directly vs. evidence it needs to be handed
# as a file/URL. The split is here, not in the prompt, so both stay in step.
INLINE_TYPES = ('text', 'link', 'video')
ATTACHMENT_TYPES = ('image', 'document')


def subject_menu() -> List[Dict[str, str]]:
    """The subjects a suggestion may name, with their descriptions — the analyzer
    has to be told the vocabulary, and this is the same list the reviewer's own
    award boxes use."""
    return [{'key': key, 'description': SCHOOL_SUBJECT_DESCRIPTIONS.get(key, '')}
            for key in SCHOOL_SUBJECTS]


def build_analysis_payload(record: Dict[str, Any]) -> Dict[str, Any]:
    """Everything the analyzer should see about one record, and nothing else.

    Deliberately carries no student name or id: what a body of learning is worth
    does not depend on whose it is, and leaving identity out of the payload keeps
    it out of a third party's logs.
    """
    evidence = record.get('evidence') or []
    return {
        'claim': {
            'title': record.get('title'),
            'description': record.get('description'),
            'provider': record.get('provider'),
            'family_subject_guess': record.get('subject_hint'),
            'started_on': record.get('started_on'),
            'ended_on': record.get('ended_on'),
            'hours_estimate': record.get('hours_estimate'),
        },
        'evidence': [_evidence_entry(e) for e in evidence],
        'attachment_count': sum(1 for e in evidence
                                if e.get('evidence_type') in ATTACHMENT_TYPES),
        'subjects': subject_menu(),
    }


def _evidence_entry(evidence: Dict[str, Any]) -> Dict[str, Any]:
    kind = evidence.get('evidence_type')
    entry: Dict[str, Any] = {'type': kind, 'title': evidence.get('title')}
    if kind == 'text':
        entry['text'] = evidence.get('content')
    elif kind in ('link', 'video'):
        entry['url'] = evidence.get('url')
    else:
        entry['file_url'] = evidence.get('url')
        entry['file_name'] = evidence.get('file_name')
        entry['content_type'] = evidence.get('content_type')
        # The parent's own "what this is". Often the only thing that says which
        # year a scanned report card belongs to, so it must reach the analyzer.
        if evidence.get('content'):
            entry['note'] = evidence['content']
    return entry


def store_suggestion(record_id: str, org_id: str, suggestion: Dict[str, Any],
                     model: str) -> bool:
    """Save an analyzer result against a record. Never writes awarded_credits."""
    update = {
        'ai_status': 'complete',
        'ai_suggestion': suggestion,
        'ai_model': model,
        'ai_analyzed_at': datetime.now(timezone.utc).isoformat(),
        'ai_error': None,
    }
    return _write(record_id, org_id, update)


def store_failure(record_id: str, org_id: str, error: str,
                  model: Optional[str] = None) -> bool:
    return _write(record_id, org_id, {
        'ai_status': 'failed',
        'ai_error': (error or 'Analysis failed')[:500],
        'ai_model': model,
        'ai_analyzed_at': datetime.now(timezone.utc).isoformat(),
    })


def _write(record_id: str, org_id: str, update: Dict[str, Any]) -> bool:
    try:
        # admin client justified: prior_learning_records is service-role only;
        # the write is pinned to one record within one org.
        rows = (get_supabase_admin_client().table('prior_learning_records')
                .update(update).eq('id', record_id)
                .eq('organization_id', org_id).execute().data)
        return bool(rows)
    except Exception as e:  # noqa: BLE001
        logger.error(f'prior-learning AI write failed for {record_id}: {e}')
        return False
