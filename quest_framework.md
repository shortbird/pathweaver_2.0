The Quest Creation Framework
Core Philosophy: The Process is the Goal
Every quest designed for this platform must be built on a single, core tenet: the process and goal of education are one and the same. A quest is not a task to be checked off to impress a future employer or college; it is an experience to be undertaken for its own sake.

Our goal is to move beyond the "prove you did it" model of traditional education. Instead, we aim to inspire students to do, create, and reflect. The structure outlined below is designed to spark intrinsic motivation and celebrate the student's unique journey through a challenge.

All quests must follow this framework. 

The Foundation: The Five Diploma Pillars
Every quest must be grounded in one of the five Diploma Pillars. The quest's activities and outcomes should be a direct reflection of the competencies within its primary pillar.

Creativity: The practice of generating new ideas and bringing them to life.

Critical Thinking: The practice of analyzing information, thinking logically, and making reasoned judgments.

Practical Skills: The practice of hands-on, real-world abilities for life and work.

Communication: The practice of sharing and receiving information effectively.

Cultural Literacy: The practice of understanding the context of the world—its history, cultures, and social fabric.

The Anatomy of a Quest
Each quest is composed of six key sections, presented to the student as a narrative journey.

1. The Big Picture (The "Why") 🎯
This section's purpose is to spark curiosity and provide a clear, inspiring vision.

title (Text): A compelling, action-oriented title.

Good: "Launch a Podcast Mini-Series"

Bad: "Learn About Podcasting"

big_idea (Text): A single, powerful sentence explaining the quest's purpose.

Example: "Share your voice and ideas with the world by creating and publishing a three-episode podcast on a topic you love."

what_youll_create (Array of Text): 2-4 tangible, exciting outcomes.

Example: ["A three-episode podcast series, live online", "Custom cover art and a show description"]

primary_pillar (Enum): The main Diploma Pillar this quest develops.

Example: communication

2. Your Toolkit (The "How") 🛠️
This section provides practical, empowering details for the student's journey.

estimated_time (Text): A realistic time estimate that gives a sense of scope.

Example: "10-15 hours over 2-3 weeks"

core_competencies (Array of Text): The specific skills the student will practice. These must align with the primary_pillar.

Example: ["reading_writing_speaking", "digital_media_production", "learning_and_reflection"]

helpful_resources (Array of Objects): A simple, curated list of 1-3 high-quality starting points. The goal is to reduce friction, not provide an exhaustive list.

Example: [{"type": "Tool", "name": "Audacity (Free)", "url": "..."}, {"type": "Inspiration", "name": "The Daily Podcast", "url": "..."}]

3. The Journey (The "What") 🗺️
This is the core of the quest, presented as a flexible roadmap.

your_mission (Array of Text): A suggested, step-by-step guide focused on the creative process.

Example: ["1. Plan Your Series: Choose a topic and outline three episodes.", "2. Record & Produce: Record your audio and learn basic editing.", "3. Design & Publish: Create cover art and upload your episodes."]

showcase_your_journey (Text): A prompt that reframes "evidence" as a celebration of the work. It should ask for both the product and a reflection on the process.

Example: "Share a link to your live podcast series. In your submission, include a key quote from your interview and a short reflection on the most surprising thing you learned."

4. The Learning Log (The "Process") 📓
This feature explicitly values the process itself, not just the outcome.

log_bonus (Object, Optional): A small, automated XP bonus to incentivize documenting the "messy middle." The prompt should encourage reflection.

Example: {"prompt": "Add at least 3 log entries to document your progress and earn a bonus!", "pillar": "communication", "xp_amount": 25}

5. Go Further (The "Next Level") ✨
This section provides opportunities for deeper engagement and real-world connection.

collaboration_spark (Text, Creator+ Feature): A direct call to action for teamwork, which awards a 2x XP bonus.

Example: "Partner with a friend! One of you can handle the research, while the other can focus on conducting interviews. You'll both earn the 2x XP bonus."

real_world_bonus (Array of Objects, Optional): Specific challenges that incentivize interaction outside the platform.

Example: [{"prompt": "Present your findings to a local community group or your family.", "pillar": "communication", "xp_amount": 50}]

6. The Fine Print (Optional Details) 📌
These fields should only be used when necessary to keep quests clean and focused.

heads_up (Text): For necessary warnings or important context.

Example: "This quest involves using power tools, so make sure you have adult guidance."

location (Text): For quests tied to a specific place.

Example: "This quest is designed to be completed at the Natural History Museum of Utah."