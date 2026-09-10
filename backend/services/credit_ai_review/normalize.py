"""Everything the model said, checked before a reviewer ever sees it.

The failure this exists for is not "the model is wrong". It is "the model was
confidently wrong and the checklist looked tidy". A reviewer working a queue
reads a row of green ticks faster than they read the evidence, and the whole
point of the feature is to save them that time -- so a malformed answer has to
degrade into a smaller honest one, never into a plausible approval.

Concretely, three refusals:

  **An approval that contradicts itself is not an approval.** "Every criterion is
  met" alongside a not_met verdict, or alongside criteria it admits it could not
  check, becomes needs_human. The model does not get to have it both ways.

  **A citation of evidence nobody read is dropped.** Refs are checked against
  what the loader actually managed to open, so a ref to a skipped file cannot
  make a verdict look supported.

  **XP only ever moves down.** The model cannot raise a student's claim, and it
  cannot go below the platform floor. Both are clamped rather than trusted.

Modelled on _normalize in sis_prior_learning_analyzer.py, which learned the same
lesson about a credit table that added up but was invented.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Set

from config.constants import MIN_TASK_XP
from utils.evidence_labels import plain_paragraph, truncate

from services.credit_ai_review.evidence_loader import LoadResult
from services.credit_ai_review.prompt import PROMPT_VERSION
from services.credit_ai_review.schema import RECOMMENDATIONS, VERDICTS

MAX_FLAGS = 20
MAX_CONCERNS = 8
MAX_FEEDBACK_CHARS = 900
MAX_SUMMARY_CHARS = 1500
MAX_NOTE_CHARS = 300

#: Below this, the model is telling us it is guessing. Take it at its word.
MIN_APPROVE_CONFIDENCE = 0.6


def normalize_review(raw: Any, *, criteria: List[str], criteria_source: str,
                     load: LoadResult, requested_xp: int,
                     resubmission: Optional[Dict[str, Any]] = None,
                     model: Optional[str] = None,
                     extra_flags: Optional[List[str]] = None) -> Dict[str, Any]:
    """Turn a model answer into the row a reviewer reads. Never raises."""
    raw = raw if isinstance(raw, dict) else {}
    flags: List[str] = list(load.flags or [])
    flags.extend(extra_flags or [])

    readable_refs = {p.block_index for p in load.read_parts}
    known_refs = {p.block_index for p in load.parts}

    normalized_criteria = _normalize_criteria(
        raw.get('criteria'), criteria, readable_refs, known_refs, flags)

    recommendation = _normalize_recommendation(raw.get('recommendation'), flags)
    confidence = _clamp_confidence(raw.get('confidence'))
    recommendation = _guard_recommendation(
        recommendation, normalized_criteria, confidence, load, flags)

    if criteria_source == 'task_description':
        flags.append('This task has no written Definition of Done, so the work '
                     'was judged against its description.')

    return {
        'prompt_version': PROMPT_VERSION,
        'model': model,
        'criteria_source': criteria_source,
        'criteria': normalized_criteria,
        'recommendation': recommendation,
        'confidence': confidence,
        'summary': truncate(raw.get('summary') or '', MAX_SUMMARY_CHARS) or None,
        'xp': _normalize_xp(raw.get('xp'), requested_xp, flags),
        'feedback': _normalize_feedback(raw.get('feedback'), flags),
        'concerns': _normalize_concerns(raw.get('concerns')),
        'flags': _dedupe(flags)[:MAX_FLAGS],
        'evidence': load.manifest(),
        'evidence_read': load.stats(),
        'evidence_fingerprint': load.fingerprint,
        'resubmission': resubmission or None,
    }


def skipped_review(*, reason: str, load: Optional[LoadResult] = None,
                   criteria_source: str = 'success_criteria',
                   detail: Optional[str] = None) -> Dict[str, Any]:
    """The row stored when there was nothing to ask.

    Still carries the evidence manifest, because "AI could not read any of this"
    is exactly the moment a reviewer wants the per-file reasons.
    """
    flags = list(load.flags) if load else []
    if detail:
        flags.append(detail)
    return {
        'prompt_version': PROMPT_VERSION,
        'criteria_source': criteria_source,
        'criteria': [],
        'recommendation': 'needs_human',
        'confidence': 0.0,
        'summary': None,
        'skip_reason': reason,
        'xp': None,
        'feedback': {'celebrate': None, 'grow_this': None},
        'concerns': [],
        'flags': _dedupe(flags)[:MAX_FLAGS],
        'evidence': load.manifest() if load else [],
        'evidence_read': load.stats() if load else {},
        'evidence_fingerprint': load.fingerprint if load else None,
        'resubmission': None,
    }


# ── criteria ─────────────────────────────────────────────────────────────────

def _normalize_criteria(raw_criteria: Any, criteria: List[str],
                        readable_refs: Set[int], known_refs: Set[int],
                        flags: List[str]) -> List[Dict[str, Any]]:
    """Exactly one entry per criterion, whatever the model returned.

    A missing criterion becomes cannot_verify rather than disappearing: a
    checklist with four of five rows reads as a four-criterion task, and the
    reviewer never learns the fifth went unanswered.
    """
    by_index: Dict[int, Dict[str, Any]] = {}
    for entry in (raw_criteria or []):
        if not isinstance(entry, dict):
            continue
        try:
            index = int(entry['index'])
        except (KeyError, TypeError, ValueError):
            continue
        if index < 1 or index > len(criteria):
            flags.append(f'The AI answered about a criterion that does not exist (#{index}).')
            continue
        if index in by_index:
            continue
        by_index[index] = entry

    out: List[Dict[str, Any]] = []
    for i, text in enumerate(criteria, start=1):
        entry = by_index.get(i)
        if entry is None:
            # Not the same as the model SAYING cannot_verify. That is a judgment
            # about evidence it could not read; this is an answer that never
            # came, and approving on the strength of it would be approving a
            # criterion nobody checked. Marked so _guard_recommendation can
            # refuse the approval rather than only flagging it.
            flags.append(f'The AI did not answer criterion {i}.')
            out.append({
                'index': i, 'criterion': text, 'verdict': 'cannot_verify',
                'evidence_refs': [], 'note': 'The AI did not answer this one.',
                'unanswered': True,
            })
            continue

        verdict = entry.get('verdict')
        if verdict not in VERDICTS:
            flags.append(f'The AI gave criterion {i} an unrecognized verdict.')
            verdict = 'cannot_verify'

        refs = _normalize_refs(entry.get('evidence_refs'), readable_refs, known_refs, i, flags)
        out.append({
            'index': i,
            'criterion': text,
            'verdict': verdict,
            'evidence_refs': refs,
            'note': truncate(entry.get('note') or '', MAX_NOTE_CHARS) or None,
        })
    return out


def _normalize_refs(raw_refs: Any, readable_refs: Set[int], known_refs: Set[int],
                    criterion_index: int, flags: List[str]) -> List[int]:
    """Only refs to evidence the loader actually read.

    A ref to a piece we could not open would render as a clickable citation
    under a green tick, which is precisely the tidy-looking lie this module is
    here to prevent.
    """
    out: List[int] = []
    cited_unread = False
    for ref in (raw_refs or []):
        try:
            n = int(ref)
        except (TypeError, ValueError):
            continue
        if n in readable_refs and n not in out:
            out.append(n)
        elif n in known_refs:
            cited_unread = True
    if cited_unread:
        flags.append(
            f'The AI cited evidence for criterion {criterion_index} that it could not read.')
    return out


# ── recommendation ───────────────────────────────────────────────────────────

def _normalize_recommendation(raw: Any, flags: List[str]) -> str:
    if raw in RECOMMENDATIONS:
        return raw
    flags.append('The AI did not give a recognizable recommendation.')
    return 'needs_human'


def _clamp_confidence(raw: Any) -> float:
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return 0.0
    return round(max(0.0, min(1.0, value)), 2)


def _guard_recommendation(recommendation: str, criteria: List[Dict[str, Any]],
                          confidence: float, load: LoadResult,
                          flags: List[str]) -> str:
    """Refuse an approval the answer does not support.

    Each of these is a case where the model said "approve" and its own working
    says otherwise. The reviewer still approves whatever they like -- this only
    stops the queue from showing a green badge that invites a fast click.
    """
    if not criteria:
        flags.append('The AI produced no criterion verdicts.')
        return 'needs_human'

    verdicts = [c['verdict'] for c in criteria]

    if recommendation == 'approve':
        if any(c.get('unanswered') for c in criteria):
            flags.append('The AI recommended approval without answering every criterion.')
            return 'needs_human'
        if 'not_met' in verdicts:
            flags.append('The AI recommended approval while marking a criterion not met.')
            return 'needs_human'
        if all(v == 'cannot_verify' for v in verdicts):
            flags.append('The AI recommended approval without verifying anything.')
            return 'needs_human'
        if confidence < MIN_APPROVE_CONFIDENCE:
            flags.append(
                f'The AI recommended approval with low confidence ({confidence:.0%}).')
            return 'needs_human'
        if not load.anything_readable:
            flags.append('The AI recommended approval but no evidence could be read.')
            return 'needs_human'
    return recommendation


# ── xp ───────────────────────────────────────────────────────────────────────

def _normalize_xp(raw: Any, requested_xp: int, flags: List[str]) -> Dict[str, Any]:
    """The XP proposal, clamped so it can only ever cost the student less.

    Rounded to a multiple of 5 because the subject split rounds that way
    (utils/subject_xp.py); an odd total there gets silently adjusted into the
    largest subject, which is a number nobody chose.
    """
    requested = max(int(requested_xp or 0), 0)
    raw = raw if isinstance(raw, dict) else {}

    try:
        recommended = int(round(float(raw['recommended'])))
    except (KeyError, TypeError, ValueError):
        flags.append('The AI did not give a usable XP figure, so the requested amount stands.')
        recommended = requested

    if recommended > requested:
        flags.append('The AI suggested raising the XP, which it may not do. '
                     'The requested amount stands.')
        recommended = requested
    if recommended < MIN_TASK_XP:
        recommended = MIN_TASK_XP
    recommended = max(MIN_TASK_XP, 5 * round(recommended / 5))
    if requested and recommended > requested:
        # Rounding up past the request after the floor kicked in.
        recommended = requested

    return {
        'requested': requested,
        'recommended': recommended,
        'changed': recommended != requested,
        'rationale': truncate(raw.get('rationale') or '', MAX_NOTE_CHARS) or None,
    }


# ── prose ────────────────────────────────────────────────────────────────────

def _normalize_feedback(raw: Any, flags: List[str]) -> Dict[str, Optional[str]]:
    raw = raw if isinstance(raw, dict) else {}
    celebrate = plain_paragraph(raw.get('celebrate'), MAX_FEEDBACK_CHARS)
    grow_this = plain_paragraph(raw.get('grow_this'), MAX_FEEDBACK_CHARS)
    if not celebrate and not grow_this:
        flags.append('The AI did not draft any feedback.')
    return {'celebrate': celebrate, 'grow_this': grow_this}


def _normalize_concerns(raw: Any) -> List[str]:
    out: List[str] = []
    for item in (raw or []):
        if not item:
            continue
        text = truncate(str(item), MAX_NOTE_CHARS)
        if text and text not in out:
            out.append(text)
        if len(out) >= MAX_CONCERNS:
            break
    return out


def _dedupe(items: List[str]) -> List[str]:
    seen: Set[str] = set()
    out: List[str] = []
    for item in items:
        text = truncate(str(item), MAX_NOTE_CHARS)
        if text and text not in seen:
            seen.add(text)
            out.append(text)
    return out
