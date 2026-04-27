"""
Build the Optio "Python 1" course for Williamsburg Learning.

Creates a draft Course mirroring the Skill Struck Python 1 curriculum:
  - 6 Projects (Quests) covering the same concepts a Traditional-path
    student would learn through Skill Struck
  - Weighted xp_thresholds totaling 1,000 XP across the 6 Projects
  - One navigation-only Lesson per Project (Skill Struck owns the teaching;
    the Lesson layer is just the structural bridge between the Project
    and its Task menu, because the enrollment service copies tasks via
    curriculum_lesson_tasks)
  - Task menus per Project (Skill Struck anchor + self-directed alternatives)

Everything is created unpublished:
  - course.status                = 'draft'
  - quest.is_active              = False
  - quest.is_public              = False
  - course_quests.is_published   = False
  - curriculum_lessons.is_published = False

Nothing becomes user-visible until explicitly published from the admin
Course Builder.

Usage:
    python backend/scripts/build_williamsburg_courses/python_1.py
"""

import os
import random
import string
import sys
import time

from dotenv import load_dotenv
from supabase import create_client

# --- Setup -------------------------------------------------------------------

ENV_PATH = os.path.join(os.path.dirname(__file__), '..', '..', '.env')
load_dotenv(ENV_PATH)


def get_admin_client():
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_SERVICE_KEY')
    if not url or not key:
        raise RuntimeError(
            "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env"
        )
    return create_client(url, key), url


# --- Constants ---------------------------------------------------------------

# Tanner Bowman, superadmin, no organization (platform-level course).
CREATOR_USER_ID = "ad8e119c-0685-4431-8381-527273832ca9"

COURSE_TITLE = "Python 1"
COURSE_SLUG = "python-1-wl"

QUEST_TOPIC_PRIMARY = "Academic"
QUEST_TOPICS = ["Computer Science", "Programming", "Python"]


def step_id() -> str:
    """Match the existing format: step_<ms>_<6 random alphanum>."""
    rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=9))
    return f"step_{int(time.time() * 1000)}_{rand}"


def lesson_content(steps: list) -> dict:
    """Wrap a list of {title, html} step dicts into the v2 content format."""
    return {
        "version": 2,
        "steps": [
            {
                "id": step_id(),
                "type": "text",
                "order": i,
                "title": s["title"],
                "content": s["html"],
            }
            for i, s in enumerate(steps)
        ],
    }


# --- Lesson templates --------------------------------------------------------
#
# Williamsburg students taking the Optio path use Skill Struck as their
# instructional resource. The Optio Lesson layer is therefore intentionally
# minimal -- one short note saying "Skill Struck owns the lessons" and
# pointing the student at the Task menu.

NAVIGATION_STEPS = [
    {
        "title": "How to use this Project",
        "html": (
            "<p>Skill Struck has full walkthroughs for the concepts in this "
            "Project. Use them as much or as little as you want.</p>"
            "<p>Or jump straight to a task below and start building. The goal "
            "is to make something, not to finish a lesson. Either path counts "
            "for XP -- pick whichever helps you learn.</p>"
        ),
    },
]

CAPSTONE_NAVIGATION_STEPS = [
    {
        "title": "How the capstone works",
        "html": (
            "<p>This is your final project: a Python program of your own design. "
            "The flow is:</p>"
            "<ol>"
            "<li><strong>Propose</strong> -- write a 1-paragraph description of "
            "what you'll build, what concepts it uses, and how you'll know it's "
            "done. Get teacher approval before starting the build.</li>"
            "<li><strong>Build</strong> -- write the program. Use at least 4 of: "
            "variables, conditionals, loops, lists, strings, and functions.</li>"
            "<li><strong>Demo</strong> (optional) -- record a short walkthrough.</li>"
            "</ol>"
            "<p>The proposal is a small task; the build is the big one. Don't "
            "skip the proposal -- it's where your teacher catches scope problems "
            "before you waste time.</p>"
        ),
    },
]


# --- Course metadata ---------------------------------------------------------

COURSE = {
    "title": COURSE_TITLE,
    "slug": COURSE_SLUG,
    "description": (
        "Learn Python from scratch by building real programs you actually "
        "want to run. Variables, input and output, math, strings, lists, "
        "conditionals, and loops, with a final project of your own design. "
        "Designed for Williamsburg students taking the Optio path: complete "
        "the course's XP target through Skill Struck activities, "
        "self-directed builds, or any mix of both."
    ),
    "status": "draft",
    "visibility": "public",
    "navigation_mode": "sequential",
    "guidance_level": "moderate",
    "course_source": "admin",
    "estimated_hours": 60,
    "target_audience": "High school students taking Williamsburg Python 1.",
    "age_range": "13-18",
    "credit_subject": "Computer Science",
    "credit_amount": 0.5,
    "learning_outcomes": [
        "Write Python programs that take input and produce output.",
        "Use variables, conditionals, loops, and lists to solve problems.",
        "Manipulate strings and combine them with numbers.",
        "Design and ship a small program of your own choosing.",
    ],
    "final_deliverable": (
        "A Python program of your own design that demonstrates the course's "
        "core concepts: variables, conditionals, loops, lists, and strings."
    ),
    "educational_value": (
        "Earns a Computer Science elective credit. The course follows the "
        "same scope and sequence as the Skill Struck Python 1 curriculum, "
        "but lets students earn XP through any combination of Skill Struck "
        "activities and self-directed builds."
    ),
    "academic_alignment": (
        "Aligned to Williamsburg Learning's Python 1 (Skill Struck) "
        "curriculum: variables, I/O, types, math, modulus, strings, "
        "string methods, lists, conditionals, and for loops."
    ),
}


# --- Tasks (defined separately to keep PROJECTS readable) --------------------

PROJECT_1_TASKS = [
    {
        "title": "Complete the Skill Struck Variables & I/O lessons",
        "description": (
            "Work through Skill Struck lessons: Introduction, Variables, "
            "Input/Output, Syntax & Comments, Variable Types. Submit a "
            "screenshot of completion plus 2-3 sentences on what surprised you."
        ),
        "pillar": "stem",
        "xp_value": 60,
    },
    {
        "title": "Complete the Skill Struck Mad Libs project",
        "description": (
            "Finish the Skill Struck Mad Libs project. Submit your code and a "
            "screenshot of the output."
        ),
        "pillar": "stem",
        "xp_value": 75,
    },
    {
        "title": "Build your own Mad Libs",
        "description": (
            "Write a Mad Libs generator using a story or topic you actually "
            "like (a movie, sport, hobby, in-joke). Submit the code and a "
            "sample run. Bonus points for being ridiculous."
        ),
        "pillar": "art",
        "xp_value": 100,
    },
    {
        "title": "Build a profile generator",
        "description": (
            "Write a Python program that asks for a person's name, age, and "
            "3 interests, then prints a styled bio paragraph. Submit the code "
            "and a screenshot of it running with sample input."
        ),
        "pillar": "stem",
        "xp_value": 75,
    },
    {
        "title": "Teach someone what a variable is",
        "description": (
            "Explain what a variable is to a sibling, friend, or parent. "
            "Submit either a written explanation (1-2 paragraphs) or a "
            "1-2 minute video or audio recording of you explaining it."
        ),
        "pillar": "communication",
        "xp_value": 50,
    },
]

PROJECT_2_TASKS = [
    {
        "title": "Complete the Skill Struck Numbers & Math lessons",
        "description": (
            "Work through Skill Struck lessons: Numbers, Converting, Python Math, "
            "Modulus. Submit a screenshot of completion plus 2-3 sentences on "
            "what was the trickiest part."
        ),
        "pillar": "stem",
        "xp_value": 50,
    },
    {
        "title": "Complete the Skill Struck Simple Calculator project",
        "description": (
            "Finish the Skill Struck Simple Calculator project. Submit your code "
            "and a screenshot of it running."
        ),
        "pillar": "stem",
        "xp_value": 75,
    },
    {
        "title": "Build a calculator for something you actually use",
        "description": (
            "Build a Python calculator for a real situation: tip calculator, "
            "GPA calculator, recipe scaler, fuel cost estimator, etc. Submit "
            "the code and a screenshot showing it working with real numbers."
        ),
        "pillar": "stem",
        "xp_value": 100,
    },
    {
        "title": "Use modulus to solve a real problem",
        "description": (
            "Use the modulus operator to solve something practical. Examples: "
            "decide if a number is even or odd, calculate days into the future "
            "with weekday output, build a clock display, alternate output styles. "
            "Submit the code and a 1-2 sentence note on the problem."
        ),
        "pillar": "stem",
        "xp_value": 75,
    },
    {
        "title": "Make math visual",
        "description": (
            "Use Python and basic math to print something visual: a multiplication "
            "table, a Fibonacci sequence, ASCII art shapes scaled by user input. "
            "Submit the code and a screenshot."
        ),
        "pillar": "art",
        "xp_value": 100,
    },
]

# Project 3: 9 tasks (5 from String Methods + 4 from Combining Numbers and Strings)
PROJECT_3_TASKS = [
    {
        "title": "Complete the Skill Struck String Methods lessons",
        "description": (
            "Work through Skill Struck lessons: Strings, String Methods, "
            "String Methods Continued, Checking Strings. Submit screenshots "
            "of completion."
        ),
        "pillar": "stem",
        "xp_value": 60,
    },
    {
        "title": "Complete the Skill Struck Reading Competition project",
        "description": (
            "Finish the Skill Struck Reading Competition project. Submit your "
            "code and a screenshot."
        ),
        "pillar": "stem",
        "xp_value": 75,
    },
    {
        "title": "Complete the Skill Struck Decipher project",
        "description": (
            "Finish the Skill Struck Decipher project. Submit your code and a "
            "screenshot."
        ),
        "pillar": "stem",
        "xp_value": 75,
    },
    {
        "title": "Build your own cipher",
        "description": (
            "Write your own encryption or decryption tool. Could be a Caesar "
            "cipher, ROT13, or a scheme you invent. Submit the code, an example "
            "encoded message, and a 1-2 sentence note on how your scheme works."
        ),
        "pillar": "stem",
        "xp_value": 100,
    },
    {
        "title": "Analyze a piece of writing",
        "description": (
            "Pick something you (or someone) wrote -- an essay, a song, a "
            "speech. Write a Python script that reports word count, most "
            "common word, average sentence length, and one stat of your "
            "choosing. Submit the code, the input text, and the output."
        ),
        "pillar": "communication",
        "xp_value": 100,
    },
    {
        "title": "Complete the Skill Struck Concatenating Numbers lessons",
        "description": (
            "Work through Skill Struck lessons: Concatenating Numbers and "
            "Concatenating Numbers Continued. Submit screenshots of completion."
        ),
        "pillar": "stem",
        "xp_value": 50,
    },
    {
        "title": "Complete the Skill Struck Story Maker project",
        "description": (
            "Finish the Skill Struck Story Maker project. Submit your code "
            "and a screenshot."
        ),
        "pillar": "stem",
        "xp_value": 75,
    },
    {
        "title": "Build a receipt printer",
        "description": (
            "Write a Python script that takes a list of items and prices, "
            "computes a total with tax, and prints a formatted receipt. "
            "Submit the code and a screenshot of a sample receipt."
        ),
        "pillar": "stem",
        "xp_value": 100,
    },
    {
        "title": "Generate status updates",
        "description": (
            "Write a script that takes data (steps walked, tasks done, hours "
            "studied -- pick something) and generates a formatted status "
            "update for a parent or teacher. Submit the code and 2-3 sample "
            "outputs."
        ),
        "pillar": "communication",
        "xp_value": 100,
    },
]

PROJECT_4_TASKS = [
    {
        "title": "Complete the Skill Struck Lists lesson",
        "description": (
            "Work through the Skill Struck Lists lesson. Submit a screenshot "
            "of completion plus 1-2 sentences on what surprised you."
        ),
        "pillar": "stem",
        "xp_value": 50,
    },
    {
        "title": "Complete the Skill Struck Team Roster project",
        "description": (
            "Finish the Skill Struck Team Roster project. Submit your code "
            "and a screenshot."
        ),
        "pillar": "stem",
        "xp_value": 75,
    },
    {
        "title": "Build an inventory tracker",
        "description": (
            "Build a list-based tracker for something you actually own: books, "
            "games, cards, plants, pieces of equipment. The script should let "
            "you add items, remove items, and print the current inventory. "
            "Submit the code and a screenshot of it running."
        ),
        "pillar": "stem",
        "xp_value": 100,
    },
    {
        "title": "Build a bucket list manager",
        "description": (
            "Create a Python program that manages a bucket list: add items, "
            "mark them as done, list remaining. Use real items you actually "
            "want to do. Submit the code and a sample run."
        ),
        "pillar": "wellness",
        "xp_value": 75,
    },
    {
        "title": "Build a random picker",
        "description": (
            "Write a script that picks a random item from a list. Use it for "
            "something real: dinner choices, daily exercise, study topic, "
            "what to draw today. Submit the code and 2-3 sample picks."
        ),
        "pillar": "stem",
        "xp_value": 75,
    },
]

# Project 5: 9 tasks (4 from Conditionals + 5 from For Loops)
PROJECT_5_TASKS = [
    {
        "title": "Complete the Skill Struck Conditionals lessons",
        "description": (
            "Work through Skill Struck lessons: Python If Statements, Python "
            "Conditionals, Python Else If Statements. Submit screenshots of "
            "completion."
        ),
        "pillar": "stem",
        "xp_value": 60,
    },
    {
        "title": "Build a decision-tree quiz",
        "description": (
            "Build a quiz or 'choose your own adventure' that branches based on "
            "the user's answers. At least 4 distinct outcomes. Submit the code "
            "and a screenshot showing two different paths through it."
        ),
        "pillar": "stem",
        "xp_value": 100,
    },
    {
        "title": "Build a grader script",
        "description": (
            "Write a script that takes a numeric score and prints the letter "
            "grade plus a short feedback message. Customize the cutoffs and the "
            "feedback to a class or context you actually care about. Submit the "
            "code and a few sample runs."
        ),
        "pillar": "stem",
        "xp_value": 75,
    },
    {
        "title": "Build a mood-based recommender",
        "description": (
            "Build a script that asks a few questions about the user's mood or "
            "energy and recommends an activity, song, food, or anything else. "
            "Submit the code and a couple of sample interactions."
        ),
        "pillar": "art",
        "xp_value": 75,
    },
    {
        "title": "Complete the Skill Struck For Loops lesson",
        "description": (
            "Work through the Skill Struck Python For Loops lesson. Submit a "
            "screenshot of completion."
        ),
        "pillar": "stem",
        "xp_value": 40,
    },
    {
        "title": "Complete the Skill Struck Sentence Generator project",
        "description": (
            "Finish the Skill Struck Sentence Generator project. Submit your "
            "code and a screenshot."
        ),
        "pillar": "stem",
        "xp_value": 75,
    },
    {
        "title": "Complete the Skill Struck Earnings Calculator project",
        "description": (
            "Finish the Skill Struck Earnings Calculator project. Submit your "
            "code and a screenshot."
        ),
        "pillar": "stem",
        "xp_value": 75,
    },
    {
        "title": "Draw something with a for loop",
        "description": (
            "Use a for loop to print ASCII patterns: triangles, diamonds, your "
            "initials in big block letters, a multiplication table, etc. Submit "
            "the code and a screenshot of the output."
        ),
        "pillar": "art",
        "xp_value": 100,
    },
    {
        "title": "Build a quiz loop",
        "description": (
            "Build a Python program that quizzes you on something (multiplication "
            "tables, vocabulary, capitals -- pick something you actually want to "
            "drill) using a loop. Track and report how many you got right. "
            "Submit the code and a sample run."
        ),
        "pillar": "stem",
        "xp_value": 100,
    },
]

PROJECT_6_TASKS = [
    {
        "title": "Submit a capstone proposal",
        "description": (
            "Write a 1-paragraph proposal for what you'll build. Include: what "
            "the program does, which course concepts it uses (variables, "
            "conditionals, loops, lists, strings), and how you'll know it's "
            "done.\n\n"
            "Good capstones usually share these traits:\n"
            "- They do something you actually want to use, not just something "
            "that demonstrates a concept.\n"
            "- They use at least 4 of the course's concepts.\n"
            "- They run end-to-end without crashing on normal input.\n"
            "- You can explain how they work in 2-3 minutes.\n\n"
            "Stuck for ideas? A tracker for something you do, a generator "
            "(jokes, names, prompts), a calculator for a niche thing you use, "
            "a text-based game, a study tool, an automation for a chore. "
            "Get teacher approval before starting the full build."
        ),
        "pillar": "stem",
        "xp_value": 50,
    },
    {
        "title": "Build and submit your capstone",
        "description": (
            "Build the program from your approved proposal. It must use at "
            "least 4 of these: variables, conditionals, loops, lists, strings, "
            "and functions (which you'll need to look up -- that's part of the "
            "exercise). Submit: the full code, screenshots or a screen "
            "recording of it running, and a 3-5 sentence reflection on what "
            "was hardest and what you learned."
        ),
        "pillar": "stem",
        "xp_value": 200,
    },
    {
        "title": "Record a capstone demo",
        "description": (
            "Record a 2-5 minute video walking someone through your capstone. "
            "Show what it does, walk through the code, and talk about one "
            "challenge you solved. Submit the video link or file."
        ),
        "pillar": "communication",
        "xp_value": 100,
    },
]


# --- Project definitions -----------------------------------------------------
#
# XP totals (sum of xp_threshold across Projects = 1000):
#   1. Hello, Python:            150
#   2. Numbers & Math:           150
#   3. Strings:                  150
#   4. Lists:                    150
#   5. Decisions & Loops:        150
#   6. Build Something Real:     250
#                              -----
#                               1000

def navigation_lesson(tasks):
    return {
        "title": "Get Started",
        "description": "Pick any task to start. Skill Struck has the walkthroughs.",
        "steps": NAVIGATION_STEPS,
        "tasks": tasks,
    }


def capstone_lesson(tasks):
    return {
        "title": "Plan & Build",
        "description": "Propose, build, and (optionally) demo your capstone.",
        "steps": CAPSTONE_NAVIGATION_STEPS,
        "tasks": tasks,
    }


PROJECTS = [
    {
        "title": "Hello, Python",
        "description": (
            "Get Python running, take input from a person, and print "
            "something back. Variables, input/output, syntax, data types, "
            "and concatenation."
        ),
        "big_idea": (
            "A program is a conversation: it takes input from a person or "
            "the world, transforms it, and produces output. In this Project "
            "you write your first conversations."
        ),
        "xp_threshold": 150,
        "lessons": [navigation_lesson(PROJECT_1_TASKS)],
    },
    {
        "title": "Numbers & Math",
        "description": (
            "Numbers, type conversion, arithmetic, and the modulus operator. "
            "Use Python to do math you would otherwise do in your head or "
            "on a calculator."
        ),
        "big_idea": (
            "Computers are very good at arithmetic. Once you know how to "
            "tell Python what to compute, you can use it to solve problems "
            "you actually care about, faster than you could by hand."
        ),
        "xp_threshold": 150,
        "lessons": [navigation_lesson(PROJECT_2_TASKS)],
    },
    {
        "title": "Strings",
        "description": (
            "Manipulate text: string methods, slicing, checking content, and "
            "combining strings with numbers. The biggest concept block in "
            "Python 1 -- everything you build will use strings."
        ),
        "big_idea": (
            "Most of the data in the world is text. Python gives you tools "
            "to inspect, transform, and combine text in ways that would "
            "take ages by hand."
        ),
        "xp_threshold": 150,
        "lessons": [navigation_lesson(PROJECT_3_TASKS)],
    },
    {
        "title": "Lists",
        "description": (
            "Store and work with collections of items: lists, indexing, "
            "appending, and basic list operations."
        ),
        "big_idea": (
            "Most real problems involve more than one of something: a roster, "
            "an inventory, a to-do list. Lists are how Python holds collections."
        ),
        "xp_threshold": 150,
        "lessons": [navigation_lesson(PROJECT_4_TASKS)],
    },
    {
        "title": "Decisions & Loops",
        "description": (
            "Make programs that make decisions (if/elif/else) and that "
            "repeat themselves (for loops). The two ideas that turn a "
            "script into a real program."
        ),
        "big_idea": (
            "A program with no decisions just does the same thing every "
            "time. A program with no loops can only do one thing. "
            "Conditionals and loops together let you write programs that "
            "respond and that scale."
        ),
        "xp_threshold": 150,
        "lessons": [navigation_lesson(PROJECT_5_TASKS)],
    },
    {
        "title": "Build Something Real",
        "description": (
            "A Python program of your own design that ties everything "
            "together. Your choice of topic, scope, and shape -- with a "
            "proposal, a build, and an optional short demo."
        ),
        "big_idea": (
            "The point of learning Python is to make things you wouldn't "
            "otherwise be able to make. This capstone is your first real "
            "shot at that: pick something you actually want to exist, "
            "and build it."
        ),
        "xp_threshold": 250,
        "lessons": [capstone_lesson(PROJECT_6_TASKS)],
    },
]


# --- Build helpers -----------------------------------------------------------


def assert_no_existing_course(client) -> None:
    existing = client.table('courses') \
        .select('id, title, status') \
        .eq('slug', COURSE_SLUG) \
        .execute()
    if existing.data:
        ids = ', '.join(c['id'] for c in existing.data)
        raise SystemExit(
            f"A course with slug '{COURSE_SLUG}' already exists "
            f"({ids}). Delete it from the admin Course Builder, "
            f"then re-run this script."
        )


def insert_course(client) -> str:
    payload = {
        **COURSE,
        "created_by": CREATOR_USER_ID,
        "organization_id": None,  # platform-level
    }
    result = client.table('courses').insert(payload).execute()
    if not result.data:
        raise RuntimeError(f"Failed to insert course: {result}")
    return result.data[0]['id']


def insert_quest(client, project: dict) -> str:
    payload = {
        "title": project["title"],
        "description": project["description"],
        "big_idea": project["big_idea"],
        "quest_type": "optio",
        "is_active": False,
        "is_public": False,
        "created_by": CREATOR_USER_ID,
        "organization_id": None,
        "topic_primary": QUEST_TOPIC_PRIMARY,
        "topics": QUEST_TOPICS,
        "allow_custom_tasks": True,
    }
    result = client.table('quests').insert(payload).execute()
    if not result.data:
        raise RuntimeError(f"Failed to insert quest '{project['title']}'")
    return result.data[0]['id']


def link_course_quest(client, course_id: str, quest_id: str,
                      sequence_order: int, xp_threshold: int) -> str:
    payload = {
        "course_id": course_id,
        "quest_id": quest_id,
        "sequence_order": sequence_order,
        "is_required": True,
        "is_published": False,
        "xp_threshold": xp_threshold,
    }
    result = client.table('course_quests').insert(payload).execute()
    if not result.data:
        raise RuntimeError(
            f"Failed to link quest {quest_id} to course {course_id}"
        )
    return result.data[0]['id']


def insert_lesson(client, quest_id: str, lesson: dict, sequence_order: int) -> str:
    payload = {
        "quest_id": quest_id,
        "title": lesson["title"],
        "description": lesson["description"],
        "content": lesson_content(lesson["steps"]),
        "sequence_order": sequence_order,
        # Lessons are navigation-only containers; safe to publish on creation.
        # Course visibility is still gated by course.status (draft) until the
        # admin flips it from the Course Builder.
        "is_published": True,
        "is_required": True,
        "created_by": CREATOR_USER_ID,
        "organization_id": None,
    }
    result = client.table('curriculum_lessons').insert(payload).execute()
    if not result.data:
        raise RuntimeError(f"Failed to insert lesson '{lesson['title']}'")
    return result.data[0]['id']


def get_or_create_user_quest(client, quest_id: str) -> str:
    """
    Match the wizard's pattern (course_generation_service._get_or_create_user_quest):
    course creator gets a user_quests enrollment so tasks can live in
    user_quest_tasks with a valid user_quest_id FK.
    """
    existing = client.table('user_quests') \
        .select('id') \
        .eq('user_id', CREATOR_USER_ID) \
        .eq('quest_id', quest_id) \
        .execute()
    if existing.data:
        return existing.data[0]['id']
    result = client.table('user_quests').insert({
        "user_id": CREATOR_USER_ID,
        "quest_id": quest_id,
        "status": "picked_up",
    }).execute()
    if not result.data:
        raise RuntimeError(f"Failed to create user_quests enrollment for quest {quest_id}")
    return result.data[0]['id']


def insert_task(client, quest_id: str, user_quest_id: str,
                task: dict, order_index: int) -> str:
    """Insert into user_quest_tasks per the wizard's pattern."""
    payload = {
        "user_id": CREATOR_USER_ID,
        "quest_id": quest_id,
        "user_quest_id": user_quest_id,
        "title": task["title"],
        "description": task["description"],
        "pillar": task["pillar"],
        "xp_value": task["xp_value"],
        "order_index": order_index,
        "is_required": False,
        "is_manual": False,
        "approval_status": "approved",
    }
    result = client.table('user_quest_tasks').insert(payload).execute()
    if not result.data:
        raise RuntimeError(f"Failed to insert task '{task['title']}'")
    return result.data[0]['id']


def link_lesson_task(client, lesson_id: str, task_id: str, quest_id: str,
                     display_order: int) -> None:
    payload = {
        "lesson_id": lesson_id,
        "task_id": task_id,
        "quest_id": quest_id,
        "display_order": display_order,
        "organization_id": None,
    }
    client.table('curriculum_lesson_tasks').insert(payload).execute()


def build(client) -> str:
    assert_no_existing_course(client)

    print(f"Creating course '{COURSE_TITLE}'...")
    course_id = insert_course(client)
    print(f"  course_id = {course_id}")

    project_total_xp = 0
    task_total_xp = 0
    lesson_count = 0
    task_count = 0

    for proj_idx, project in enumerate(PROJECTS):
        print(f"\nProject {proj_idx + 1}: {project['title']} "
              f"(threshold {project['xp_threshold']} XP)")

        quest_id = insert_quest(client, project)
        link_course_quest(
            client,
            course_id=course_id,
            quest_id=quest_id,
            sequence_order=proj_idx,
            xp_threshold=project["xp_threshold"],
        )
        project_total_xp += project["xp_threshold"]

        user_quest_id = get_or_create_user_quest(client, quest_id)
        task_order_in_quest = 0

        for lesson_idx, lesson in enumerate(project["lessons"]):
            lesson_id = insert_lesson(client, quest_id, lesson, lesson_idx)
            lesson_count += 1
            print(f"  Lesson: {lesson['title']} ({len(lesson['tasks'])} tasks)")

            for task_idx, task in enumerate(lesson["tasks"]):
                task_id = insert_task(
                    client,
                    quest_id=quest_id,
                    user_quest_id=user_quest_id,
                    task=task,
                    order_index=task_order_in_quest,
                )
                task_order_in_quest += 1
                link_lesson_task(
                    client,
                    lesson_id=lesson_id,
                    task_id=task_id,
                    quest_id=quest_id,
                    display_order=task_idx,
                )
                task_count += 1
                task_total_xp += task["xp_value"]

    print("\n" + "=" * 60)
    print(f"DONE. course_id = {course_id}")
    print(f"  6 Projects, {lesson_count} Lessons, {task_count} Tasks")
    print(f"  XP threshold total (across Projects): {project_total_xp}")
    print(f"  XP available to students (sum of all task values): {task_total_xp}")
    print("=" * 60)

    return course_id


def main():
    client, supabase_url = get_admin_client()
    print(f"Target Supabase: {supabase_url}")
    print(f"Course: '{COURSE_TITLE}' (slug={COURSE_SLUG}, status=draft)")
    print()

    try:
        course_id = build(client)
    except SystemExit:
        raise
    except Exception:
        print("\nBuild failed. The course and any partial child rows are "
              "still in the database. Delete the course from the admin "
              "Course Builder and re-run.", file=sys.stderr)
        raise

    print(f"\nReview at:")
    print(f"  https://www.optioeducation.com/admin/courses/{course_id}/builder")
    print(f"  https://optio-dev-frontend.onrender.com/admin/courses/{course_id}/builder")
    print(f"  http://localhost:3000/admin/courses/{course_id}/builder")


if __name__ == "__main__":
    main()
