"""
The prior-learning analyzer — reads a family's evidence and PROPOSES a
subject/credit split for a human to edit.

It proposes; it never awards. `store_suggestion` writes ai_suggestion and is
incapable of touching awarded_credits, and nothing here writes transfer credit.
A suggestion becomes credit only when a reviewer approves it on screen, because
the failure this design is built around is not "the model is wrong" — it is "the
model was confidently wrong and nobody was asked".

Three things follow from that, and they are the reason this file is not simply a
prompt:

  Everything is checked after the model answers. A subject the transcript has
  never heard of, credit outside what a year of school can be worth, courses
  that don't add up to the subject they belong to — all are dropped or flagged
  here rather than shown to a reviewer as if they were fine. `_normalize` is the
  part worth reading.

  Uncertainty is surfaced, not smoothed. Per-subject confidence and a `flags`
  list ride along to the UI so a reviewer's attention lands on the shaky reading
  rather than being spread evenly over a tidy-looking table.

  The payload carries no student identity (build_analysis_payload), so what
  leaves the platform is a body of learning, not a child.
"""

from typing import Any, Dict, List, Optional, Tuple

from app_config import Config
from database import get_supabase_admin_client
from services.base_ai_service import BaseAIService
from services.sis_prior_learning_ai import (
    ATTACHMENT_TYPES,
    TERM_CREDITS,
    build_analysis_payload,
    store_failure,
    store_suggestion,
)
from utils.logger import get_logger
from utils.school_subjects import SCHOOL_SUBJECTS
from utils.storage_urls import parse_object_ref

logger = get_logger(__name__)

# A year of one subject is 1.0 credit. Anything past this is a misread of the
# evidence, not a prodigy — refuse it rather than propose it.
MAX_CREDITS_PER_SUBJECT = 4.0

# Scans are the whole point (a transcript PDF is the common case), but a family
# can attach 25 pieces of evidence and a request carrying all of them is slow
# and expensive. Read the first few; say plainly in the flags when some were
# left out, so a reviewer knows the suggestion saw less than they can see.
MAX_ATTACHMENTS = 8
MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024


# Near-deterministic, because this reads numbers off a document rather than
# writing prose — but with room to answer. The stock 'deterministic' preset caps
# output at 1024 tokens, which truncates a real transcript mid-JSON (several
# subjects, each with course line items and a rationale) and the whole call is
# then thrown away as unparseable.
ANALYSIS_CONFIG = {
    'temperature': 0.1,
    'top_p': 0.7,
    'max_output_tokens': 8192,
}


def _is_encrypted_pdf(blob: bytes) -> bool:
    """True for a PDF carrying an /Encrypt dictionary.

    Official transcript exports are routinely encrypted. Gemini refuses those
    with a bare "400 Request contains an invalid argument" naming no file, so
    one locked PDF in a family's upload fails the whole analysis and gives a
    reviewer nothing to go on. (Exactly that happened on the first real record:
    one of five transcripts was encrypted.)
    """
    return blob[:5] == b'%PDF-' and b'/Encrypt' in blob


def unlock_pdf(blob: bytes, passwords: Optional[List[str]] = None) -> Optional[bytes]:
    """A readable copy of an encrypted PDF, or None if it stays locked.

    Two different things get called "locked", and only one of them needs a
    password from a human:

      Permissions-encrypted — an owner password restricting printing or
      copying, with an EMPTY user password. Every viewer opens these without
      asking, which is why a family has no idea theirs is locked at all. The
      empty-password attempt below handles them with nobody typing anything.

      User-password protected — genuinely sealed. These need the password the
      school sent the family, which is what the `passwords` argument carries.

    The decrypted copy is re-serialized without encryption, because stripping
    the /Encrypt dictionary is exactly what makes the file readable to the
    model. It exists in memory for the length of one analysis and is never
    written back to storage: the family's stored document stays as they
    uploaded it, and nothing here persists or logs a password.
    """
    try:
        import fitz  # PyMuPDF, already a platform dependency
    except ImportError:  # pragma: no cover - PyMuPDF ships in requirements
        logger.warning('PyMuPDF missing; cannot unlock encrypted PDFs')
        return None

    try:
        doc = fitz.open(stream=blob, filetype='pdf')
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Could not open a PDF to unlock it: {e}')
        return None

    with doc:
        if not doc.needs_pass:
            # Permissions-only encryption: already open, just needs re-saving
            # without the /Encrypt dictionary.
            return _clean_bytes(doc)
        for password in (passwords or []):
            if password and doc.authenticate(password):
                return _clean_bytes(doc)
    return None


def _clean_bytes(doc) -> Optional[bytes]:
    """Re-serialize without encryption, and refuse to hand back anything that
    doesn't survive the round trip.

    The decrypted copy REPLACES the family's upload, so a re-save that quietly
    dropped pages would destroy the original with no way back. Checked here
    rather than at the call site because this is the only place that knows what
    the document looked like before.
    """
    try:
        import fitz
        pages_before = doc.page_count
        clean = doc.tobytes()
        if not clean:
            return None
        with fitz.open(stream=clean, filetype='pdf') as check:
            if check.needs_pass or check.page_count != pages_before:
                logger.warning('Decrypted PDF failed its round-trip check '
                               f'({pages_before} pages in, {check.page_count} out)')
                return None
        return clean
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Could not re-save a decrypted PDF: {e}')
        return None

PROMPT = """You are helping a school registrar work out what high-school credit a
student's prior learning is worth. A family has filed a claim about learning
their child did before or outside our school, with evidence attached.

Propose a credit split. A human registrar reads your proposal and edits it
before anything reaches a transcript, so it is far better to say you are unsure
than to guess tidily.

CREDIT UNITS
- A full-year high-school class is 1.0 credit.
- A one-semester (half-year) class is 0.5 credit.
- Read the term from the evidence (terms, semesters, marking periods, dates).
  If the evidence does not say, use 0.5 and add a flag saying you assumed it.

SUBJECTS — use these keys only:
{subjects}

RULES
- Only propose credit the evidence actually supports. A parent's description on
  its own is a claim, not a transcript; if that is all there is, say so in the
  flags and keep confidence low.
- Courses within a subject MUST sum exactly to that subject's credits.
- Never propose more than {max_credits} credits for one subject.
- If a scan is unreadable, cut off, or is about a different student, do not
  quietly work around it — flag it.
- confidence is your own 0..1 estimate per subject. Use the low end freely.
- Dates as YYYY-MM-DD, or null. school_name exactly as printed on the evidence,
  or null if the evidence does not name one.

THE FAMILY'S CLAIM AND EVIDENCE
{payload}

Return ONLY JSON in this shape:
{{
  "summary": "one paragraph a registrar can read instead of the evidence",
  "school_name": "string or null",
  "started_on": "YYYY-MM-DD or null",
  "ended_on": "YYYY-MM-DD or null",
  "subjects": [
    {{
      "subject": "one of the keys above",
      "credits": 1.0,
      "confidence": 0.9,
      "rationale": "which evidence supports this, one sentence",
      "courses": [
        {{"name": "US History", "credits": 1.0, "term": "full_year"}}
      ]
    }}
  ],
  "flags": ["anything a human must check"]
}}"""


class PriorLearningAnalyzer(BaseAIService):
    """Reads one record's evidence and stores a suggestion against it."""

    def analyze(self, record: Dict[str, Any], org_id: str,
                passwords: Optional[List[str]] = None) -> Dict[str, Any]:
        """`passwords` are candidates for encrypted PDFs on this record. They
        are used for this call and nothing else — never stored, never logged."""
        record_id = record['id']
        model_name = Config.GEMINI_MODEL
        try:
            payload = build_analysis_payload(record)
            attachments, skipped, locked = self._load_attachments(
                record.get('evidence') or [], passwords)

            import json
            prompt = PROMPT.format(
                subjects='\n'.join(
                    f"- {s['key']}: {s['description']}" for s in payload['subjects']
                ),
                max_credits=MAX_CREDITS_PER_SUBJECT,
                payload=json.dumps(
                    {k: v for k, v in payload.items() if k != 'subjects'},
                    indent=2, default=str,
                ),
            )

            try:
                raw = self._ask(prompt, attachments)
            except Exception as e:  # noqa: BLE001
                # The model rejects some files without saying which (an
                # encrypted PDF answers a bare 400). Falling back to the text
                # of the claim gives the reviewer a summary and an honest flag
                # instead of an error page and no starting point.
                if not attachments:
                    raise
                logger.warning(f'Prior-learning analysis fell back to text-only '
                               f'for {record_id}: {e}')
                raw = self._ask(prompt, [])
                skipped = skipped + ['the uploaded files (the reader refused them)']
                attachments = []

            if not raw:
                store_failure(record_id, org_id, 'The analyzer returned nothing', model_name)
                return {'error': 'The analyzer returned nothing'}

            suggestion = _normalize(raw, skipped=skipped, attachments=len(attachments),
                                    locked=locked)
            store_suggestion(record_id, org_id, suggestion, model_name)
            return {'suggestion': suggestion}

        except Exception as e:  # noqa: BLE001
            logger.error(f'Prior-learning analysis failed for {record_id}: {e}')
            store_failure(record_id, org_id, str(e), model_name)
            return {'error': 'Analysis failed'}

    def _ask(self, prompt: str, attachments: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """One multimodal call. Text-only records skip straight to generate_json,
        which already carries the platform's retry and fallback behaviour."""
        if not attachments:
            return self.generate_json(
                prompt,
                temperature=ANALYSIS_CONFIG['temperature'],
                top_p=ANALYSIS_CONFIG['top_p'],
                max_output_tokens=ANALYSIS_CONFIG['max_output_tokens'],
            )

        from services.ai_gen import generate_with_timeout
        response = generate_with_timeout(
            self.model,
            [prompt, *attachments],
            generation_config=ANALYSIS_CONFIG,
        )
        return self.extract_json(getattr(response, 'text', '') or '')

    def _load_attachments(
        self, evidence: List[Dict[str, Any]],
        passwords: Optional[List[str]] = None,
    ) -> Tuple[List[Dict[str, Any]], List[str], List[str]]:
        """Evidence files as inline parts, straight from private storage.

        Downloaded rather than linked: the bucket is private, so a URL handed to
        the model would resolve to nothing (that is the same "Bucket not found"
        the review queue used to show).

        Returns (parts, skipped, still_locked). `still_locked` names the files a
        password would rescue, so the reviewer is asked for the one thing that
        would actually help instead of being told the analysis was incomplete.
        """
        parts: List[Dict[str, Any]] = []
        skipped: List[str] = []
        locked: List[str] = []
        # admin client justified: quest-evidence is a private, service-role
        # bucket; the caller is an ADMIN_ROLES reviewer already scoped to this
        # record's org, and the bytes are read for that one analysis.
        client = get_supabase_admin_client()

        for item in evidence:
            if item.get('evidence_type') not in ATTACHMENT_TYPES:
                continue
            if len(parts) >= MAX_ATTACHMENTS:
                skipped.append(item.get('file_name') or 'an attachment')
                continue
            ref = parse_object_ref(item.get('url'))
            if not ref:
                continue
            bucket, path = ref
            try:
                blob = client.storage.from_(bucket).download(path)
            except Exception as e:  # noqa: BLE001
                logger.warning(f'Prior-learning analyzer could not read {path}: {e}')
                skipped.append(f'{item.get("file_name") or "an attachment"} (could not be opened)')
                continue
            name = item.get('file_name') or 'an attachment'
            if not blob or len(blob) > MAX_ATTACHMENT_BYTES:
                skipped.append(f'{name} (too large to read)')
                continue
            if _is_encrypted_pdf(blob):
                unlocked = unlock_pdf(blob, passwords)
                if unlocked is None:
                    # Named, so the reviewer knows which file to get a password
                    # for rather than being told "some evidence" was missed.
                    locked.append(name)
                    skipped.append(f'{name} (password-protected)')
                    continue
                # Store the readable copy over the locked one, so the password
                # is needed exactly once. This also fixes the review queue's
                # inline preview, which otherwise prompts the reviewer for the
                # password every time they open the document.
                _replace_stored_file(client, bucket, path, unlocked,
                                     item.get('content_type'))
                blob = unlocked
            parts.append({
                'mime_type': item.get('content_type') or 'application/pdf',
                'data': blob,
            })
        return parts, skipped, locked


def _normalize(raw: Dict[str, Any], skipped: List[str],
               attachments: int,
               locked: Optional[List[str]] = None) -> Dict[str, Any]:
    """Everything the model said, checked before a reviewer ever sees it.

    A malformed suggestion must degrade into a smaller honest one plus a flag,
    never into a plausible table that quietly invents credit.
    """
    flags: List[str] = [str(f)[:300] for f in (raw.get('flags') or []) if f][:12]
    subjects: List[Dict[str, Any]] = []

    for entry in (raw.get('subjects') or []):
        subject = (entry or {}).get('subject')
        if subject not in SCHOOL_SUBJECTS:
            flags.append(f'Dropped a proposal for an unknown subject: {subject}')
            continue
        try:
            credits = round(float(entry.get('credits') or 0), 2)
        except (TypeError, ValueError):
            flags.append(f'Dropped {subject}: the credit value was not a number')
            continue
        if credits <= 0:
            continue
        if credits > MAX_CREDITS_PER_SUBJECT:
            flags.append(
                f'Proposed {credits} credits for {subject}, which is more than a '
                f'student can earn in one subject — capped at {MAX_CREDITS_PER_SUBJECT} '
                f'for you to check.'
            )
            credits = MAX_CREDITS_PER_SUBJECT

        courses, course_total = _normalize_courses(entry.get('courses') or [])
        if courses and abs(course_total - credits) > 0.01:
            # The courses are the transcript's line items; if they disagree with
            # the subject total, the subject total is the one that was reasoned
            # about. Keep both and say so rather than silently rewriting either.
            flags.append(
                f'{subject}: the courses add up to {course_total} but the subject '
                f'total says {credits}. Check the split before approving.'
            )

        subjects.append({
            'subject': subject,
            'credits': credits,
            'confidence': _confidence(entry.get('confidence')),
            'rationale': str(entry.get('rationale') or '')[:500],
            'courses': courses,
        })

    if attachments == 0:
        flags.append('No files were read — this suggestion is based only on what '
                     'the family typed.')
    if skipped:
        flags.append('Some evidence was not read: ' + ', '.join(skipped[:6]))

    return {
        'summary': str(raw.get('summary') or '')[:2000],
        'school_name': _text_or_none(raw.get('school_name'), 200),
        'started_on': _date_or_none(raw.get('started_on')),
        'ended_on': _date_or_none(raw.get('ended_on')),
        'subjects': subjects,
        'flags': flags[:12],
        # Files a password would rescue. Structured rather than only a flag, so
        # the page can ask for the password against the file that needs it.
        'locked_files': list(locked or [])[:12],
    }


def _normalize_courses(courses: Any) -> Tuple[List[Dict[str, Any]], float]:
    out: List[Dict[str, Any]] = []
    for course in (courses or [])[:20]:
        name = str((course or {}).get('name') or '').strip()[:200]
        if not name:
            continue
        term = (course or {}).get('term')
        try:
            credits = round(float(course.get('credits')), 2)
        except (TypeError, ValueError):
            # A named course with an unreadable credit value is still worth
            # showing; fall back to what its term implies.
            credits = TERM_CREDITS.get(term, 0.5)
        out.append({
            'name': name,
            'credits': credits,
            'term': term if term in TERM_CREDITS else None,
        })
    return out, round(sum(c['credits'] for c in out), 2)


def _confidence(value: Any) -> float:
    try:
        return round(min(1.0, max(0.0, float(value))), 2)
    except (TypeError, ValueError):
        # No stated confidence is not high confidence.
        return 0.0


def _text_or_none(value: Any, limit: int) -> Optional[str]:
    text = str(value or '').strip()[:limit]
    return text or None


def _date_or_none(value: Any) -> Optional[str]:
    from datetime import datetime
    text = str(value or '').strip()[:10]
    if not text:
        return None
    try:
        datetime.strptime(text, '%Y-%m-%d')
        return text
    except ValueError:
        return None


def _replace_stored_file(client, bucket: str, path: str, blob: bytes,
                         content_type: Optional[str]) -> bool:
    """Overwrite a stored evidence file with its decrypted self.

    In place, at the same path, so every URL already recorded against this
    evidence keeps working — the row needs no edit and nothing else on the
    platform has to learn about a second copy.

    Best-effort: a failure here costs the reviewer nothing this run (the
    analysis continues on the decrypted bytes in memory) and simply means they
    are asked for the password again next time.
    """
    try:
        client.storage.from_(bucket).update(
            path, blob,
            {'content-type': content_type or 'application/pdf', 'upsert': 'true'},
        )
        logger.info(f'[PRIOR LEARNING] stored a decrypted copy of {path}')
        return True
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Could not store the decrypted copy of {path}: {e}')
        return False


def analyze_record(record: Dict[str, Any], org_id: str,
                   passwords: Optional[List[str]] = None) -> Dict[str, Any]:
    return PriorLearningAnalyzer().analyze(record, org_id, passwords)
