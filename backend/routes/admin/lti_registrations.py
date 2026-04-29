"""
Superadmin CRUD for Canvas LTI registrations.

Each row maps a (issuer, client_id, deployment_id) triple — the values an
institution gets when it creates an LTI Developer Key in Canvas — to an
Optio organization. Per the locked product decision, this is set up
manually by an Optio superadmin before the institution can launch.

Auth: superadmin only (uses @require_superadmin from utils.auth).
"""

from __future__ import annotations

from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from database import get_supabase_admin_client
from utils.auth.decorators import require_superadmin
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint(
    "admin_lti_registrations", __name__, url_prefix="/api/admin/lti-registrations"
)


REQUIRED_FIELDS = (
    "issuer",
    "client_id",
    "deployment_id",
    "organization_id",
    "auth_login_url",
    "auth_token_url",
    "public_jwks_url",
)


@bp.route("", methods=["GET"])
@require_superadmin
def list_registrations(user_id: str):
    # admin client justified: superadmin-only LTI registration management; lti_registrations is global infrastructure, not RLS-bound to any single org
    supabase = get_supabase_admin_client()
    result = (
        supabase.table("lti_registrations")
        .select(
            "id, issuer, client_id, deployment_id, organization_id, auth_login_url, "
            "auth_token_url, public_jwks_url, notes, is_active, created_at, updated_at"
        )
        .order("created_at", desc=True)
        .execute()
    )
    return jsonify({"registrations": result.data or []}), 200


@bp.route("", methods=["POST"])
@require_superadmin
def create_registration(user_id: str):
    data = request.get_json(silent=True) or {}
    missing = [f for f in REQUIRED_FIELDS if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    payload = {field: data[field] for field in REQUIRED_FIELDS}
    payload["notes"] = data.get("notes")
    payload["is_active"] = bool(data.get("is_active", True))

    # admin client justified: superadmin-only LTI registration management; lti_registrations is global infrastructure, not RLS-bound to any single org
    supabase = get_supabase_admin_client()
    try:
        result = supabase.table("lti_registrations").insert(payload).execute()
    except Exception as e:
        logger.error(f"[admin LTI] insert failed: {e}")
        return jsonify({"error": "Could not create registration (duplicate?)"}), 400
    return jsonify({"registration": result.data[0]}), 201


@bp.route("/<registration_id>", methods=["PATCH"])
@require_superadmin
def update_registration(user_id: str, registration_id: str):
    data = request.get_json(silent=True) or {}
    allowed = {
        "issuer",
        "client_id",
        "deployment_id",
        "organization_id",
        "auth_login_url",
        "auth_token_url",
        "public_jwks_url",
        "notes",
        "is_active",
    }
    update = {k: v for k, v in data.items() if k in allowed}
    if not update:
        return jsonify({"error": "No allowed fields to update"}), 400
    update["updated_at"] = datetime.now(timezone.utc).isoformat()

    # admin client justified: superadmin-only LTI registration management; lti_registrations is global infrastructure, not RLS-bound to any single org
    supabase = get_supabase_admin_client()
    result = (
        supabase.table("lti_registrations")
        .update(update)
        .eq("id", registration_id)
        .execute()
    )
    if not result.data:
        return jsonify({"error": "Registration not found"}), 404
    return jsonify({"registration": result.data[0]}), 200


@bp.route("/<registration_id>", methods=["DELETE"])
@require_superadmin
def delete_registration(user_id: str, registration_id: str):
    # admin client justified: superadmin-only LTI registration management; lti_registrations is global infrastructure, not RLS-bound to any single org
    supabase = get_supabase_admin_client()
    supabase.table("lti_registrations").delete().eq("id", registration_id).execute()
    return jsonify({"ok": True}), 200
