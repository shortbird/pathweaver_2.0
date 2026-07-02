#!/usr/bin/env python3
"""
Seed a demo OpenEd homeschool family for the OpenEd marketplace pitch.

Story: an OpenEd family picks learning resources from the OpenEd marketplace
(Khan Academy, Outschool, Beast Academy, KiwiCo, ST Math, Easy Peasy). For each
resource they select, Optio spins up a *quest* aligned to that resource so the
family can track their learning with it. One parent manages all three kids from
the Optio app, and each kid's completed tasks + journal entries roll up into the
weekly "learning log" that OpenEd families are required to submit.

This is a DIFFERENT program from "OpenEd Academy" (OEA). These are plain
platform accounts (organization_id = NULL), not OEA.

Creates real accounts in prod Supabase so the iOS simulator (which points at the
prod DB via the local backend) shows them immediately:

  - jenna.rivera@opened-demo.example   (parent, manages all 3 kids)
  - Liam  (16) — dependent — Khan Academy Algebra 2, Outschool writing, Khan Chemistry
  - Sofia (10) — dependent — Beast Academy math, KiwiCo Tinker Crate, Outschool Spanish
  - Noah  ( 7) — dependent — ST Math, Easy Peasy reading, KiwiCo Koala Crate

All accounts share the demo password OptioDemo2026! (same convention as the
Mitchell App-Review family). Only the parent has a usable login; the kids are
COPPA-style dependents managed by the parent (parent uses the Family tab +
"act as" to view each child).

Idempotent: re-running deletes the prior OpenEd demo (parent by
@opened-demo.example, kids by managed_by_parent_id) and reseeds. It does NOT
touch the @optio-demo.example Mitchell family.

Usage:
  cd backend && .venv/bin/python scripts/seed_opened_demo.py             # full reseed
  cd backend && .venv/bin/python scripts/seed_opened_demo.py --extras-only
    # re-seed only bounties + message history onto the EXISTING demo users
    # (keeps user ids / active sessions stable)
"""

from __future__ import annotations

import os
import sys
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from supabase import create_client, Client
from app_config import Config


# ── Config ────────────────────────────────────────────────────────────────────

DEMO_EMAIL_DOMAIN = "@opened-demo.example"
DEMO_PASSWORD = "OptioDemo2026!"
PARENT_EMAIL = f"jenna.rivera{DEMO_EMAIL_DOMAIN}"


def avatar(seed: str, extra: str = "") -> str:
    # skinColor pinned so the whole family matches; seeds are hand-picked to
    # look like the right age/gender AT THIS TONE (changing the tone can
    # reveal features like facial hair that were invisible on the default).
    # `extra` pins additional dicebear options (e.g. "&hair=pigtails").
    return f"https://api.dicebear.com/9.x/personas/png?seed={seed}&size=256&skinColor=e5a07e{extra}"


# Verified public Unsplash photos (reused from seed_demo_family.py so links resolve)
IMG = {
    "coding":  "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800",
    "writing": "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=800",
    "science": "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=800",
    "reading": "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=800",
    "art":     "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800",
    "nature":  "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800",
    "math":    "https://images.unsplash.com/photo-1509228468518-180dd4864904?w=800",
}


# ── Helpers ──────────────────────────────────────────────────────────────────

def get_client() -> Client:
    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_ROLE_KEY:
        sys.exit("missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env")
    return create_client(Config.SUPABASE_URL, Config.SUPABASE_SERVICE_ROLE_KEY)


def delete_existing_demo(sb: Client) -> None:
    """Remove any prior OpenEd demo data so this script is idempotent.

    Scoped strictly to the OpenEd demo: the parent (email @opened-demo.example)
    and their dependents (managed_by_parent_id). Never touches other demos.
    """
    parents = sb.table("users").select("id").like("email", f"%{DEMO_EMAIL_DOMAIN}").execute()
    parent_ids = [r["id"] for r in (parents.data or [])]

    dep_ids: list[str] = []
    if parent_ids:
        deps = sb.table("users").select("id").in_("managed_by_parent_id", parent_ids).execute()
        dep_ids = [r["id"] for r in (deps.data or [])]

    ids = parent_ids + dep_ids
    if not ids:
        print("  no prior OpenEd demo users")
        return

    print(f"  found {len(ids)} prior OpenEd demo user(s); cleaning up…")

    # Quests created by the demo parent (private, marketplace-aligned).
    quest_ids: list[str] = []
    if parent_ids:
        qs = sb.table("quests").select("id").in_("created_by", parent_ids).execute()
        quest_ids = [r["id"] for r in (qs.data or [])]

    # Child rows first (respect FK chains).
    sb.table("quest_task_completions").delete().in_("user_id", ids).execute()

    events = sb.table("learning_events").select("id").in_("user_id", ids).execute()
    event_ids = [e["id"] for e in (events.data or [])]
    if event_ids:
        sb.table("learning_event_evidence_blocks").delete().in_("learning_event_id", event_ids).execute()
    sb.table("learning_events").delete().in_("user_id", ids).execute()

    sb.table("user_quest_tasks").delete().in_("user_id", ids).execute()
    sb.table("user_quests").delete().in_("user_id", ids).execute()
    sb.table("user_subject_xp").delete().in_("user_id", ids).execute()

    delete_extras(sb, ids)

    if quest_ids:
        # Remove any enrollments/tasks other rows may reference, then the quests.
        sb.table("user_quest_tasks").delete().in_("quest_id", quest_ids).execute()
        sb.table("user_quests").delete().in_("quest_id", quest_ids).execute()
        sb.table("quest_task_completions").delete().in_("quest_id", quest_ids).execute()
        sb.table("quests").delete().in_("id", quest_ids).execute()

    sb.table("users").delete().in_("id", ids).execute()

    for uid in ids:
        try:
            sb.auth.admin.delete_user(uid)
        except Exception as e:
            print(f"    warn: could not delete auth user {uid[:8]}: {e}")


def create_parent(sb: Client) -> str:
    res = sb.auth.admin.create_user({
        "email": PARENT_EMAIL,
        "password": DEMO_PASSWORD,
        "email_confirm": True,
        "user_metadata": {
            "first_name": "Jenna",
            "last_name": "Rivera",
            "display_name": "Jenna Rivera",
        },
    })
    uid = res.user.id  # type: ignore[union-attr]
    sb.table("users").upsert({
        "id": uid,
        "email": PARENT_EMAIL,
        "first_name": "Jenna",
        "last_name": "Rivera",
        "display_name": "Jenna Rivera",
        "role": "parent",
        "bio": "OpenEd homeschool mom of three. Building our year from the marketplace.",
        "date_of_birth": "1986-07-19",
        "avatar_url": avatar("JennaRivera"),
        "tos_accepted_at": "2026-06-01T00:00:00Z",
        "privacy_policy_accepted_at": "2026-06-01T00:00:00Z",
        "marketing_emails_enabled": False,
    }).execute()
    print(f"  ✔ Jenna Rivera (parent) → {uid}")
    return uid


def create_dependent(sb: Client, parent_id: str, first: str, last: str,
                     dob: str, bio: str, avatar_seed: str,
                     avatar_extra: str = "") -> str:
    """Create a COPPA-style dependent (auth user + public.users row).

    Mirrors DependentRepository.create_dependent: a placeholder auth email that
    can't be used to log in, and public.users.email = NULL. The parent manages
    the child from the Family tab.
    """
    suffix = uuid.uuid4().hex[:8]
    placeholder = f"dependent_{suffix}{DEMO_EMAIL_DOMAIN}"
    res = sb.auth.admin.create_user({
        "email": placeholder,
        "password": uuid.uuid4().hex + "Aa1!",
        "email_confirm": False,
        "user_metadata": {
            "first_name": first,
            "last_name": last,
            "display_name": f"{first} {last[0]}.",
            "is_dependent": True,
            "managed_by_parent_id": parent_id,
        },
    })
    uid = res.user.id  # type: ignore[union-attr]
    sb.table("users").upsert({
        "id": uid,
        "email": None,  # COPPA: no visible email for dependents
        "first_name": first,
        "last_name": last,
        "display_name": f"{first} {last[0]}.",
        "role": "student",
        "is_dependent": True,
        "managed_by_parent_id": parent_id,
        "bio": bio,
        "date_of_birth": dob,
        # Explicit seed: dicebear personas seeds are random-looking; these were
        # hand-picked to actually look like kids of the right age/gender.
        "avatar_url": avatar(avatar_seed, avatar_extra),
        "total_xp": 0,
        "level": 1,
        "tos_accepted_at": "2026-06-01T00:00:00Z",
        "privacy_policy_accepted_at": "2026-06-01T00:00:00Z",
        "marketing_emails_enabled": False,
    }).execute()
    print(f"  ✔ {first} {last} (dependent) → {uid}")
    return uid


def create_quest(sb: Client, parent_id: str, title: str, resource: str,
                 resource_url: str, description: str, big_idea: str,
                 image_key: str, recommended_age: str) -> str:
    """A private, marketplace-aligned quest 'auto-created' from a resource pick."""
    qid = str(uuid.uuid4())
    sb.table("quests").insert({
        "id": qid,
        "title": title,
        "description": description,
        "big_idea": big_idea,
        "quest_type": "optio",
        "is_active": True,
        "is_public": False,
        "created_by": parent_id,
        "material_link": resource_url,
        "image_url": IMG[image_key],
        "header_image_url": IMG[image_key],
        "recommended_age": recommended_age,
        "allow_custom_tasks": True,
        "metadata": {
            "opened_marketplace": True,
            "resource_name": resource,
            "resource_url": resource_url,
            "source": "OpenEd marketplace",
        },
    }).execute()
    return qid


def start_quest(sb: Client, user_id: str, quest_id: str, days_ago: int,
                completed: bool = False) -> str:
    started = datetime.now(timezone.utc) - timedelta(days=days_ago)
    payload = {
        "user_id": user_id,
        "quest_id": quest_id,
        "started_at": started.isoformat(),
        "is_active": not completed,
        "status": "set_down" if completed else "picked_up",
        "last_picked_up_at": started.isoformat(),
    }
    if completed:
        payload["completed_at"] = (started + timedelta(days=max(1, days_ago // 2))).isoformat()
    r = sb.table("user_quests").insert(payload).execute()
    return r.data[0]["id"]


def add_task(sb: Client, user_id: str, quest_id: str, user_quest_id: str,
             title: str, pillar: str, xp: int, days_ago: int,
             completed: bool = False, order_index: int = 0,
             evidence: Optional[str] = None) -> None:
    task_id = str(uuid.uuid4())
    sb.table("user_quest_tasks").insert({
        "id": task_id,
        "user_id": user_id,
        "quest_id": quest_id,
        "user_quest_id": user_quest_id,
        "title": title,
        "description": f"{title}.",
        "pillar": pillar,
        "xp_value": xp,
        "order_index": order_index,
        "approval_status": "approved",
    }).execute()

    if not completed:
        return

    completed_at = datetime.now(timezone.utc) - timedelta(days=days_ago)
    sb.table("quest_task_completions").insert({
        "user_id": user_id,
        "quest_id": quest_id,
        "task_id": task_id,
        "user_quest_task_id": task_id,
        "evidence_text": evidence or f"Finished: {title.lower()}.",
        "completed_at": completed_at.isoformat(),
        "diploma_status": "finalized",
        "finalized_at": completed_at.isoformat(),
    }).execute()


def add_log(sb: Client, user_id: str, title: str, pillars: list[str],
            description: str, days_ago: int, image_key: Optional[str] = None) -> None:
    """A journal 'learning log' entry — the raw material for the weekly OpenEd log."""
    event_date = datetime.now(timezone.utc) - timedelta(days=days_ago)
    r = sb.table("learning_events").insert({
        "user_id": user_id,
        "title": title,
        "description": description,
        "pillars": pillars,
        "source_type": "realtime",
        "event_date": event_date.date().isoformat(),
        "created_at": event_date.isoformat(),
    }).execute()
    event_id = r.data[0]["id"]
    if image_key:
        sb.table("learning_event_evidence_blocks").insert({
            "learning_event_id": event_id,
            "block_type": "image",
            "content": {"items": [{"url": IMG[image_key], "caption": title}]},
            "order_index": 0,
        }).execute()
    else:
        sb.table("learning_event_evidence_blocks").insert({
            "learning_event_id": event_id,
            "block_type": "text",
            "content": {"text": description},
            "order_index": 0,
        }).execute()


def seed_subject_xp(sb: Client, user_id: str, xp_per_subject: dict) -> None:
    total = 0
    for subject, xp in xp_per_subject.items():
        sb.table("user_subject_xp").insert({
            "user_id": user_id,
            "school_subject": subject,
            "xp_amount": xp,
        }).execute()
        total += xp
    sb.table("users").update({"total_xp": total}).eq("id", user_id).execute()
    print(f"    + {total} XP across {len(xp_per_subject)} subjects")


# ── Bounties + message history ("extras") ─────────────────────────────────────

def delete_extras(sb: Client, ids: list[str]) -> None:
    """Remove bounties + DM history tied to the demo users (idempotent extras)."""
    if not ids:
        return
    sb.table("bounty_claims").delete().in_("student_id", ids).execute()
    sb.table("bounties").delete().in_("poster_id", ids).execute()
    sb.table("direct_messages").delete().in_("sender_id", ids).execute()
    sb.table("direct_messages").delete().in_("recipient_id", ids).execute()
    sb.table("message_conversations").delete().in_("participant_1_id", ids).execute()
    sb.table("message_conversations").delete().in_("participant_2_id", ids).execute()


def seed_bounties(sb: Client, parent_id: str, kids: dict[str, str]) -> None:
    """Jenna posts family bounties for the kids.

    rewards jsonb shape matches bounties/create.tsx:
      XP     → {type:'xp', value, pillar, text:''}
      custom → {id, type:'custom', value:0, pillar:'', text}
    Keep custom-reward text SHORT — long text overflows the browse-card header
    (known UI bug).
    """
    now = datetime.now(timezone.utc)
    bounties = [
        {
            "title": "Teach us your chemistry unit",
            "description": "You just finished atomic structure on Khan Academy. Teach the family how atoms work at dinner — whiteboard welcome.",
            "requirements": "A 10-minute dinner-table lesson plus one question for each of us.",
            "pillar": "communication",
            "xp_reward": 100,
            "deliverables": [
                {"id": str(uuid.uuid4()), "text": "Prepare a 10-minute mini lesson"},
                {"id": str(uuid.uuid4()), "text": "Quiz the family with 3 questions"},
            ],
            "rewards": [
                {"type": "xp", "value": 100, "pillar": "communication", "text": ""},
                {"id": str(uuid.uuid4()), "type": "custom", "value": 0, "pillar": "", "text": "Pick Friday's movie"},
            ],
            "kids": [kids["liam"]],
            "days": 14,
        },
        {
            "title": "Demo your hydraulic claw at co-op",
            "description": "Bring the KiwiCo claw to Friday co-op and show the group how the syringes move it.",
            "requirements": "Do the demo and explain how water pressure does the lifting.",
            "pillar": "stem",
            "xp_reward": 75,
            "deliverables": [
                {"id": str(uuid.uuid4()), "text": "Demo the claw for the co-op group"},
                {"id": str(uuid.uuid4()), "text": "Explain how the hydraulics work"},
            ],
            "rewards": [
                {"type": "xp", "value": 75, "pillar": "stem", "text": ""},
                {"id": str(uuid.uuid4()), "type": "custom", "value": 0, "pillar": "", "text": "Ice cream run"},
            ],
            "kids": [kids["sofia"]],
            "days": 10,
        },
        {
            "title": "Read a story to Grandma",
            "description": "Video-call Grandma and read her one of your phonics stories, start to finish.",
            "requirements": "Read the whole story out loud on the call.",
            "pillar": "communication",
            "xp_reward": 50,
            "deliverables": [
                {"id": str(uuid.uuid4()), "text": "Read one full story on the call"},
            ],
            "rewards": [
                {"type": "xp", "value": 50, "pillar": "communication", "text": ""},
            ],
            "kids": [kids["noah"]],
            "days": 7,
        },
        {
            "title": "Science museum scavenger hunt",
            "description": "Saturday museum trip: each of you finds one exhibit that connects to something you're learning and journals it.",
            "requirements": "One journal entry each with a photo of your exhibit.",
            "pillar": "stem",
            "xp_reward": 100,
            "deliverables": [
                {"id": str(uuid.uuid4()), "text": "Find an exhibit tied to your learning"},
                {"id": str(uuid.uuid4()), "text": "Add a journal entry with a photo"},
            ],
            "rewards": [
                {"type": "xp", "value": 100, "pillar": "stem", "text": ""},
                {"id": str(uuid.uuid4()), "type": "custom", "value": 0, "pillar": "", "text": "Gift-shop pick"},
            ],
            "kids": [kids["liam"], kids["sofia"], kids["noah"]],
            "days": 21,
        },
    ]
    for b in bounties:
        sb.table("bounties").insert({
            "title": b["title"],
            "description": b["description"],
            "requirements": b["requirements"],
            "pillar": b["pillar"],
            "bounty_type": "family",
            "xp_reward": b["xp_reward"],
            "deliverables": b["deliverables"],
            "rewards": b["rewards"],
            "poster_id": parent_id,
            "status": "active",
            "moderation_status": "manually_approved",
            "max_participants": 1,
            "visibility": "family",
            "allowed_student_ids": b["kids"],
            "deadline": (now + timedelta(days=b["days"])).isoformat(),
        }).execute()
    print(f"    + {len(bounties)} family bounties from Jenna")


def seed_submissions(sb: Client, parent_id: str, kids: dict[str, str]) -> None:
    """Two kids turn in their bounties so the parent has submissions to review.

    Claim evidence shape matches bounty_service.toggle_deliverable /
    review/[id].tsx:
      evidence = {completed_deliverables: [ids],
                  deliverable_evidence: {id: [{type, content}]}}
      items: {type:'text', content:{text}} | {type:'image', content:{items:[{url}]}}
    """
    now = datetime.now(timezone.utc)
    subs = [
        {
            "title": "Teach us your chemistry unit",
            "kid": kids["liam"],
            "hours_ago": 20,
            "evidence_by_index": [
                [{"type": "text", "content": {"text": "Did my mini lesson at dinner Tuesday. Walked everyone through protons, neutrons, and electrons with the whiteboard, then showed how the periodic table is organized by atomic number."}}],
                [{"type": "text", "content": {"text": "Quizzed the family: 1) What's in a nucleus? 2) Why does sodium react so strongly? 3) What does the atomic number tell you? Mom got 3/3, Sofia got 2."}}],
            ],
        },
        {
            "title": "Demo your hydraulic claw at co-op",
            "kid": kids["sofia"],
            "hours_ago": 8,
            "evidence_by_index": [
                [{"type": "text", "content": {"text": "Did the demo Friday morning. I showed how squeezing one syringe makes the claw close, then let three kids try grabbing the marker with it."}}],
                [{"type": "text", "content": {"text": "I explained that pushing the syringe pushes water through the tube, and water can't squish, so the other end has to move. Everyone got a turn lifting the marker with it."}}],
            ],
        },
    ]
    for s in subs:
        bounty = sb.table("bounties").select("id, deliverables").eq(
            "poster_id", parent_id).eq("title", s["title"]).execute()
        if not bounty.data:
            print(f"    ! bounty not found, skipping: {s['title']}")
            continue
        b = bounty.data[0]
        deliv_ids = [d["id"] for d in (b.get("deliverables") or [])]
        submitted_at = (now - timedelta(hours=s["hours_ago"])).isoformat()
        sb.table("bounty_claims").insert({
            "bounty_id": b["id"],
            "student_id": s["kid"],
            "status": "submitted",
            "submitted_at": submitted_at,
            "created_at": (now - timedelta(hours=s["hours_ago"] + 48)).isoformat(),
            "evidence": {
                "completed_deliverables": deliv_ids,
                "deliverable_evidence": {
                    did: s["evidence_by_index"][i]
                    for i, did in enumerate(deliv_ids)
                    if i < len(s["evidence_by_index"])
                },
            },
        }).execute()
    print(f"    + {len(subs)} submitted bounty claims awaiting review")


def seed_conversations(sb: Client, parent_id: str, kids: dict[str, str]) -> None:
    """Parent ↔ kid DM history. Matches direct_message_service: participant_1
    is the smaller UUID; unread counts and preview mirror the last message."""
    now = datetime.now(timezone.utc)

    # (kid_key, [(sender, hours_ago, text)]) — oldest first
    threads = {
        "liam": [
            ("kid",    50, "Passed the quadratics mastery challenge! 8/9"),
            ("parent", 49, "That's awesome. Which one got you?"),
            ("kid",    49, "Vertex form. Retried it and got it right"),
            ("parent", 48, "Nice recovery. Log it in your journal so it lands in this week's OpenEd report"),
            ("kid",    26, "Done. Also my Outschool teacher liked the lighthouse story"),
            ("parent",  3, "Can't wait to read the revision. Dinner chemistry lesson still on for Friday?"),
        ],
        "sofia": [
            ("parent", 30, "How was Beast Academy today?"),
            ("kid",    29, "Finished chapter 1! The bar models are actually fun"),
            ("parent", 29, "Love it. Claw demo Friday at co-op — you ready?"),
            ("kid",    28, "Yes!! It lifted a whole water bottle yesterday"),
            ("parent",  5, "Grab a photo of the claw for your journal before co-op"),
        ],
        "noah": [
            ("parent", 24, "Did you help JiJi today?"),
            ("kid",    23, "5 puzzles!!"),
            ("parent", 23, "Wow! Story time with Grandma tomorrow — pick your favorite one"),
            ("kid",     4, "the cat sat one"),
        ],
    }

    for key, msgs in threads.items():
        kid_id = kids[key]
        p1, p2 = (parent_id, kid_id) if parent_id < kid_id else (kid_id, parent_id)
        convo_id = str(uuid.uuid4())

        last = msgs[-1]
        last_at = (now - timedelta(hours=last[1])).isoformat()
        last_sender = parent_id if last[0] == "parent" else kid_id
        # One unread for the receiver of the final message
        unread_p1 = 1 if last_sender != p1 else 0
        unread_p2 = 1 if last_sender != p2 else 0

        sb.table("message_conversations").insert({
            "id": convo_id,
            "participant_1_id": p1,
            "participant_2_id": p2,
            "last_message_at": last_at,
            "last_message_preview": last[2][:80],
            "unread_count_p1": unread_p1,
            "unread_count_p2": unread_p2,
        }).execute()

        rows = []
        for sender, hours_ago, text in msgs:
            sender_id = parent_id if sender == "parent" else kid_id
            recipient_id = kid_id if sender == "parent" else parent_id
            sent_at = (now - timedelta(hours=hours_ago)).isoformat()
            rows.append({
                "conversation_id": convo_id,
                "sender_id": sender_id,
                "recipient_id": recipient_id,
                "message_content": text,
                "created_at": sent_at,
                # everything read except the final message
                "read_at": None if (sender, hours_ago, text) == last else sent_at,
            })
        sb.table("direct_messages").insert(rows).execute()
        print(f"    + {len(msgs)} messages with {key.capitalize()}")


def get_existing_family(sb: Client) -> tuple[str, dict[str, str]]:
    """Look up the already-seeded Rivera family. Returns (parent_id, kids)."""
    parent = sb.table("users").select("id").eq("email", PARENT_EMAIL).execute()
    if not parent.data:
        sys.exit(f"No existing demo parent ({PARENT_EMAIL}); run without --extras-only first.")
    parent_id = parent.data[0]["id"]
    deps = sb.table("users").select("id, first_name").eq("managed_by_parent_id", parent_id).execute()
    kids = {r["first_name"].lower(): r["id"] for r in (deps.data or [])}
    missing = {"liam", "sofia", "noah"} - set(kids)
    if missing:
        sys.exit(f"Missing dependents {missing}; run a full reseed instead.")
    return parent_id, kids


def seed_extras_only(sb: Client) -> None:
    print("=" * 64)
    print("Re-seeding extras (bounties + messages) on existing demo users")
    print("=" * 64)
    parent_id, kids = get_existing_family(sb)
    ids = [parent_id, *kids.values()]
    print("\n[1/2] Removing prior bounties + messages…")
    delete_extras(sb, ids)
    print("\n[2/2] Seeding bounties + conversations…")
    seed_bounties(sb, parent_id, kids)
    seed_submissions(sb, parent_id, kids)
    seed_conversations(sb, parent_id, kids)
    print("\nDone.")


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    sb = get_client()

    print("=" * 64)
    print("Seeding OpenEd marketplace demo family (Rivera)")
    print("=" * 64)

    print("\n[1/5] Removing any prior OpenEd demo data…")
    delete_existing_demo(sb)

    print("\n[2/5] Creating parent + dependents…")
    parent = create_parent(sb)
    liam = create_dependent(sb, parent, "Liam", "Rivera", "2010-02-10",
                            "16. Into chemistry, algebra, and writing sci-fi.", "Liam16")
    sofia = create_dependent(sb, parent, "Sofia", "Rivera", "2016-04-18",
                             "10. Loves puzzles, building things, and Spanish.", "Sofie",
                             avatar_extra="&hair=pigtails")
    noah = create_dependent(sb, parent, "Noah", "Rivera", "2019-05-22",
                            "7. Learning to read and loves math puzzles.", "Oliver")

    # ── Liam (16) ─────────────────────────────────────────────────────────────
    print("\n[3/5] Seeding Liam (16)…")
    # Khan Academy — Algebra 2 (in progress)
    q = create_quest(sb, parent, "Khan Academy — Algebra 2", "Khan Academy",
                     "https://www.khanacademy.org/math/algebra2",
                     "Work through Algebra 2 on Khan Academy — polynomials, quadratics, and functions.",
                     "Master Algebra 2 with self-paced Khan Academy units.", "coding", "14-18")
    uq = start_quest(sb, liam, q, days_ago=18)
    add_task(sb, liam, q, uq, "Watch the Polynomial arithmetic unit and take notes", "stem", 50, 12, True, 0,
             "Notes on adding, subtracting, and multiplying polynomials.")
    add_task(sb, liam, q, uq, "Complete the Quadratic functions mastery challenge", "stem", 75, 6, True, 1,
             "Scored 8/9 on the mastery challenge — retried the vertex-form question.")
    add_task(sb, liam, q, uq, "Explain how to complete the square in your own words", "communication", 50, 0, False, 2)
    add_task(sb, liam, q, uq, "Score 90%+ on the Unit 3 test", "stem", 100, 0, False, 3)

    # Outschool — Creative Writing (in progress)
    q = create_quest(sb, parent, "Outschool — Intro to Creative Writing", "Outschool",
                     "https://outschool.com",
                     "A live, multi-week Outschool workshop on writing short fiction.",
                     "Build a short story from idea to revision with a live class.", "writing", "13-17")
    uq = start_quest(sb, liam, q, days_ago=14)
    add_task(sb, liam, q, uq, "Attend the first live session", "communication", 40, 11, True, 0,
             "First class was on building a character. Met the teacher and 6 other students.")
    add_task(sb, liam, q, uq, "Draft a 500-word short story", "communication", 60, 4, True, 1,
             "Drafted a story about a lighthouse keeper who collects storms.")
    add_task(sb, liam, q, uq, "Revise using peer feedback", "communication", 50, 0, False, 2)

    # Khan Academy — Chemistry (completed)
    q = create_quest(sb, parent, "Khan Academy — Intro to Chemistry", "Khan Academy",
                     "https://www.khanacademy.org/science/chemistry",
                     "Atoms, elements, and the periodic table on Khan Academy.",
                     "Understand the building blocks of matter.", "science", "14-18")
    uq = start_quest(sb, liam, q, days_ago=40, completed=True)
    add_task(sb, liam, q, uq, "Complete the Atomic structure unit", "stem", 75, 34, True, 0,
             "Finished the unit and the electron-configuration exercises.")
    add_task(sb, liam, q, uq, "Balance 10 chemical equations", "stem", 75, 30, True, 1,
             "Balanced all 10 — combustion ones were the trickiest.")

    add_log(sb, liam, "Algebra 2 — completed the polynomials unit on Khan Academy",
            ["stem"], "Watched the full polynomial arithmetic unit and took notes. Ready for quadratics next.", 12, "coding")
    add_log(sb, liam, "Outschool creative writing — first live session",
            ["communication"], "Joined the live class on character building. Enjoyed hearing other students' ideas.", 11)
    add_log(sb, liam, "Drafted a short story",
            ["communication"], "Wrote a 500-word draft about a lighthouse keeper. Want to tighten the ending.", 4, "writing")
    add_log(sb, liam, "Chemistry — balanced equations",
            ["stem"], "Practiced balancing chemical equations. Combustion reactions finally clicked.", 30, "science")
    seed_subject_xp(sb, liam, {"math": 125, "science": 150, "language_arts": 100})

    # ── Sofia (10) ────────────────────────────────────────────────────────────
    print("\n[4/5] Seeding Sofia (10)…")
    # Beast Academy — Math (in progress)
    q = create_quest(sb, parent, "Beast Academy — Fractions & Measurement", "Beast Academy",
                     "https://beastacademy.com",
                     "Comic-based, problem-solving math from Beast Academy.",
                     "Think like a mathematician through playful, hard problems.", "math", "8-12")
    uq = start_quest(sb, sofia, q, days_ago=16)
    add_task(sb, sofia, q, uq, "Finish the Chapter 1 practice book", "stem", 40, 10, True, 0,
             "Finished chapter 1. The bar-model problems were fun.")
    add_task(sb, sofia, q, uq, "Solve 10 Beast challenge problems", "stem", 50, 3, True, 1,
             "Got 9 of 10 — the last one needed a hint from mom.")
    add_task(sb, sofia, q, uq, "Teach a fraction trick to your brother", "communication", 30, 0, False, 2)

    # KiwiCo — Tinker Crate (in progress)
    q = create_quest(sb, parent, "KiwiCo Tinker Crate — Hydraulic Claw", "KiwiCo",
                     "https://www.kiwico.com",
                     "Build a working hydraulic claw from the KiwiCo Tinker Crate.",
                     "Learn how hydraulics work by building your own claw.", "art", "9-12")
    uq = start_quest(sb, sofia, q, days_ago=9)
    add_task(sb, sofia, q, uq, "Assemble the claw from the crate", "stem", 40, 6, True, 0,
             "Built the whole claw. The syringes were tricky to connect.")
    add_task(sb, sofia, q, uq, "Test how much weight it can lift", "stem", 30, 2, True, 1,
             "It lifted a full water bottle! Water pressure is strong.")
    add_task(sb, sofia, q, uq, "Draw a diagram of how the hydraulics work", "art", 30, 0, False, 2)

    # Outschool — Beginner Spanish (completed)
    q = create_quest(sb, parent, "Outschool — Beginner Spanish", "Outschool",
                     "https://outschool.com",
                     "A beginner Spanish class on Outschool — greetings, colors, numbers.",
                     "Start speaking everyday Spanish.", "reading", "8-11")
    uq = start_quest(sb, sofia, q, days_ago=45, completed=True)
    add_task(sb, sofia, q, uq, "Learn greetings and introduce yourself", "communication", 40, 40, True, 0,
             "Can say hello, my name is, and how are you in Spanish.")
    add_task(sb, sofia, q, uq, "Count to 20 and name the colors", "communication", 40, 36, True, 1,
             "Counted to 20 and named all the colors on the flashcards.")

    add_log(sb, sofia, "Beast Academy — finished Chapter 1",
            ["stem"], "Worked through the chapter 1 practice book. Loved the comic characters.", 10, "math")
    add_log(sb, sofia, "Built a hydraulic claw from KiwiCo",
            ["stem", "art"], "Put together the whole claw from the Tinker Crate. Learned water can push things.", 6, "art")
    add_log(sb, sofia, "Tested the claw — it lifted a water bottle",
            ["stem"], "The claw lifted a full water bottle using just water pressure. So cool.", 2)
    add_log(sb, sofia, "Spanish — learned colors and numbers",
            ["communication"], "Practiced counting to 20 and the colors in my Outschool Spanish class.", 36, "reading")
    seed_subject_xp(sb, sofia, {"math": 90, "science": 70, "language_arts": 80})

    # ── Noah (7) ──────────────────────────────────────────────────────────────
    print("\n[5/5] Seeding Noah (7)…")
    # ST Math (in progress)
    q = create_quest(sb, parent, "ST Math — Visual Math Puzzles", "ST Math",
                     "https://www.stmath.com",
                     "Play-based visual math puzzles with JiJi from ST Math.",
                     "Build number sense through visual puzzles.", "math", "5-8")
    uq = start_quest(sb, noah, q, days_ago=12)
    add_task(sb, noah, q, uq, "Complete 5 JiJi puzzle levels", "stem", 25, 8, True, 0,
             "Helped JiJi cross the screen 5 times!")
    add_task(sb, noah, q, uq, "Beat the number-line challenge", "stem", 25, 3, True, 1,
             "Finished the number-line puzzles.")
    add_task(sb, noah, q, uq, "Try the shapes puzzle set", "stem", 25, 0, False, 2)

    # Easy Peasy — Learn to Read (in progress)
    q = create_quest(sb, parent, "Easy Peasy All-in-One — Learn to Read", "Easy Peasy All-in-One",
                     "https://allinonehomeschool.com",
                     "Free, day-by-day reading lessons from Easy Peasy All-in-One.",
                     "Learn to read one phonics story at a time.", "reading", "5-7")
    uq = start_quest(sb, noah, q, days_ago=10)
    add_task(sb, noah, q, uq, "Read a Level 1 phonics story out loud", "communication", 25, 7, True, 0,
             "Read 'The Cat Sat' out loud to mom, all by myself.")
    add_task(sb, noah, q, uq, "Practice this week's sight words", "communication", 25, 2, True, 1,
             "Learned: the, and, is, you, was.")
    add_task(sb, noah, q, uq, "Draw a picture of your favorite story", "art", 25, 0, False, 2)

    # KiwiCo — Koala Crate (completed)
    q = create_quest(sb, parent, "KiwiCo Koala Crate — Ocean Animals", "KiwiCo",
                     "https://www.kiwico.com/koala-crate",
                     "Hands-on ocean-animals crate for early learners from KiwiCo.",
                     "Explore ocean animals with hands-on projects.", "nature", "3-8")
    uq = start_quest(sb, noah, q, days_ago=30, completed=True)
    add_task(sb, noah, q, uq, "Build the felt jellyfish", "stem", 25, 26, True, 0,
             "Made a squishy felt jellyfish with dangly legs.")
    add_task(sb, noah, q, uq, "Paint the ocean scene", "art", 25, 24, True, 1,
             "Painted a blue ocean with fish and a whale.")

    add_log(sb, noah, "ST Math — helped JiJi with 5 puzzles",
            ["stem"], "Solved 5 visual math puzzles to help JiJi cross the screen.", 8, "math")
    add_log(sb, noah, "Read my first phonics story out loud",
            ["communication"], "Read 'The Cat Sat' all by myself. Mom clapped.", 7, "reading")
    add_log(sb, noah, "Learned five new sight words",
            ["communication"], "Practiced the, and, is, you, was until I knew them by heart.", 2)
    add_log(sb, noah, "KiwiCo — built a felt jellyfish",
            ["stem", "art"], "Built a jellyfish and painted an ocean scene from my Koala Crate.", 24, "nature")
    seed_subject_xp(sb, noah, {"math": 50, "language_arts": 50, "science": 25, "fine_arts": 25})

    print("\n[extras] Bounties + conversations…")
    kids = {"liam": liam, "sofia": sofia, "noah": noah}
    seed_bounties(sb, parent, kids)
    seed_submissions(sb, parent, kids)
    seed_conversations(sb, parent, kids)

    print("\n" + "=" * 64)
    print("Seeded OpenEd demo successfully.")
    print("=" * 64)
    print("\nDemo login (parent — manages all 3 kids from the Family tab):")
    print(f"  Email:    {PARENT_EMAIL}")
    print(f"  Password: {DEMO_PASSWORD}")
    print("\nKids: Liam (16), Sofia (10), Noah (7) — dependents, view via Family tab / Act as.")


if __name__ == "__main__":
    if "--extras-only" in sys.argv:
        seed_extras_only(get_client())
    else:
        main()
