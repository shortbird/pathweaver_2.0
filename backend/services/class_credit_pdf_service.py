"""
Class Credit Portfolio PDF + award notification.

When an admin approves a class on the credit review dashboard, we email the
student (and their linked parents) a congratulations note with a PDF portfolio
of everything they did to earn the credit: every task, the written evidence,
embedded images, and uploaded documents merged in as actual pages (PDFs are
inserted page-for-page, Word docs have their text extracted). Video/audio and
external links are listed as references since they can't live inside a PDF.

Built with PyMuPDF (fitz) Story rendering — already a deployed dependency
(root requirements.txt), no new packages needed.
"""
import html as html_lib
import io
import re
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import fitz  # PyMuPDF
import requests

from database import get_supabase_admin_client
from utils.school_subjects import get_display_name
from utils.logger import get_logger

logger = get_logger(__name__)

OPTIO_PURPLE = '#6D469B'
OPTIO_PINK = '#EF597B'
TEXT_DARK = '#1f2937'
TEXT_MUTED = '#6b7280'

PAGE_MARGIN = 48            # pt
CONTENT_WIDTH_PX = 560      # usable width the Story engine lays out against
MAX_IMAGE_DIM = 1200        # px, longest side after normalization
JPEG_QUALITY = 80
MAX_DOC_PAGES = 30          # cap pages merged in per uploaded document
MAX_DOC_FETCH_BYTES = 25 * 1024 * 1024
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024  # keep the email under Brevo's limit
MAX_DOCX_CHARS = 20000
FETCH_TIMEOUT = 25

# Dependent accounts carry a login-less placeholder address — never email it.
PLACEHOLDER_EMAIL_MARKERS = ('optio-internal-placeholder',)

STORY_CSS = f"""
body {{ font-family: sans-serif; font-size: 10pt; color: {TEXT_DARK}; }}
h1 {{ font-size: 21pt; color: {OPTIO_PURPLE}; margin: 2pt 0; }}
h2 {{ font-size: 13pt; color: {OPTIO_PURPLE}; margin: 14pt 0 2pt 0; }}
p {{ margin: 5pt 0; line-height: 1.45; }}
.brand {{ font-size: 10pt; color: {OPTIO_PINK}; letter-spacing: 2px; font-weight: bold; }}
.muted {{ color: {TEXT_MUTED}; font-size: 9pt; }}
.credit-line {{ font-size: 12pt; color: {TEXT_DARK}; }}
.evidence-label {{ color: {TEXT_MUTED}; font-size: 8.5pt; letter-spacing: 1px; font-weight: bold; margin-top: 10pt; }}
.evidence-text {{ margin: 4pt 0; line-height: 1.45; }}
.ref {{ color: {TEXT_MUTED}; font-size: 9pt; margin: 3pt 0; }}
.doc-note {{ color: {OPTIO_PURPLE}; font-size: 9pt; font-style: italic; margin: 4pt 0; }}
.divider {{ border-top: 1px solid #e5e7eb; margin: 12pt 0 0 0; }}
"""


def _esc(value: Any) -> str:
    return html_lib.escape(str(value or ''))


def _text_to_html(text: str) -> str:
    return _esc(text).replace('\r\n', '\n').replace('\n', '<br>')


def _display_name(user: Dict[str, Any]) -> str:
    if not user:
        return 'Unknown'
    return (user.get('display_name')
            or f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
            or user.get('email') or 'Unknown')


def _is_real_email(email: Optional[str]) -> bool:
    if not email or '@' not in email:
        return False
    lowered = email.lower()
    return not any(marker in lowered for marker in PLACEHOLDER_EMAIL_MARKERS)


# ---------------------------------------------------------------------------
# Data gathering (mirrors the credit-review detail endpoint)
# ---------------------------------------------------------------------------

def collect_class_credit_data(quest_id: str) -> Optional[Dict[str, Any]]:
    """Everything needed to build the portfolio and address the email."""
    supabase = get_supabase_admin_client()

    quest = supabase.table('quests') \
        .select('id, title, big_idea, description, transcript_subject, created_by') \
        .eq('id', quest_id).eq('quest_type', 'class').single().execute()
    if not quest.data:
        return None
    q = quest.data
    student_id = q.get('created_by')
    if not student_id:
        return None

    student = supabase.table('users') \
        .select('id, email, display_name, first_name, last_name, managed_by_parent_id') \
        .eq('id', student_id).single().execute()
    student_data = student.data or {}

    completions = supabase.table('quest_task_completions') \
        .select('id, user_quest_task_id, completed_at, finalized_at') \
        .eq('quest_id', quest_id).eq('user_id', student_id) \
        .execute()
    task_ids = [c['user_quest_task_id'] for c in (completions.data or [])
                if c.get('user_quest_task_id')]

    tasks_map: Dict[str, Dict[str, Any]] = {}
    if task_ids:
        tasks = supabase.table('user_quest_tasks') \
            .select('id, title, description, pillar, xp_value, diploma_subjects, subject_xp_distribution') \
            .in_('id', task_ids).execute()
        tasks_map = {t['id']: t for t in (tasks.data or [])}

    evidence_by_task: Dict[str, List[Dict[str, Any]]] = {}
    if task_ids:
        docs = supabase.table('user_task_evidence_documents') \
            .select('id, task_id') \
            .eq('user_id', student_id).in_('task_id', task_ids).execute()
        doc_to_task = {d['id']: d['task_id'] for d in (docs.data or [])}
        if doc_to_task:
            blocks = supabase.table('evidence_document_blocks') \
                .select('id, document_id, block_type, content, order_index') \
                .in_('document_id', list(doc_to_task.keys())) \
                .order('order_index').execute()
            for b in (blocks.data or []):
                tid = doc_to_task.get(b['document_id'])
                if tid:
                    evidence_by_task.setdefault(tid, []).append(b)

    from routes.tasks.xp_helpers import get_subject_xp_distribution
    subject = q.get('transcript_subject')
    approved_xp = 0
    task_rows = []
    for c in (completions.data or []):
        t = tasks_map.get(c.get('user_quest_task_id'))
        if not t:
            continue
        xp_value = t.get('xp_value', 0)
        dist = get_subject_xp_distribution(t, xp_value)
        approved_xp += int(dist.get(subject, 0))
        task_rows.append({
            'title': t.get('title'),
            'description': t.get('description'),
            'xp_value': xp_value,
            'completed_at': c.get('completed_at') or c.get('finalized_at'),
            'evidence_blocks': evidence_by_task.get(t.get('id'), []),
        })
    task_rows.sort(key=lambda r: r.get('completed_at') or '')

    # Parents: managing parent (dependents) + approved parent_student_links.
    parent_ids = []
    if student_data.get('managed_by_parent_id'):
        parent_ids.append(student_data['managed_by_parent_id'])
    links = supabase.table('parent_student_links') \
        .select('parent_user_id') \
        .eq('student_user_id', student_id).eq('status', 'approved').execute()
    for link in (links.data or []):
        pid = link.get('parent_user_id')
        if pid and pid not in parent_ids:
            parent_ids.append(pid)
    parents = []
    if parent_ids:
        presult = supabase.table('users') \
            .select('id, email, display_name, first_name, last_name') \
            .in_('id', parent_ids).execute()
        parents = presult.data or []

    return {
        'quest': q,
        'subject': subject,
        'subject_display': get_display_name(subject or ''),
        'student': student_data,
        'parents': parents,
        'tasks': task_rows,
        'approved_xp': approved_xp,
        'credits': 0.5,  # a class awards a fixed half credit (CLASS_CREDIT_VALUE)
    }


# ---------------------------------------------------------------------------
# Asset fetching / normalization
# ---------------------------------------------------------------------------

def _fetch_bytes(url: str) -> Optional[bytes]:
    try:
        resp = requests.get(url, timeout=FETCH_TIMEOUT, stream=True)
        if resp.status_code != 200:
            logger.warning(f"Portfolio asset fetch {resp.status_code}: {url[:120]}")
            return None
        data = resp.raw.read(MAX_DOC_FETCH_BYTES + 1, decode_content=True)
        if len(data) > MAX_DOC_FETCH_BYTES:
            logger.warning(f"Portfolio asset too large, skipping embed: {url[:120]}")
            return None
        return data
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Portfolio asset fetch failed: {e}")
        return None


def _normalize_image(data: bytes) -> Optional[Tuple[bytes, int, int]]:
    """Re-encode any image (incl. HEIC) to a bounded JPEG the PDF can embed."""
    try:
        from PIL import Image, ImageOps
        try:
            import pillow_heif
            pillow_heif.register_heif_opener()
        except Exception:  # noqa: BLE001
            pass
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)
        if img.mode not in ('RGB', 'L'):
            img = img.convert('RGB')
        img.thumbnail((MAX_IMAGE_DIM, MAX_IMAGE_DIM))
        buf = io.BytesIO()
        img.save(buf, 'JPEG', quality=JPEG_QUALITY)
        return buf.getvalue(), img.width, img.height
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Portfolio image normalize failed: {e}")
        return None


def _docx_text(data: bytes) -> Optional[str]:
    try:
        from docx import Document
        doc = Document(io.BytesIO(data))
        paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
        text = '\n'.join(paragraphs)
        return text[:MAX_DOCX_CHARS] if text else None
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Portfolio docx extraction failed: {e}")
        return None


def _openable_pdf(data: bytes) -> Optional[bytes]:
    """Return the bytes if PyMuPDF can open them as an unencrypted PDF."""
    try:
        with fitz.open(stream=data, filetype='pdf') as doc:
            if doc.needs_pass or doc.page_count == 0:
                return None
        return data
    except Exception:  # noqa: BLE001
        return None


# ---------------------------------------------------------------------------
# PDF assembly
# ---------------------------------------------------------------------------

def _fmt_date(value: Optional[str]) -> str:
    if not value:
        return ''
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).strftime('%B %-d, %Y')
    except Exception:  # noqa: BLE001
        return value[:10]


IMAGE_EXTENSIONS = ('.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.bmp')


def _file_ext(item: Dict[str, Any]) -> str:
    name = (item.get('filename') or item.get('url') or '').lower().split('?')[0]
    dot = name.rfind('.')
    return name[dot:] if dot != -1 else ''


def _block_items(content: Dict[str, Any]) -> List[Dict[str, Any]]:
    """File blocks store either a single file's keys at the top level or a
    multi-file {'items': [...]} list (galleries, multi-upload)."""
    items = content.get('items')
    if isinstance(items, list):
        return [it for it in items if isinstance(it, dict)]
    return [content] if content.get('url') else []


def _image_fragment(item: Dict[str, Any], archive: fitz.Archive,
                    image_counter: List[int]) -> Optional[str]:
    url = (item.get('url') or '').strip()
    raw = _fetch_bytes(url) if url else None
    normalized = _normalize_image(raw) if raw else None
    if not normalized:
        return None
    jpeg, w, h = normalized
    image_counter[0] += 1
    name = f'img_{image_counter[0]}.jpg'
    archive.add(jpeg, name)
    disp_w = min(CONTENT_WIDTH_PX, w)
    disp_h = int(h * disp_w / max(w, 1))
    html = f'<p><img src="{name}" width="{disp_w}" height="{disp_h}"></p>'
    caption = item.get('caption') or item.get('title') or ''
    if caption and caption != item.get('filename'):
        html += f'<p class="muted">{_esc(caption)}</p>'
    return html


def _block_fragments(block: Dict[str, Any], archive: fitz.Archive,
                     image_counter: List[int], include_documents: bool
                     ) -> Tuple[str, List[bytes]]:
    """HTML for one evidence block, plus any PDF documents to merge after
    the task section. Falls back to a reference line whenever an asset
    can't be embedded."""
    btype = block.get('block_type')
    content = block.get('content') or {}
    if isinstance(content, str):
        content = {'text': content}

    if btype == 'text':
        text = content.get('text') or content.get('content') or ''
        if not str(text).strip():
            return '', []
        return f'<p class="evidence-text">{_text_to_html(text)}</p>', []

    fragments: List[str] = []
    pdf_docs: List[bytes] = []

    for item in _block_items(content):
        url = (item.get('url') or '').strip()
        filename = item.get('filename') or item.get('title') or (url.rsplit('/', 1)[-1][:80] or 'file')
        ext = _file_ext(item)
        content_type = (item.get('content_type') or '').lower()

        if btype == 'image' or (btype == 'document' and ext in IMAGE_EXTENSIONS):
            fragment = _image_fragment(item, archive, image_counter)
            fragments.append(fragment or f'<p class="ref">Image: {_esc(filename)} ({_esc(url)})</p>')
            continue

        if btype == 'document':
            looks_pdf = 'pdf' in content_type or ext == '.pdf'
            looks_docx = 'wordprocessingml' in content_type or ext == '.docx'
            if include_documents and (looks_pdf or looks_docx) and url:
                raw = _fetch_bytes(url)
                if raw and looks_pdf:
                    pdf_bytes = _openable_pdf(raw)
                    if pdf_bytes:
                        fragments.append(f'<p class="doc-note">Uploaded document included '
                                         f'on the following pages: {_esc(filename)}</p>')
                        pdf_docs.append(pdf_bytes)
                        continue
                if raw and looks_docx:
                    text = _docx_text(raw)
                    if text:
                        fragments.append(f'<p class="muted">From uploaded document {_esc(filename)}:</p>'
                                         f'<p class="evidence-text">{_text_to_html(text)}</p>')
                        continue
            fragments.append(f'<p class="ref">Document: {_esc(filename)} ({_esc(url)})</p>')
            continue

        if btype in ('video', 'audio'):
            duration = item.get('duration_seconds') or content.get('duration_seconds')
            length = ''
            if duration:
                length = f' ({int(duration // 60)}:{int(duration % 60):02d})'
            label = 'Video' if btype == 'video' else 'Audio'
            fragments.append(f'<p class="ref">{label} evidence: {_esc(filename)}{length} ({_esc(url)})</p>')
            continue

        title = item.get('title') or item.get('text') or url
        fragments.append(f'<p class="ref">Link: {_esc(title)} ({_esc(url)})</p>')

    if not fragments:
        url = (content.get('url') or '').strip()
        text = content.get('text')
        if text:
            return f'<p class="evidence-text">{_text_to_html(text)}</p>', []
        if url or btype == 'link':
            title = content.get('title') or content.get('text') or url
            return f'<p class="ref">Link: {_esc(title)} ({_esc(url)})</p>', []
        return '', []

    return ''.join(fragments), pdf_docs


def _story_to_pdf(html: str, archive: fitz.Archive) -> bytes:
    fileobj = io.BytesIO()
    writer = fitz.DocumentWriter(fileobj)
    story = fitz.Story(html=html, user_css=STORY_CSS, archive=archive)
    mediabox = fitz.paper_rect('letter')
    where = mediabox + (PAGE_MARGIN, PAGE_MARGIN, -PAGE_MARGIN, -PAGE_MARGIN)
    more = 1
    while more:
        device = writer.begin_page(mediabox)
        more, _ = story.place(where)
        story.draw(device)
        writer.end_page()
    writer.close()
    return fileobj.getvalue()


def build_class_credit_pdf(data: Dict[str, Any], include_documents: bool = True) -> Optional[bytes]:
    """Render the portfolio. Returns None only on unexpected failure."""
    quest = data['quest']
    student_name = _display_name(data['student'])
    awarded = datetime.now(timezone.utc).strftime('%B %-d, %Y')
    description = quest.get('big_idea') or quest.get('description') or ''

    cover = [
        '<p class="brand">OPTIO</p>',
        f'<h1>{_esc(quest.get("title"))}</h1>',
        f'<p class="credit-line"><b>{_esc(student_name)}</b> earned '
        f'<b>{data["credits"]} credit</b> in <b>{_esc(data["subject_display"])}</b></p>',
        f'<p class="muted">Credit awarded {awarded} &#183; {data["approved_xp"]} XP '
        f'across {len(data["tasks"])} completed tasks</p>',
    ]
    if description:
        cover.append(f'<p>{_text_to_html(description)}</p>')
    cover.append('<p class="muted">This portfolio documents the work completed to earn '
                 'this transcript credit. Evidence appears exactly as the student '
                 'submitted it; uploaded documents are included as full pages.</p>')

    archive = fitz.Archive()
    image_counter = [0]
    segments: List[Tuple[str, Any]] = []
    html_parts: List[str] = cover

    for idx, task in enumerate(data['tasks'], start=1):
        html_parts.append('<div class="divider"></div>')
        html_parts.append(f'<h2>Task {idx}: {_esc(task.get("title"))}</h2>')
        meta = f'{task.get("xp_value", 0)} XP'
        completed = _fmt_date(task.get('completed_at'))
        if completed:
            meta += f' &#183; Completed {completed}'
        html_parts.append(f'<p class="muted">{meta}</p>')
        if task.get('description'):
            html_parts.append(f'<p>{_text_to_html(task["description"])}</p>')

        blocks = task.get('evidence_blocks') or []
        if blocks:
            html_parts.append('<p class="evidence-label">EVIDENCE</p>')
        pending_pdfs: List[bytes] = []
        for block in blocks:
            fragment, pdf_docs = _block_fragments(block, archive, image_counter, include_documents)
            if fragment:
                html_parts.append(fragment)
            pending_pdfs.extend(pdf_docs)

        # Flush the story so this task's uploaded PDFs land right after it.
        for pdf_bytes in pending_pdfs:
            segments.append(('story', ''.join(html_parts)))
            html_parts = []
            segments.append(('pdf', pdf_bytes))

    if html_parts:
        segments.append(('story', ''.join(html_parts)))

    try:
        output = fitz.open()
        for kind, payload in segments:
            if kind == 'story':
                rendered = _story_to_pdf(f'<body>{payload}</body>', archive)
                with fitz.open(stream=rendered, filetype='pdf') as part:
                    output.insert_pdf(part)
            else:
                with fitz.open(stream=payload, filetype='pdf') as part:
                    last = min(part.page_count, MAX_DOC_PAGES) - 1
                    output.insert_pdf(part, from_page=0, to_page=last)
        output.set_metadata({
            'title': f'{quest.get("title")} - Credit Portfolio',
            'author': student_name,
            'creator': 'Optio',
        })
        result = output.tobytes(garbage=3, deflate=True)
        output.close()
        return result
    except Exception as e:  # noqa: BLE001
        logger.error(f"Portfolio PDF assembly failed: {e}", exc_info=True)
        return None


def generate_class_credit_pdf(quest_id: str) -> Tuple[Optional[bytes], Optional[Dict[str, Any]]]:
    """Collect data and render, retrying without merged documents (then
    without any attachment) if the result would be too large to email."""
    data = collect_class_credit_data(quest_id)
    if not data:
        return None, None
    pdf = build_class_credit_pdf(data, include_documents=True)
    if pdf and len(pdf) > MAX_ATTACHMENT_BYTES:
        logger.info(f"Portfolio for {quest_id[:8]} is {len(pdf)} bytes; retrying without merged documents")
        pdf = build_class_credit_pdf(data, include_documents=False)
    if pdf and len(pdf) > MAX_ATTACHMENT_BYTES:
        logger.warning(f"Portfolio for {quest_id[:8]} still too large to attach; sending email without it")
        pdf = None
    return pdf, data


# ---------------------------------------------------------------------------
# Award notification (called from the approve endpoint)
# ---------------------------------------------------------------------------

def _safe_filename(student_name: str, class_title: str) -> str:
    stem = f"{student_name} - {class_title} - Credit Portfolio"
    stem = re.sub(r'[^A-Za-z0-9 _.-]+', '', stem).strip()[:120] or 'Credit Portfolio'
    return f'{stem}.pdf'


def send_class_credit_awarded_notification(quest_id: str) -> bool:
    """Build the portfolio and email the student + parents. Synchronous;
    use notify_class_credit_awarded_async from request handlers."""
    try:
        pdf, data = generate_class_credit_pdf(quest_id)
        if not data:
            logger.warning(f"Credit award email skipped, no data for quest {quest_id[:8]}")
            return False

        student = data['student']
        student_name = student.get('first_name') or _display_name(student)
        parent_emails = [p['email'] for p in data['parents'] if _is_real_email(p.get('email'))]
        student_email = student.get('email') if _is_real_email(student.get('email')) else None

        if student_email:
            to_email, cc = student_email, parent_emails
        elif parent_emails:
            to_email, cc = parent_emails[0], parent_emails[1:]
        else:
            logger.warning(f"Credit award email skipped for quest {quest_id[:8]}: no reachable addresses")
            return False

        attachments = None
        if pdf:
            attachments = [{
                'filename': _safe_filename(_display_name(student), data['quest'].get('title') or 'Class'),
                'content': pdf,
                'mimetype': 'application/pdf',
            }]

        from services.email_service import email_service
        sent = email_service.send_class_credit_awarded_email(
            to_email=to_email,
            cc=cc or None,
            student_name=student_name,
            class_title=data['quest'].get('title') or 'your class',
            subject_display=data['subject_display'],
            credits=data['credits'],
            attachments=attachments,
        )
        logger.info(f"Credit award email for quest {quest_id[:8]}: sent={sent}, "
                    f"to={to_email}, cc={len(cc or [])}, attachment={'yes' if pdf else 'no'}")
        return sent
    except Exception as e:  # noqa: BLE001
        logger.error(f"Credit award notification failed for quest {quest_id[:8]}: {e}", exc_info=True)
        return False


def notify_class_credit_awarded_async(quest_id: str) -> None:
    """Fire-and-forget: PDF assembly fetches every asset, so it can take a
    while — never block the approval response on it. The DB client helpers
    require an app context, so the worker runs inside one."""
    from flask import current_app
    app = current_app._get_current_object()

    def _run():
        with app.app_context():
            send_class_credit_awarded_notification(quest_id)

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    logger.info(f"[BG] Spawned credit award notification for quest {quest_id[:8]}")
