#!/usr/bin/env python3
"""
Seed the demo Mitchell family + Grandma Linda for App Store / Play Store
screenshots and App Review credentials.

Creates real accounts in prod Supabase (so App Review reviewers can log in)
with realistic, populated data: quests in progress + completed, learning
moments spread over 60 days (engagement-calendar fill), bounties from
Grandma, observer/parent relationships, and subject XP totals.

Idempotent: re-running deletes the prior demo accounts (by email pattern
@optio-demo.example) and reseeds. Safe to run repeatedly.

Demo accounts created:
  - sarah.mitchell@optio-demo.example  (parent, observes all 3 kids)
  - maya.mitchell@optio-demo.example   (12yo student, headline demo)
  - jacob.mitchell@optio-demo.example  (14yo student)
  - emma.mitchell@optio-demo.example   (16yo student)
  - linda.mitchell@optio-demo.example  (grandparent, observes Jacob+Emma,
                                        posts bounties)

All share the password OptioDemo2026! (provided to Apple App Review).

Usage:
  cd backend && .venv/bin/python scripts/seed_demo_family.py
"""

from __future__ import annotations

import os
import sys
import random
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

# Add backend to import path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from supabase import create_client, Client
from app_config import Config


# ── Config ────────────────────────────────────────────────────────────────────

DEMO_EMAIL_DOMAIN = "@optio-demo.example"
DEMO_PASSWORD = "OptioDemo2026!"

# Real production quest IDs (picked from `quests` where is_public=true)
QUEST_IDS = {
    # Maya (12, art/science vibe)
    "zoo": "395063bd-134d-4ba1-8b2a-1ebf1c46f5eb",  # Explore a Local Zoo
    "wellness": "dd000000-0000-4000-b000-000000000002",  # My Wellness Toolkit
    "book": "8b8b4a45-28e2-4c53-b97f-fb68b6f57312",  # Better Than the Movies
    # Jacob (14, STEM/coding)
    "code": "dd000000-0000-4000-b000-000000000003",  # Code My Community
    "physics": "6133592e-5899-4871-bed2-0f3e73a56258",  # Physics - Khan Academy
    "stats": "a424d52d-5c76-48a2-b964-e43f9dda8503",  # High School Statistics
    # Emma (16, civics/comm)
    "legal": "20329121-d987-4266-9899-b8be6f6e443a",  # Observe Legal Reasoning
    "founding": "09f20f34-f0cb-41ec-986c-048913d9d975",  # Founding Documents
    "writing": "b0000001-0000-4000-8000-000000000001",  # Analyze Written Works
}

# Dicebear avatar URLs (free, no auth; "personas" style is friendly cartoons)
def avatar(seed: str) -> str:
    return f"https://api.dicebear.com/9.x/personas/png?seed={seed}&size=256"

# Curated public Unsplash photos for learning-moment evidence
# (using ?w=800 to keep file sizes reasonable)
EVIDENCE_IMAGES = {
    "art": "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800",
    "science": "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=800",
    "coding": "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800",
    "nature": "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800",
    "reading": "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=800",
    "writing": "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=800",
    "civics": "https://images.unsplash.com/photo-1554484537-8d3c4a3f5c54?w=800",
    "sports": "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800",
    "music": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800",
    "cooking": "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800",
}


# ── Demo data ────────────────────────────────────────────────────────────────

DEMO_USERS = [
    {
        "key": "sarah",
        "email": f"sarah.mitchell{DEMO_EMAIL_DOMAIN}",
        "first_name": "Sarah",
        "last_name": "Mitchell",
        "display_name": "Sarah Mitchell",
        "role": "parent",
        "date_of_birth": "1985-03-12",
        "bio": "Mom of three. Believer in learning by doing.",
    },
    {
        "key": "maya",
        "email": f"maya.mitchell{DEMO_EMAIL_DOMAIN}",
        "first_name": "Maya",
        "last_name": "Mitchell",
        "display_name": "Maya M.",
        "role": "student",
        "date_of_birth": "2013-09-04",  # 12yo as of 2026
        "bio": "Curious about everything. Loves drawing and tide pools.",
    },
    {
        "key": "jacob",
        "email": f"jacob.mitchell{DEMO_EMAIL_DOMAIN}",
        "first_name": "Jacob",
        "last_name": "Mitchell",
        "display_name": "Jacob M.",
        "role": "student",
        "date_of_birth": "2011-06-22",  # 14yo
        "bio": "Building games and small robots. Solving things one bug at a time.",
    },
    {
        "key": "emma",
        "email": f"emma.mitchell{DEMO_EMAIL_DOMAIN}",
        "first_name": "Emma",
        "last_name": "Mitchell",
        "display_name": "Emma M.",
        "role": "student",
        "date_of_birth": "2009-11-15",  # 16yo
        "bio": "Reading, writing, and arguing about ideas worth arguing about.",
    },
    {
        "key": "linda",
        "email": f"linda.mitchell{DEMO_EMAIL_DOMAIN}",
        "first_name": "Linda",
        "last_name": "Mitchell",
        "display_name": "Grandma Linda",
        "role": "observer",
        "date_of_birth": "1957-04-30",
        "bio": "Proud grandma. Posts the occasional bounty to nudge the kids.",
    },
]


# ── Helpers ──────────────────────────────────────────────────────────────────

def get_client() -> Client:
    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_ROLE_KEY:
        sys.exit("missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env")
    return create_client(Config.SUPABASE_URL, Config.SUPABASE_SERVICE_ROLE_KEY)


def delete_existing_demo(sb: Client) -> None:
    """Remove any prior demo data so this script is idempotent."""
    # 1) find existing demo user ids
    existing = sb.table("users").select("id, email").like("email", f"%{DEMO_EMAIL_DOMAIN}").execute()
    ids = [r["id"] for r in (existing.data or [])]
    if not ids:
        print("  no prior demo users")
        return

    print(f"  found {len(ids)} prior demo user(s); cleaning up…")

    # Delete dependent rows first. We delete in the order that respects FK chains.
    # quest_task_completions
    sb.table("quest_task_completions").delete().in_("user_id", ids).execute()
    # learning_event_evidence_blocks via learning_events
    events = sb.table("learning_events").select("id").in_("user_id", ids).execute()
    event_ids = [e["id"] for e in (events.data or [])]
    if event_ids:
        sb.table("learning_event_evidence_blocks").delete().in_("learning_event_id", event_ids).execute()
    sb.table("learning_events").delete().in_("user_id", ids).execute()
    # user_quest_tasks
    sb.table("user_quest_tasks").delete().in_("user_id", ids).execute()
    # user_quests
    sb.table("user_quests").delete().in_("user_id", ids).execute()
    # user_subject_xp
    sb.table("user_subject_xp").delete().in_("user_id", ids).execute()
    # bounties (posted by demo grandma)
    sb.table("bounties").delete().in_("poster_id", ids).execute()
    # advisor_student_assignments
    sb.table("advisor_student_assignments").delete().in_("advisor_id", ids).execute()
    sb.table("advisor_student_assignments").delete().in_("student_id", ids).execute()
    # parent_student_links (sarah → kids)
    sb.table("parent_student_links").delete().in_("parent_user_id", ids).execute()
    sb.table("parent_student_links").delete().in_("student_user_id", ids).execute()
    # observer_student_links (linda → kids)
    sb.table("observer_student_links").delete().in_("observer_id", ids).execute()
    sb.table("observer_student_links").delete().in_("student_id", ids).execute()
    # public.users gets removed via auth.admin.delete_user cascade in next step
    # but we also remove manually as a safety net.
    sb.table("users").delete().in_("id", ids).execute()

    # 2) delete auth users (cascades remaining rows that reference auth.users)
    for uid in ids:
        try:
            sb.auth.admin.delete_user(uid)
        except Exception as e:
            print(f"    warn: could not delete auth user {uid[:8]}: {e}")


def create_user(sb: Client, spec: dict) -> str:
    """Create an auth.user + public.users row. Returns the user id."""
    res = sb.auth.admin.create_user({
        "email": spec["email"],
        "password": DEMO_PASSWORD,
        "email_confirm": True,
        "user_metadata": {
            "first_name": spec["first_name"],
            "last_name": spec["last_name"],
            "display_name": spec["display_name"],
        },
    })
    user_id = res.user.id  # type: ignore[union-attr]

    # The user_sync trigger usually creates public.users from auth.users,
    # but we update with our richer data. Use upsert in case the trigger
    # raced and inserted a minimal row.
    sb.table("users").upsert({
        "id": user_id,
        "email": spec["email"],
        "first_name": spec["first_name"],
        "last_name": spec["last_name"],
        "display_name": spec["display_name"],
        "role": spec["role"],
        "bio": spec["bio"],
        "date_of_birth": spec["date_of_birth"],
        "avatar_url": avatar(spec["first_name"]),
        "tos_accepted_at": "2026-05-01T00:00:00Z",
        "privacy_policy_accepted_at": "2026-05-01T00:00:00Z",
        "marketing_emails_enabled": False,
    }).execute()
    print(f"  ✔ {spec['first_name']} {spec['last_name']} ({spec['role']}) → {user_id}")
    return user_id


def link_observer(sb: Client, advisor_id: str, student_id: str) -> None:
    sb.table("advisor_student_assignments").insert({
        "advisor_id": advisor_id,
        "student_id": student_id,
        "is_active": True,
    }).execute()


def link_parent_student(sb: Client, parent_id: str, student_id: str) -> None:
    """Wire a parent → independent-student link so the Family tab sees the kid."""
    sb.table("parent_student_links").insert({
        "parent_user_id": parent_id,
        "student_user_id": student_id,
        "status": "approved",
        "admin_verified": True,
    }).execute()


def link_observer_student(sb: Client, observer_id: str, student_id: str, invited_by_parent_id: str | None = None) -> None:
    """Wire an observer (role='observer') → student link so the observer feed populates.

    Note: advisor_student_assignments is for advisors/superadmins; observers
    must be in observer_student_links instead (the feed endpoint pulls each
    role from its own table).
    """
    payload = {
        "observer_id": observer_id,
        "student_id": student_id,
    }
    if invited_by_parent_id:
        payload["invited_by_parent_id"] = invited_by_parent_id
    sb.table("observer_student_links").insert(payload).execute()


# ── Quest / task / completion seeding ─────────────────────────────────────────

def start_quest(sb: Client, user_id: str, quest_id: str, days_ago: int, completed: bool = False) -> str:
    """Insert into user_quests; returns the user_quest id."""
    started = datetime.now(timezone.utc) - timedelta(days=days_ago)
    # status values per DB CHECK: 'available' | 'picked_up' | 'set_down'.
    # A finished quest is represented as is_active=false + completed_at set
    # + status='set_down'. There is no 'completed' status value.
    payload = {
        "user_id": user_id,
        "quest_id": quest_id,
        "started_at": started.isoformat(),
        "is_active": not completed,
        "status": "set_down" if completed else "picked_up",
        "last_picked_up_at": started.isoformat(),
    }
    if completed:
        payload["completed_at"] = (started + timedelta(days=days_ago // 2)).isoformat()
    r = sb.table("user_quests").insert(payload).execute()
    return r.data[0]["id"]


def add_task(sb: Client, user_id: str, quest_id: str, user_quest_id: str,
             title: str, pillar: str, xp: int, days_ago: int,
             completed: bool = False, order_index: int = 0) -> Optional[str]:
    """Insert a user_quest_task; if completed, also insert quest_task_completion. Returns completion id or None."""
    task_id = str(uuid.uuid4())
    sb.table("user_quest_tasks").insert({
        "id": task_id,
        "user_id": user_id,
        "quest_id": quest_id,
        "user_quest_id": user_quest_id,
        "title": title,
        "description": f"{title}. Demo task.",
        "pillar": pillar,
        "xp_value": xp,
        "order_index": order_index,
        "approval_status": "approved",
    }).execute()

    if not completed:
        return None

    completed_at = datetime.now(timezone.utc) - timedelta(days=days_ago)
    completion = sb.table("quest_task_completions").insert({
        "user_id": user_id,
        "quest_id": quest_id,
        "task_id": task_id,
        "user_quest_task_id": task_id,
        "evidence_text": f"Wrapped up {title.lower()}.",
        "completed_at": completed_at.isoformat(),
        "diploma_status": "finalized",
        "finalized_at": completed_at.isoformat(),
    }).execute()
    return completion.data[0]["id"]


# ── Learning moments (engagement-calendar fill) ───────────────────────────────

MOMENT_TEMPLATES = [
    ("Started a new sketchbook", ["art"], "art",
     "Bought a fresh sketchbook today. The blank pages feel intimidating but exciting."),
    ("Built a paper-circuit greeting card", ["stem", "art"], "art",
     "Made a card with an LED that lights up when you open it. Took three tries to get the copper tape lined up right."),
    ("Hiked Mt Pico with the family", ["wellness", "civics"], "nature",
     "Made it to the top in just under two hours. The view of the lake was worth the burning calves."),
    ("Tried a new pasta recipe", ["wellness"], "cooking",
     "Tried the lemon-garlic pasta from the cookbook Mom got me. Way easier than I thought."),
    ("Finished chapter 4 of Ender's Game", ["communication"], "reading",
     "Battle School training scenes are intense. Card writes the kids like adults and somehow it works."),
    ("Wrote a journal entry about the field trip", ["communication"], "writing",
     "Wrote about the museum visit. Tried to capture how the planetarium felt without using cheesy words."),
    ("Debugged my first React Native app", ["stem"], "coding",
     "Found a typo that had been breaking the build for an hour. Felt amazing once it ran."),
    ("Volunteered at the food drive", ["civics"], "civics",
     "Sorted canned goods at the church for three hours. More families came through than I expected."),
    ("Sketched the bug we found in the garden", ["art", "stem"], "art",
     "Drew the praying mantis from the tomato plant. Spent extra time on the wing veins."),
    ("Practiced piano scales for 20 min", ["art", "wellness"], "music",
     "Worked on C minor harmonic. Fingering still feels weird going down but I'm getting smoother."),
    ("Watched a documentary on coral reefs", ["stem"], "nature",
     "The bleaching footage was hard to watch but the recovery research gave me a little hope."),
    ("Cooked dinner for the family", ["wellness", "communication"], "cooking",
     "Made stir-fry from scratch. Burned the garlic a little but everyone ate seconds."),
    ("Ran 2 miles", ["wellness"], "sports",
     "Pushed through the third hill without walking for the first time. Slow, but I didn't stop."),
    ("Read a section of the Federalist Papers", ["civics", "communication"], "reading",
     "Started number 10 today. Madison's writing is dense but it clicks once I slow down."),
    ("Built a small lego bridge that held 3 books", ["stem"], "science",
     "Tested arch vs truss designs. The truss held more weight by a lot."),
]


def seed_moments(sb: Client, user_id: str, count: int = 25) -> None:
    """Spread `count` moments across the last ~60 days for engagement-calendar fill."""
    now = datetime.now(timezone.utc)
    dates_used = set()
    inserted = 0
    while inserted < count and len(dates_used) < 55:
        days_back = random.randint(1, 55)
        if days_back in dates_used:
            continue
        dates_used.add(days_back)
        title, pillars, image_key, reflection = random.choice(MOMENT_TEMPLATES)
        event_date = now - timedelta(days=days_back)

        r = sb.table("learning_events").insert({
            "user_id": user_id,
            "title": title,
            "description": reflection,
            "pillars": pillars,
            "source_type": "realtime",
            "event_date": event_date.date().isoformat(),
            "created_at": event_date.isoformat(),
        }).execute()
        event_id = r.data[0]["id"]

        # Mix of evidence: 60% have a photo block, 40% just text
        if random.random() < 0.6:
            sb.table("learning_event_evidence_blocks").insert({
                "learning_event_id": event_id,
                "block_type": "image",
                "content": {
                    "items": [{
                        "url": EVIDENCE_IMAGES[image_key],
                        "caption": title,
                    }],
                },
                "order_index": 0,
            }).execute()
        else:
            sb.table("learning_event_evidence_blocks").insert({
                "learning_event_id": event_id,
                "block_type": "text",
                "content": {"text": f"Quick reflection on {title.lower()}. {random.choice(['Felt good. Want to try again.', 'Harder than I thought. Going back tomorrow.', 'I noticed something new.', 'Will share this with mom later.'])}"},
                "order_index": 0,
            }).execute()

        inserted += 1
    print(f"    + {inserted} learning moments")


# ── XP totals ─────────────────────────────────────────────────────────────────

def seed_subject_xp(sb: Client, user_id: str, xp_per_subject: dict) -> None:
    """Insert user_subject_xp rows. Subjects must match school_subject enum."""
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


# ── Bounties ─────────────────────────────────────────────────────────────────

def seed_bounties(sb: Client, poster_id: str, recipient_ids: list[str]) -> None:
    """Grandma posts a couple of bounties visible to specific kids."""
    now = datetime.now(timezone.utc)
    # Constraint reminders (CHECK on `bounties`):
    #   bounty_type:       open | challenge | family | org | sponsored
    #   moderation_status: pending | ai_approved | manually_approved | rejected
    #   visibility:        public | organization | family
    #   status:            draft | pending_review | active | completed | expired | rejected
    #   xp_reward:         0..500
    bounties = [
        {
            "title": "Read a book that surprises you",
            "description": "Pick something outside your usual aisle — a memoir, sci-fi, history, anything. Tell me what you didn't expect.",
            "requirements": "Finish the book. Write a short note (3-5 sentences) on what surprised you.",
            "pillar": "communication",
            "bounty_type": "family",
            "xp_reward": 200,
            "deadline": (now + timedelta(days=30)).isoformat(),
        },
        {
            "title": "Cook one full dinner for the family",
            "description": "Plan it, shop for it (with mom), cook it, serve it. Bonus points for dessert.",
            "requirements": "Photo of the meal + a short note on what worked and what didn't.",
            "pillar": "wellness",
            "bounty_type": "family",
            "xp_reward": 250,
            "deadline": (now + timedelta(days=45)).isoformat(),
        },
    ]
    for b in bounties:
        sb.table("bounties").insert({
            **b,
            "poster_id": poster_id,
            "status": "active",
            "moderation_status": "manually_approved",
            "max_participants": 1,
            "visibility": "family",
            "allowed_student_ids": recipient_ids,
        }).execute()
    print(f"    + {len(bounties)} bounties from Grandma")


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    sb = get_client()

    print("=" * 60)
    print("Seeding demo Mitchell family + Grandma Linda")
    print("=" * 60)

    print("\n[1/6] Removing any prior demo data…")
    delete_existing_demo(sb)

    print("\n[2/6] Creating users…")
    ids: dict[str, str] = {}
    for spec in DEMO_USERS:
        ids[spec["key"]] = create_user(sb, spec)

    print("\n[3/6] Setting up observer relationships…")
    # Family tab on Sarah's parent view reads from parent_student_links
    # (independent students linked to a parent), NOT from advisor_student_assignments.
    link_parent_student(sb, ids["sarah"], ids["maya"])
    link_parent_student(sb, ids["sarah"], ids["jacob"])
    link_parent_student(sb, ids["sarah"], ids["emma"])

    # Linda is the grandma (role='observer') — her observer feed reads from
    # observer_student_links. Connect her to all 3 kids.
    link_observer_student(sb, ids["linda"], ids["maya"],  ids["sarah"])
    link_observer_student(sb, ids["linda"], ids["jacob"], ids["sarah"])
    link_observer_student(sb, ids["linda"], ids["emma"],  ids["sarah"])
    print("  ✔ Sarah observes Maya, Jacob, Emma")
    print("  ✔ Linda observes Jacob, Emma")

    print("\n[4/6] Seeding Maya (12)…")
    # In-progress: Zoo + Wellness; completed: book
    zoo_uq = start_quest(sb, ids["maya"], QUEST_IDS["zoo"], days_ago=20)
    add_task(sb, ids["maya"], QUEST_IDS["zoo"], zoo_uq, "Observe three different animal habitats", "stem", 100, 15, completed=True, order_index=0)
    add_task(sb, ids["maya"], QUEST_IDS["zoo"], zoo_uq, "Sketch your favorite animal", "art", 100, 10, completed=True, order_index=1)
    add_task(sb, ids["maya"], QUEST_IDS["zoo"], zoo_uq, "Compare two species' adaptations", "stem", 150, 0, completed=False, order_index=2)

    wellness_uq = start_quest(sb, ids["maya"], QUEST_IDS["wellness"], days_ago=12)
    add_task(sb, ids["maya"], QUEST_IDS["wellness"], wellness_uq, "Track sleep for one week", "wellness", 100, 7, completed=True, order_index=0)
    add_task(sb, ids["maya"], QUEST_IDS["wellness"], wellness_uq, "Try three new breakfasts", "wellness", 100, 0, completed=False, order_index=1)

    book_uq = start_quest(sb, ids["maya"], QUEST_IDS["book"], days_ago=45, completed=True)
    add_task(sb, ids["maya"], QUEST_IDS["book"], book_uq, "Finish the book", "communication", 200, 30, completed=True, order_index=0)
    add_task(sb, ids["maya"], QUEST_IDS["book"], book_uq, "Write a one-paragraph reflection", "communication", 100, 28, completed=True, order_index=1)

    seed_moments(sb, ids["maya"], count=28)
    seed_subject_xp(sb, ids["maya"], {
        "language_arts": 300,
        "science": 250,
        "fine_arts": 200,
        "health": 150,
        "electives": 100,
    })

    print("\n[5/6] Seeding Jacob (14)…")
    code_uq = start_quest(sb, ids["jacob"], QUEST_IDS["code"], days_ago=25)
    add_task(sb, ids["jacob"], QUEST_IDS["code"], code_uq, "Pick a local org and learn their need", "civics", 100, 20, completed=True, order_index=0)
    add_task(sb, ids["jacob"], QUEST_IDS["code"], code_uq, "Build a working prototype", "stem", 250, 5, completed=True, order_index=1)
    add_task(sb, ids["jacob"], QUEST_IDS["code"], code_uq, "Deploy and share with the org", "stem", 200, 0, completed=False, order_index=2)

    physics_uq = start_quest(sb, ids["jacob"], QUEST_IDS["physics"], days_ago=18)
    add_task(sb, ids["jacob"], QUEST_IDS["physics"], physics_uq, "Complete Unit 1: One-dimensional motion", "stem", 150, 14, completed=True, order_index=0)
    add_task(sb, ids["jacob"], QUEST_IDS["physics"], physics_uq, "Complete Unit 2: Two-dimensional motion", "stem", 150, 0, completed=False, order_index=1)

    stats_uq = start_quest(sb, ids["jacob"], QUEST_IDS["stats"], days_ago=60, completed=True)
    add_task(sb, ids["jacob"], QUEST_IDS["stats"], stats_uq, "Pass the Khan Academy unit tests", "stem", 300, 35, completed=True, order_index=0)
    add_task(sb, ids["jacob"], QUEST_IDS["stats"], stats_uq, "Apply stats to a real dataset", "stem", 200, 32, completed=True, order_index=1)

    seed_moments(sb, ids["jacob"], count=22)
    seed_subject_xp(sb, ids["jacob"], {
        "math": 400,
        "science": 350,
        "digital_literacy": 250,
        "social_studies": 100,
        "electives": 50,
    })

    print("\n[6/6] Seeding Emma (16)…")
    legal_uq = start_quest(sb, ids["emma"], QUEST_IDS["legal"], days_ago=22)
    add_task(sb, ids["emma"], QUEST_IDS["legal"], legal_uq, "Attend a court hearing (public)", "civics", 150, 18, completed=True, order_index=0)
    add_task(sb, ids["emma"], QUEST_IDS["legal"], legal_uq, "Take structured notes on argumentation", "communication", 100, 15, completed=True, order_index=1)
    add_task(sb, ids["emma"], QUEST_IDS["legal"], legal_uq, "Write up a case summary", "communication", 150, 0, completed=False, order_index=2)

    founding_uq = start_quest(sb, ids["emma"], QUEST_IDS["founding"], days_ago=14)
    add_task(sb, ids["emma"], QUEST_IDS["founding"], founding_uq, "Read the Declaration of Independence", "civics", 100, 12, completed=True, order_index=0)
    add_task(sb, ids["emma"], QUEST_IDS["founding"], founding_uq, "Read Federalist Papers #10 and #51", "civics", 150, 0, completed=False, order_index=1)

    writing_uq = start_quest(sb, ids["emma"], QUEST_IDS["writing"], days_ago=70, completed=True)
    add_task(sb, ids["emma"], QUEST_IDS["writing"], writing_uq, "Pick 3 works that matter to you", "communication", 100, 50, completed=True, order_index=0)
    add_task(sb, ids["emma"], QUEST_IDS["writing"], writing_uq, "Write analytical pieces on each", "communication", 300, 45, completed=True, order_index=1)

    seed_moments(sb, ids["emma"], count=24)
    seed_subject_xp(sb, ids["emma"], {
        "language_arts": 500,
        "social_studies": 400,
        "science": 150,
        "fine_arts": 100,
        "electives": 50,
    })

    print("\n[bonus] Grandma posts bounties…")
    seed_bounties(sb, ids["linda"], recipient_ids=[ids["jacob"], ids["emma"]])

    print("\n" + "=" * 60)
    print("Seeded successfully.")
    print("=" * 60)
    print("\nApp Review login (any of the family accounts works):")
    print(f"  Email:    maya.mitchell{DEMO_EMAIL_DOMAIN}")
    print(f"  Password: {DEMO_PASSWORD}")
    print("\nAll family accounts share the same password.")


if __name__ == "__main__":
    main()
