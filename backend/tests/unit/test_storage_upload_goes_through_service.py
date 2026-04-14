"""P1 lint: direct `storage.from_(...).upload(...)` calls in routes/ must
not grow.

Evidence and media uploads should route through ``MediaUploadService``
(see ``services/media_upload_service.py``). Avatar/site-asset uploads
use ``FileUploadService``. A handful of legacy sites (uploads.py raw
evidence endpoints, admin/transfer_credits, parental_consent signing,
spark_integration LMS bridge) still have direct calls — we freeze them
at the baseline rather than block the count from going up.

Remove entries from the baseline as sites migrate; never raise it.
"""

from __future__ import annotations

import ast
from pathlib import Path

ROUTES = Path(__file__).resolve().parents[2] / "routes"

# Baseline set 2026-04-14 — count of .upload() calls on the chain
# `supabase.storage.from_(...)` in routes/. Ratchet down only.
BASELINE = 10


def _direct_storage_upload_sites() -> list[str]:
    hits: list[str] = []
    for path in ROUTES.rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            # Match `<thing>.upload(...)` where <thing> is a call
            # `<obj>.storage.from_(<bucket>)` — shape we want to track.
            func = node.func
            if not (isinstance(func, ast.Attribute) and func.attr == "upload"):
                continue
            inner = func.value
            if not (isinstance(inner, ast.Call) and isinstance(inner.func, ast.Attribute)):
                continue
            if inner.func.attr != "from_":
                continue
            storage_attr = inner.func.value
            if not (isinstance(storage_attr, ast.Attribute) and storage_attr.attr == "storage"):
                continue
            hits.append(f"{path.relative_to(ROUTES)}:{node.lineno}")
    return hits


def test_direct_storage_upload_count_does_not_grow():
    hits = _direct_storage_upload_sites()
    assert len(hits) <= BASELINE, (
        f"Direct supabase.storage.from_(...).upload() calls in routes/ grew "
        f"from baseline {BASELINE} to {len(hits)}. New uploads must go "
        "through services.media_upload_service.MediaUploadService "
        "(evidence/media) or services.file_upload_service.FileUploadService "
        "(images/avatars/site assets).\n" + "\n".join(hits)
    )
