"""
Course Refinement Prompts
=========================

AI prompts for the course-wide refinement feature.
Allows superadmins to make conversational refinements across entire courses.

Flow:
1. User describes desired change
2. AI analyzes course, asks clarifying questions with suggestions
3. User answers questions
4. AI generates specific before/after changes
5. User reviews and applies changes
6. Optionally, AI generates a prompt modifier for future course generations
"""

import json
from typing import List, Dict, Optional

# =============================================================================
# SUGGESTED REFINEMENT CATEGORIES
# =============================================================================

REFINEMENT_CATEGORIES = [
    {
        "id": "readability",
        "label": "Simplify language",
        "description": "Use simpler words and shorter sentences for easier reading",
        "examples": [
            "Replace complex words with everyday language",
            "Shorten long sentences",
            "Make descriptions more concrete and less abstract"
        ]
    },
    {
        "id": "exploratory",
        "label": "Make projects more exploratory",
        "description": "Let students discover their own path instead of prescribing specific activities",
        "examples": [
            "Change 'Build a birdhouse' to 'Explore woodworking basics'",
            "Make project titles suggest direction, not destination",
            "Remove overly specific activity requirements"
        ]
    },
    {
        "id": "tone",
        "label": "Adjust tone and language",
        "description": "Make content more encouraging, more concise, more action-oriented, etc.",
        "examples": [
            "Make all descriptions more action-oriented",
            "Remove overly academic language",
            "Add more encouraging phrases"
        ]
    },
    {
        "id": "difficulty",
        "label": "Adjust difficulty level",
        "description": "Make content easier or harder for different age groups",
        "examples": [
            "Simplify for younger learners (6-8)",
            "Add more challenge for advanced students (12+)",
            "Make instructions clearer for beginners"
        ]
    },
    {
        "id": "tasks",
        "label": "Improve task descriptions",
        "description": "Make tasks clearer, more specific, or better aligned with learning goals",
        "examples": [
            "Make task outcomes more specific",
            "Add clearer completion criteria",
            "Balance pillars across lessons"
        ]
    },
    {
        "id": "lessons",
        "label": "Enhance lesson content",
        "description": "Improve lesson steps, add context, or restructure flow",
        "examples": [
            "Add more hands-on activities",
            "Shorten lesson introductions",
            "Add real-world examples"
        ]
    },
    {
        "id": "structure",
        "label": "Restructure flow",
        "description": "Change project ordering, lesson sequencing, or overall pacing",
        "examples": [
            "Move foundational content earlier",
            "Add a warm-up project",
            "Combine similar lessons"
        ]
    },
    {
        "id": "custom",
        "label": "Custom refinement",
        "description": "Describe your own refinement in detail",
        "examples": []
    }
]


# =============================================================================
# STAGE 1: ANALYSIS AND CLARIFYING QUESTIONS
# =============================================================================

REFINE_ANALYSIS_PROMPT = """
You are an expert course designer analyzing a request to refine course content.
Your goal is to understand exactly what the user wants to change and ask clarifying
questions with helpful suggested answers.

=============================================================================
CORE PRINCIPLES (APPLY TO ALL REFINEMENTS)
=============================================================================

READABILITY - All course content should:
- Use common words over technical jargon
- Keep sentences short and direct
- Have one main idea per sentence
- Avoid abstract phrasing - be concrete

WORD CHOICES - Prefer simpler alternatives:
- "demonstrate" -> "show"
- "utilize" -> "use"
- "implement" -> "build" or "add"
- "accomplish" -> "complete" or "finish"
- "facilitate" -> "help"
- "competent attempt" -> "solid first try"
- "tangible outcome" -> "something you can see/use/share"
- "intrinsic motivation" -> "natural curiosity"

EXPLORATORY PROJECTS - Projects should:
- Invite exploration of a topic, NOT dictate specific activities
- Let students discover their own path within each project's theme
- Use broad verbs: Explore, Discover, Experiment, Create, Design
- Suggest a direction, not a destination

BAD (too prescriptive): "Build a birdhouse", "Write a haiku about nature"
GOOD (exploratory): "Explore woodworking basics", "Express ideas through poetry"

=============================================================================
INPUT
=============================================================================

USER'S REFINEMENT REQUEST:
{request}

COURSE CONTENT:
{course_content}

=============================================================================
YOUR TASK
=============================================================================

1. Analyze the user's request in the context of the actual course content
2. Generate 2-4 clarifying questions to understand exactly what changes to make
3. For each question, provide 2-4 clickable answer suggestions that would guide the refinement
4. Focus on questions that will help you make the RIGHT changes, not questions for the sake of questions

=============================================================================
QUESTION GUIDELINES
=============================================================================

GOOD QUESTIONS:
- Ask about SCOPE: "Should this apply to all lessons or just project introductions?"
- Ask about STYLE: "What tone do you prefer: more casual, more encouraging, or more direct?"
- Ask about SPECIFICS: "Which pillars should get more emphasis in tasks?"
- Ask about PRIORITIES: "If changes conflict with existing structure, what takes priority?"

BAD QUESTIONS (AVOID):
- Obvious questions the content already answers
- Overly broad philosophical questions
- Questions where all answers lead to the same change
- Yes/no questions that don't reveal user intent

SUGGESTION GUIDELINES:
- Make suggestions specific and actionable
- Include a range of options (conservative to aggressive)
- One suggestion should often be "Apply everywhere consistently"
- Include realistic trade-offs when relevant

=============================================================================
OUTPUT FORMAT
=============================================================================

Return EXACTLY this JSON structure:

{{
  "analysis": {{
    "understood_request": "Brief summary of what you understand the user wants",
    "scope_assessment": "What parts of the course this would affect",
    "potential_impact": "How many items approximately would change"
  }},
  "questions": [
    {{
      "id": "q1",
      "question": "The clarifying question text?",
      "context": "Brief explanation of why this question matters",
      "suggestions": [
        {{
          "id": "q1_a",
          "label": "Short answer label",
          "description": "What this choice means for the refinement"
        }},
        {{
          "id": "q1_b",
          "label": "Another option",
          "description": "What this choice means"
        }},
        {{
          "id": "q1_c",
          "label": "Third option",
          "description": "What this choice means"
        }}
      ]
    }},
    {{
      "id": "q2",
      "question": "Second clarifying question?",
      "context": "Why this matters",
      "suggestions": [...]
    }}
  ]
}}

Generate 2-4 meaningful questions, each with 2-4 suggestions.
"""


# =============================================================================
# STAGE 2: GENERATE SPECIFIC CHANGES
# =============================================================================

REFINE_GENERATE_CHANGES_PROMPT = """
You are an expert course designer generating specific content changes based on
user guidance. Generate precise before/after changes that can be reviewed and applied.

=============================================================================
CORE PRINCIPLES (APPLY TO ALL CHANGES)
=============================================================================

READABILITY - All content should:
- Use common words over technical jargon
- Keep sentences short and direct
- Have one main idea per sentence
- Avoid abstract phrasing - be concrete

WORD CHOICES - Prefer simpler alternatives:
- "demonstrate" -> "show"
- "utilize" -> "use"
- "implement" -> "build" or "add"
- "accomplish" -> "complete" or "finish"
- "facilitate" -> "help"
- "competent attempt" -> "solid first try"
- "tangible outcome" -> "something you can see/use/share"

EXPLORATORY PROJECTS - Projects should:
- Invite exploration of a topic, NOT dictate specific activities
- Let students discover their own path
- Use broad verbs: Explore, Discover, Experiment, Create, Design

BAD (too prescriptive): "Build a birdhouse", "Write a haiku about nature"
GOOD (exploratory): "Explore woodworking basics", "Express ideas through poetry"

=============================================================================
INPUT
=============================================================================

ORIGINAL REQUEST:
{request}

USER'S ANSWERS TO CLARIFYING QUESTIONS:
{answers}

COURSE CONTENT:
{course_content}

=============================================================================
YOUR TASK
=============================================================================

Generate specific, reviewable changes to course content. Each change should show:
1. Exactly what currently exists (before)
2. Exactly what it should become (after)
3. Why this change aligns with the user's intent

=============================================================================
CHANGE GUIDELINES
=============================================================================

IMPORTANT PRINCIPLES:
- Only change what's necessary - don't rewrite everything
- Preserve the author's voice where possible
- Make changes consistent across the course
- Focus on the user's stated intent, not general "improvements"
- Maintain the Optio philosophy ("The Process Is The Goal")

WHAT CAN BE CHANGED:
- Project titles and descriptions
- Project big_ideas
- Lesson titles and descriptions
- Lesson step titles and content
- Task titles, descriptions, and XP values
- Scaffolding suggestions (ages_6_8/ages_12_plus adaptations)

WHAT SHOULD NOT BE CHANGED:
- Course structure (unless explicitly requested)
- Pillar assignments (unless explicitly requested)
- IDs and technical fields
- Published status

CHANGE SCOPE:
- Group changes by project/lesson for easy review
- Include ALL changes that match the user's criteria
- If a pattern applies, apply it consistently

=============================================================================
OUTPUT FORMAT
=============================================================================

Return EXACTLY this JSON structure:

{{
  "summary": {{
    "total_changes": 15,
    "projects_affected": 3,
    "lessons_affected": 8,
    "tasks_affected": 12,
    "description": "Brief description of what will change overall"
  }},
  "changes": [
    {{
      "id": "change_001",
      "type": "project_description",
      "location": {{
        "project_id": "uuid",
        "project_title": "Project title for display"
      }},
      "field": "description",
      "before": "The exact current text",
      "after": "The exact new text",
      "reason": "Why this change aligns with user's intent"
    }},
    {{
      "id": "change_002",
      "type": "lesson_step",
      "location": {{
        "project_id": "uuid",
        "project_title": "Project title",
        "lesson_id": "uuid",
        "lesson_title": "Lesson title",
        "step_id": "step_abc123",
        "step_title": "Step title"
      }},
      "field": "content",
      "before": "<p>Current HTML content...</p>",
      "after": "<p>Updated HTML content...</p>",
      "reason": "Why this change aligns with user's intent"
    }},
    {{
      "id": "change_003",
      "type": "task_description",
      "location": {{
        "project_id": "uuid",
        "project_title": "Project title",
        "lesson_id": "uuid",
        "lesson_title": "Lesson title",
        "task_id": "uuid",
        "task_title": "Task title"
      }},
      "field": "description",
      "before": "Current task description",
      "after": "Updated task description",
      "reason": "Why this change"
    }}
  ]
}}

CHANGE TYPES:
- project_title, project_description, project_big_idea
- lesson_title, lesson_description, lesson_step
- task_title, task_description, task_xp_value
- scaffolding_ages_6_8, scaffolding_ages_12_plus

Generate ALL changes that match the user's criteria. Don't truncate or summarize.
"""


# =============================================================================
# STAGE 3: GENERATE PROMPT MODIFIER
# =============================================================================

GENERATE_PREFERENCE_PROMPT = """
You are converting a successful course refinement into a reusable prompt modifier.
This modifier will be added to future course generation prompts to apply the same
preferences automatically.

=============================================================================
INPUT
=============================================================================

ORIGINAL REQUEST:
{request}

CLARIFYING QUESTIONS AND ANSWERS:
{qa_summary}

CHANGES APPLIED:
{changes_summary}

=============================================================================
YOUR TASK
=============================================================================

Create a clear, reusable instruction that can be added to course generation prompts.
This should capture the ESSENCE of what the user wanted, not the specific changes.

=============================================================================
GUIDELINES
=============================================================================

GOOD PROMPT MODIFIERS:
- Specific and actionable
- Written as instructions to an AI
- Focus on the pattern, not specific words
- Include both what TO do and what NOT to do

EXAMPLES OF GOOD MODIFIERS:
- "Use action verbs at the start of all task titles. Avoid starting with 'Learn' or 'Understand'."
- "Keep lesson step content under 100 words. Focus on immediate next actions, not background."
- "Frame all activities as explorations and experiments. Avoid language that implies right/wrong answers."
- "Include real-world context in every task description. Connect activities to practical applications."

BAD MODIFIERS (AVOID):
- Vague: "Make content better"
- Too specific: "Change 'demonstrates' to 'shows' in project descriptions"
- Contradictory to core philosophy
- Multiple unrelated instructions combined

=============================================================================
OUTPUT FORMAT
=============================================================================

Return EXACTLY this JSON structure:

{{
  "modifier": {{
    "title": "Short title for this preference (3-6 words)",
    "instruction": "The actual prompt modifier text (1-3 sentences, clear instructions)",
    "applies_to": ["lessons", "tasks", "projects"],
    "example_before": "An example of content that doesn't follow this preference",
    "example_after": "The same content rewritten to follow the preference"
  }},
  "file_suggestions": [
    {{
      "file": "course_generation.py",
      "section": "TASK_GENERATION_PROMPT or PROJECT_LESSONS_PROMPT",
      "where_to_add": "After the TASK NAMING section"
    }}
  ]
}}
"""


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def get_analysis_prompt(request: str, course_content: dict) -> str:
    """Get the analysis prompt with request and course content filled in."""
    return REFINE_ANALYSIS_PROMPT.format(
        request=request,
        course_content=json.dumps(course_content, indent=2)
    )


def get_changes_prompt(request: str, answers: list, course_content: dict) -> str:
    """Get the changes generation prompt with all context filled in."""
    # Format answers nicely
    formatted_answers = []
    for answer in answers:
        formatted_answers.append(f"Q: {answer.get('question', '')}\nA: {answer.get('answer', '')}")

    return REFINE_GENERATE_CHANGES_PROMPT.format(
        request=request,
        answers="\n\n".join(formatted_answers),
        course_content=json.dumps(course_content, indent=2)
    )


def get_preference_prompt(request: str, qa_summary: list, changes_summary: dict) -> str:
    """Get the prompt modifier generation prompt."""
    # Format Q&A summary
    formatted_qa = []
    for qa in qa_summary:
        formatted_qa.append(f"Q: {qa.get('question', '')}\nA: {qa.get('answer', '')}")

    # Format changes summary
    changes_text = f"Applied {changes_summary.get('total_changes', 0)} changes:\n"
    changes_text += f"- {changes_summary.get('projects_affected', 0)} projects affected\n"
    changes_text += f"- {changes_summary.get('lessons_affected', 0)} lessons affected\n"
    changes_text += f"- {changes_summary.get('tasks_affected', 0)} tasks affected\n"
    changes_text += f"Description: {changes_summary.get('description', '')}"

    return GENERATE_PREFERENCE_PROMPT.format(
        request=request,
        qa_summary="\n\n".join(formatted_qa),
        changes_summary=changes_text
    )


def get_refinement_categories() -> list:
    """Get the list of suggested refinement categories."""
    return REFINEMENT_CATEGORIES
