"""
Tutorial Task Templates

Defines the 12 tasks for the "Explore the Optio Platform" tutorial quest.
These templates include verification logic that will be applied when users start the quest.
"""

TUTORIAL_TASKS = [
    # PHASE 1: Profile Setup (Easy)
    {
        "title": "Upload a profile picture",
        "description": "Add a profile picture to personalize your account. Click on your profile picture placeholder to upload an image. This task will be auto-verified when you upload your picture!",
        "pillar": "communication",
        "xp_value": 10,
        "order_index": 1,
        "is_required": True,
        "auto_complete": True,
        "verification_query": {"type": "profile_picture_uploaded"},
        "diploma_subjects": {}
    },
    {
        "title": "Write your bio",
        "description": "Tell us about yourself! Write a bio of at least 20 characters. Share your interests, goals, or what excites you about learning. This task will be auto-verified when you add your bio!",
        "pillar": "communication",
        "xp_value": 15,
        "order_index": 2,
        "is_required": True,
        "auto_complete": True,
        "verification_query": {"type": "bio_written", "min_length": 20},
        "diploma_subjects": {}
    },
    {
        "title": "Make your portfolio public",
        "description": "Share your learning journey with the world! Making your portfolio public allows you to showcase your achievements on your resume. This task will be auto-verified when you change your portfolio settings!",
        "pillar": "communication",
        "xp_value": 10,
        "order_index": 3,
        "is_required": True,
        "auto_complete": True,
        "verification_query": {"type": "portfolio_public"},
        "diploma_subjects": {}
    },

    # PHASE 2: Core Learning (Medium)
    {
        "title": "Pick up your first quest",
        "description": "Browse the quest hub and start a learning adventure! Choose any quest that interests you to get started. This task will be auto-verified when you start a quest!",
        "pillar": "stem",
        "xp_value": 20,
        "order_index": 4,
        "is_required": True,
        "auto_complete": True,
        "verification_query": {"type": "quest_started", "min_count": 2},
        "diploma_subjects": {}
    },
    {
        "title": "Customize a task",
        "description": "Make a quest your own! Use the task personalization wizard to add or modify a task based on your interests. This task will be auto-verified when you customize a task!",
        "pillar": "art",
        "xp_value": 25,
        "order_index": 5,
        "is_required": True,
        "auto_complete": True,
        "verification_query": {"type": "task_customized"},
        "diploma_subjects": {}
    },
    {
        "title": "Complete your first task",
        "description": "Submit evidence for any task and earn your first XP! Evidence can be text, links, images, or documents. This task will be auto-verified when you complete a task!",
        "pillar": "stem",
        "xp_value": 30,
        "order_index": 6,
        "is_required": True,
        "auto_complete": True,
        "verification_query": {"type": "task_completed", "min_count": 1},
        "diploma_subjects": {}
    },
    {
        "title": "Ask the AI tutor",
        "description": "Get help with your learning! Start a conversation with the AI tutor and ask a question about anything you're working on. This task will be auto-verified when you send a message!",
        "pillar": "communication",
        "xp_value": 20,
        "order_index": 7,
        "is_required": True,
        "auto_complete": True,
        "verification_query": {"type": "tutor_used"},
        "diploma_subjects": {}
    },

    # PHASE 3: Social Features (Medium)
    {
        "title": "Make a connection",
        "description": "Build your learning community! Send a friend request to connect with other students and see what they're learning. This task will be auto-verified when you send a connection request! (Optional)",
        "pillar": "communication",
        "xp_value": 15,
        "order_index": 8,
        "is_required": False,
        "auto_complete": True,
        "verification_query": {"type": "connection_made"},
        "diploma_subjects": {}
    },
    {
        "title": "Connect with a parent",
        "description": "Ask your admin to link your parent's account so they can support your learning journey. This task will be auto-verified when a parent is connected! (Optional)",
        "pillar": "communication",
        "xp_value": 10,
        "order_index": 9,
        "is_required": False,
        "auto_complete": True,
        "verification_query": {"type": "parent_connected"},
        "diploma_subjects": {}
    },
    {
        "title": "Add an observer",
        "description": "Ask your admin to add extended family members who can follow your progress and celebrate your achievements. This task will be auto-verified when an observer is added! (Optional)",
        "pillar": "communication",
        "xp_value": 10,
        "order_index": 10,
        "is_required": False,
        "auto_complete": True,
        "verification_query": {"type": "observer_added"},
        "diploma_subjects": {}
    },

    # PHASE 4: Achievement (Hard)
    {
        "title": "Start a badge",
        "description": "Choose a badge to pursue! Badges represent mastery in specific areas and show your unique strengths. This task will be auto-verified when you select a badge!",
        "pillar": "civics",
        "xp_value": 25,
        "order_index": 11,
        "is_required": True,
        "auto_complete": True,
        "verification_query": {"type": "badge_started"},
        "diploma_subjects": {}
    },
    {
        "title": "Complete your first quest",
        "description": "Finish all tasks in any quest to complete it! This is a major milestone in your learning journey. This task will be auto-verified when you complete a quest!",
        "pillar": "stem",
        "xp_value": 50,
        "order_index": 12,
        "is_required": True,
        "auto_complete": True,
        "verification_query": {"type": "quest_completed"},
        "diploma_subjects": {}
    }
]

def get_tutorial_tasks():
    """Get the list of tutorial task templates"""
    return TUTORIAL_TASKS

def get_total_tutorial_xp():
    """Calculate total XP available in tutorial"""
    return sum(task["xp_value"] for task in TUTORIAL_TASKS)
