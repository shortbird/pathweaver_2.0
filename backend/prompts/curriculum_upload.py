"""
Curriculum Upload Prompts
=========================

AI prompts for the curriculum upload pipeline.
Supports configurable transformation intensity and structure preservation.

Transformation Levels:
- light: Minimal changes, fix only forbidden words, keep original voice
- moderate: Reframe language, add Optio elements, preserve core content
- full: Complete rewrite in Optio tone and philosophy

Structure Options:
- preserve: Keep original document structure (modules, lessons, order)
- restructure: Reorganize for just-in-time teaching flow
"""

# =============================================================================
# STAGE 2: STRUCTURE DETECTION
# =============================================================================

CURRICULUM_STRUCTURE_DETECTION = """
You are analyzing educational curriculum content to identify its structure.

TASK: Extract the curriculum's organizational structure without modifying content.

IDENTIFY AND EXTRACT:

1. COURSE (top level):
   - title: The course/unit name
   - description: Course overview or summary
   - objectives: Learning objectives if stated
   - duration: Time span if mentioned (weeks, hours, etc.)

2. MODULES (major sections):
   - title: Module/unit name
   - description: Module overview
   - order: Sequence number
   - parent: null (modules are top-level containers)

3. LESSONS (content within modules):
   - title: Lesson name
   - description: What the lesson covers
   - content: The actual lesson text/material
   - order: Sequence within module
   - parent_module: Reference to containing module

4. TASKS (assignments, activities, assessments):
   - title: Task/assignment name
   - description: What students must do
   - type: assignment | quiz | discussion | project | reading
   - points: Point value if specified
   - order: Sequence
   - parent_lesson: Reference to related lesson (if any)

5. CURRICULUM_TYPE: Classify as one of:
   - syllabus: Course overview with policies and schedule
   - lesson_plan: Detailed single lesson with activities
   - course_outline: Module/unit structure with topics
   - assignment: Single assignment or project description
   - textbook: Educational content with chapters/sections
   - unknown: Cannot determine

RETURN FORMAT:
{
  "course": {
    "title": "...",
    "description": "...",
    "objectives": ["..."],
    "duration": "..."
  },
  "modules": [
    {
      "id": "module_1",
      "title": "...",
      "description": "...",
      "order": 1
    }
  ],
  "lessons": [
    {
      "id": "lesson_1",
      "title": "...",
      "description": "...",
      "content": "...",
      "order": 1,
      "parent_module": "module_1"
    }
  ],
  "tasks": [
    {
      "id": "task_1",
      "title": "...",
      "description": "...",
      "type": "assignment",
      "points": 100,
      "order": 1,
      "parent_lesson": "lesson_1"
    }
  ],
  "curriculum_type": "course_outline"
}

Be thorough in extraction. Preserve original wording exactly - do not rephrase yet.
"""

# =============================================================================
# STAGE 3: PHILOSOPHY ALIGNMENT
# =============================================================================

# Intensity-specific instructions
TRANSFORMATION_LIGHT = """
TRANSFORMATION LEVEL: LIGHT (Preserve Original)

RULES:
1. KEEP the educator's original content exactly as written
   - Preserve their voice, tone, and word choices
   - Maintain all requirements and specifications
   - Keep academic/formal language if that's their style

2. ONLY make structural adjustments:
   - Organize into Optio's module/lesson/task format
   - Assign pillars to tasks based on content
   - Set appropriate XP values

3. DO NOT change wording or add Optio-specific language
4. Respect the content creator's choices

GOAL: Import content into Optio structure while fully preserving the educator's voice.
"""

TRANSFORMATION_MODERATE = """
TRANSFORMATION LEVEL: MODERATE (Gentle Enhancement)

RULES:
1. SUGGEST Optio-aligned alternatives where natural:
   - Offer process-focused framing alongside original content
   - Add optional reflection prompts (clearly marked as optional)
   - Include "big idea" hooks that connect to student relevance

2. ENHANCE with Optio elements:
   - Add flexibility suggestions (e.g., "You might show this through writing, video, or visual")
   - Frame learning as present-tense growth where it fits naturally
   - Include curiosity prompts where appropriate

3. PRESERVE the educator's core choices:
   - Keep their original wording intact
   - Maintain their requirements and structure
   - Don't remove or prohibit any language they used

4. BALANCE original content with Optio philosophy:
   - Original voice + light Optio enhancement
   - Additions should feel natural, not forced

GOAL: Enhance content with Optio philosophy while respecting the educator's voice.
"""

TRANSFORMATION_FULL = """
TRANSFORMATION LEVEL: FULL (Optio Voice Rewrite)

RULES:
1. REWRITE in Optio voice:
   - Warm, encouraging, discovery-focused
   - Present-tense celebration of learning
   - "You're exploring..." style framing

2. TRANSFORM tasks for flexibility:
   - Offer choice in evidence types (written, video, visual, hands-on)
   - Frame as opportunities for discovery
   - Add reflection components
   - Soften rigid deadlines to targets

3. ADD Optio elements throughout:
   - Big idea (one sentence hook for why this matters NOW)
   - Curiosity prompts ("What if...", "I wonder...")
   - Connection to student interests and daily life
   - Celebration of process and learning from mistakes

4. REFRAME assessments as growth opportunities:
   - Tests → Self-assessment or check-ins
   - Quizzes → Reflection opportunities
   - Focus on growth, not grades

5. MAINTAIN educational integrity:
   - Keep all learning objectives
   - Preserve technical accuracy
   - Ensure content still teaches what it needs to teach

GOAL: Transform into content that fully embodies "The Process Is The Goal."
"""

# Structure options
STRUCTURE_PRESERVE = """
STRUCTURE OPTION: PRESERVE ORIGINAL

Keep the exact organizational structure from the source:
- Same modules/units in same order
- Same lessons within modules
- Same task groupings and sequences
- Only transform the CONTENT, not the ORGANIZATION
"""

STRUCTURE_RESTRUCTURE = """
STRUCTURE OPTION: RESTRUCTURE FOR JUST-IN-TIME TEACHING

Reorganize content following Optio's just-in-time teaching principle:

1. LESSON-TASK PAIRING:
   - Each lesson should directly precede related tasks
   - Students learn exactly what they need, when they need it
   - No front-loading of content before application

2. CONTENT ORDERING:
   - Context before content (why before how)
   - Simpler concepts before complex ones
   - Each lesson builds on previous application

3. LESSON STRUCTURE:
   - Hook (why this matters right now)
   - Core concept (minimum needed to succeed)
   - Quick practice or example
   - Then immediately → related task

4. REMOVE:
   - Separate "lecture" sections that aren't tied to tasks
   - Review/summary sections (build review into tasks instead)
   - Front-loaded "background" without immediate application
"""

def build_philosophy_alignment_prompt(
    transformation_level: str = 'moderate',
    preserve_structure: bool = True
) -> str:
    """
    Build the philosophy alignment prompt with specified options.

    Args:
        transformation_level: 'light', 'moderate', or 'full'
        preserve_structure: True to keep original structure, False to restructure

    Returns:
        Complete prompt string for Stage 3
    """
    # Select transformation instructions
    transformation_instructions = {
        'light': TRANSFORMATION_LIGHT,
        'moderate': TRANSFORMATION_MODERATE,
        'full': TRANSFORMATION_FULL
    }.get(transformation_level, TRANSFORMATION_MODERATE)

    # Select structure instructions
    structure_instructions = STRUCTURE_PRESERVE if preserve_structure else STRUCTURE_RESTRUCTURE

    return f"""
You are transforming educational curriculum to align with Optio's philosophy.

{transformation_instructions}

{structure_instructions}

OPTIO-ALIGNED LANGUAGE (suggestions, not requirements):
When enhancing content (moderate/full levels), these words align well with Optio philosophy:
- explore, discover, create, experiment, dive into
- notice, observe, play with, try, wonder about
- becoming, developing, growing, learning
- curious, excited, proud, satisfied
- journey, adventure, process, path

These are suggestions for enhancement, not replacements that must be made.
Content creators have full freedom in their word choices.

PILLAR ASSIGNMENT:
Assign each task to ONE primary pillar based on content:
- stem: Math, science, technology, programming, logic, engineering
- wellness: Health, mindfulness, personal growth, life skills, fitness
- communication: Writing, reading, speaking, literature, languages
- civics: History, geography, cultures, communities, government
- art: Visual arts, music, creative writing, design, performance

TRANSFORMATION NOTES:
For each significant change, add a note explaining what was changed and why.
This helps the human reviewer understand the AI's decisions.

RETURN FORMAT:
{{
  "course": {{
    "title": "...",
    "description": "...",
    "big_idea": "..." // One sentence hook for why this matters NOW
  }},
  "modules": [...], // Same structure as input, with transformed content
  "lessons": [...],
  "tasks": [
    {{
      "id": "...",
      "title": "...",
      "description": "...",
      "pillar": "stem|wellness|communication|civics|art",
      "original_title": "...", // For comparison
      "original_description": "..." // For comparison
    }}
  ],
  "transformation_notes": [
    {{
      "element": "task_1",
      "change": "Replaced 'prove your understanding' with 'share what you discovered'",
      "reason": "Shifted from external validation to internal reflection"
    }}
  ]
}}
"""

# For backwards compatibility with existing import
PHILOSOPHY_ALIGNMENT_PROMPT = build_philosophy_alignment_prompt('moderate', True)


# =============================================================================
# STAGE 4: CONTENT GENERATION
# =============================================================================

STEP_GENERATION_PROMPT = """
You are generating final course content in Optio's step-based lesson format.

IMPORTANT: Only generate course metadata and lessons. Do NOT generate tasks.
Tasks are created separately by educators in the CourseBuilder.

STEP FORMAT (Version 2):
Each lesson contains steps - focused content blocks delivered just-in-time.

STEP TYPES:
1. "text" - Written content (2-5 paragraphs)
   - Use <p>, <ul>, <li>, <strong>, <em> HTML tags
   - Clear, conversational tone
   - One main concept per step

2. "video" - Video placeholder
   - Include suggested search terms for finding relevant videos
   - Leave video_url empty for educator to fill
   - Keep description focused on what to look for in the video

3. "file" - Resource/attachment placeholder
   - Describe what resources would be helpful
   - Leave files array empty for educator to add
   - Suggest types of resources (templates, examples, tools)

STEP DESIGN GUIDELINES:
- Maximum 8-12 steps per lesson
- Each step: ONE main idea (don't overload)
- Text steps: 100-300 words each
- Place video/file suggestions at strategic moments
- End lessons with a "What's Next" or transition step

RETURN FORMAT:
{
  "quest": {
    "title": "...",
    "description": "...",
    "big_idea": "...",
    "pillar_primary": "stem|wellness|communication|civics|art"
  },
  "lessons": [
    {
      "title": "...",
      "description": "...",
      "order": 0,
      "steps": [
        {
          "id": "step_abc123",
          "type": "text",
          "title": "Why This Matters",
          "content": "<p>HTML content here...</p>",
          "order": 0
        },
        {
          "id": "step_def456",
          "type": "video",
          "title": "Watch: Key Concept",
          "content": "<p>Look for how the presenter explains...</p>",
          "video_url": "",
          "order": 1
        }
      ]
    }
  ]
}

Generate IDs using format: step_[random 6 chars]
Ensure all content aligns with Optio philosophy - celebrate process, not outcomes.
"""


# =============================================================================
# UTILITY: Get prompt with options
# =============================================================================

def get_alignment_prompt(
    transformation_level: str = 'moderate',
    preserve_structure: bool = True
) -> str:
    """
    Get the philosophy alignment prompt with specified options.

    This is the main entry point for Stage 3 of the pipeline.

    Args:
        transformation_level: How aggressively to transform content
            - 'light': Minimal changes, fix forbidden words only
            - 'moderate': Balanced reframe with Optio elements (default)
            - 'full': Complete rewrite in Optio voice
        preserve_structure: Whether to keep original structure
            - True: Keep original modules/lessons/order (default)
            - False: Restructure for just-in-time teaching

    Returns:
        Complete prompt string ready for AI
    """
    return build_philosophy_alignment_prompt(transformation_level, preserve_structure)
