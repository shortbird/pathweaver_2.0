"""
OpenAPI Model Definitions for Optio Platform API
Shared schemas for request/response documentation
"""

# Common response models
SUCCESS_RESPONSE = {
    "type": "object",
    "properties": {
        "message": {"type": "string", "example": "Operation completed successfully"}
    }
}

ERROR_RESPONSE = {
    "type": "object",
    "properties": {
        "error": {"type": "string", "example": "Error message describing what went wrong"}
    }
}

# Authentication models
LOGIN_REQUEST = {
    "type": "object",
    "required": ["email", "password"],
    "properties": {
        "email": {"type": "string", "format": "email", "example": "student@example.com"},
        "password": {"type": "string", "format": "password", "example": "SecurePassword123!"}
    }
}

REGISTRATION_REQUEST = {
    "type": "object",
    "required": ["email", "password", "display_name", "role"],
    "properties": {
        "email": {"type": "string", "format": "email", "example": "newuser@example.com"},
        "password": {"type": "string", "format": "password", "example": "SecurePassword123!"},
        "display_name": {"type": "string", "example": "John Doe"},
        "role": {"type": "string", "enum": ["student", "parent", "advisor"], "example": "student"},
        "organization_id": {"type": "string", "format": "uuid", "nullable": True}
    }
}

AUTH_RESPONSE = {
    "type": "object",
    "properties": {
        "message": {"type": "string", "example": "Login successful"},
        "user": {"$ref": "#/definitions/User"}
    }
}

# User models
USER_MODEL = {
    "type": "object",
    "properties": {
        "id": {"type": "string", "format": "uuid", "example": "550e8400-e29b-41d4-a716-446655440000"},
        "email": {"type": "string", "format": "email", "example": "student@example.com"},
        "display_name": {"type": "string", "example": "John Doe"},
        "role": {"type": "string", "enum": ["student", "parent", "advisor", "admin", "superadmin", "observer"], "example": "student"},
        "avatar_url": {"type": "string", "nullable": True, "example": "https://storage.example.com/avatars/user123.jpg"},
        "total_xp": {"type": "integer", "example": 1250},
        "organization_id": {"type": "string", "format": "uuid", "nullable": True},
        "is_dependent": {"type": "boolean", "example": False},
        "managed_by_parent_id": {"type": "string", "format": "uuid", "nullable": True},
        "promotion_eligible_at": {"type": "string", "format": "date", "nullable": True},
        "created_at": {"type": "string", "format": "date-time"},
        "bio": {"type": "string", "nullable": True}
    }
}

USER_PROFILE_UPDATE = {
    "type": "object",
    "properties": {
        "display_name": {"type": "string", "example": "John Doe"},
        "bio": {"type": "string", "example": "Aspiring scientist and artist"},
        "avatar_url": {"type": "string", "nullable": True}
    }
}

# Quest models
QUEST_MODEL = {
    "type": "object",
    "properties": {
        "id": {"type": "string", "format": "uuid"},
        "title": {"type": "string", "example": "Introduction to Python Programming"},
        "description": {"type": "string", "example": "Learn Python basics through hands-on projects"},
        "quest_type": {"type": "string", "enum": ["optio", "course"], "example": "optio"},
        "xp_value": {"type": "integer", "example": 500},
        "estimated_hours": {"type": "integer", "example": 20},
        "difficulty": {"type": "string", "enum": ["beginner", "intermediate", "advanced"], "example": "beginner"},
        "pillar_primary": {"type": "string", "enum": ["stem", "wellness", "communication", "civics", "art"], "example": "stem"},
        "pillar_secondary": {"type": "string", "nullable": True},
        "image_url": {"type": "string", "nullable": True},
        "is_active": {"type": "boolean", "example": True},
        "organization_id": {"type": "string", "format": "uuid", "nullable": True},
        "lms_course_id": {"type": "string", "nullable": True},
        "created_by": {"type": "string", "format": "uuid"},
        "created_at": {"type": "string", "format": "date-time"},
        "enrollment_count": {"type": "integer", "example": 45},
        "completion_count": {"type": "integer", "example": 32}
    }
}

QUEST_LIST_RESPONSE = {
    "type": "object",
    "properties": {
        "quests": {
            "type": "array",
            "items": {"$ref": "#/definitions/Quest"}
        },
        "total": {"type": "integer", "example": 150},
        "page": {"type": "integer", "example": 1},
        "page_size": {"type": "integer", "example": 20}
    }
}

QUEST_CREATE_REQUEST = {
    "type": "object",
    "required": ["title", "description", "pillar_primary"],
    "properties": {
        "title": {"type": "string", "example": "Introduction to Python"},
        "description": {"type": "string", "example": "Learn Python basics"},
        "quest_type": {"type": "string", "enum": ["optio", "course"], "default": "optio"},
        "xp_value": {"type": "integer", "example": 500},
        "estimated_hours": {"type": "integer", "example": 20},
        "difficulty": {"type": "string", "enum": ["beginner", "intermediate", "advanced"]},
        "pillar_primary": {"type": "string", "enum": ["stem", "wellness", "communication", "civics", "art"]},
        "pillar_secondary": {"type": "string", "nullable": True},
        "image_url": {"type": "string", "nullable": True}
    }
}

# Task models
TASK_MODEL = {
    "type": "object",
    "properties": {
        "id": {"type": "string", "format": "uuid"},
        "user_id": {"type": "string", "format": "uuid"},
        "quest_id": {"type": "string", "format": "uuid"},
        "title": {"type": "string", "example": "Write a Python function"},
        "description": {"type": "string", "example": "Create a function that calculates fibonacci numbers"},
        "pillar": {"type": "string", "enum": ["stem", "wellness", "communication", "civics", "art"]},
        "xp_value": {"type": "integer", "example": 50},
        "approval_status": {"type": "string", "enum": ["pending", "approved", "rejected", "needs_revision"], "example": "pending"},
        "evidence_text": {"type": "string", "nullable": True},
        "evidence_url": {"type": "string", "nullable": True},
        "ai_generated": {"type": "boolean", "example": False},
        "created_at": {"type": "string", "format": "date-time"},
        "completed_at": {"type": "string", "format": "date-time", "nullable": True}
    }
}

TASK_COMPLETION_REQUEST = {
    "type": "object",
    "properties": {
        "evidence_text": {"type": "string", "example": "I completed this task by..."},
        "evidence_file": {"type": "string", "format": "binary", "description": "Evidence file upload (multipart/form-data)"},
        "acting_as_dependent_id": {"type": "string", "format": "uuid", "nullable": True, "description": "Optional: Complete task on behalf of dependent"}
    }
}

# Badge models
BADGE_MODEL = {
    "type": "object",
    "properties": {
        "id": {"type": "string", "format": "uuid"},
        "name": {"type": "string", "example": "STEM Explorer"},
        "description": {"type": "string", "example": "Complete 5 STEM quests and earn 500 XP"},
        "pillar_primary": {"type": "string", "enum": ["stem", "wellness", "communication", "civics", "art"]},
        "min_quests": {"type": "integer", "example": 5},
        "min_xp": {"type": "integer", "example": 500},
        "image_url": {"type": "string", "nullable": True},
        "hex_color": {"type": "string", "example": "#9333EA"},
        "rarity": {"type": "string", "enum": ["common", "rare", "epic", "legendary"], "example": "common"},
        "is_active": {"type": "boolean", "example": True}
    }
}

# Evidence models
EVIDENCE_MODEL = {
    "type": "object",
    "properties": {
        "id": {"type": "string", "format": "uuid"},
        "user_id": {"type": "string", "format": "uuid"},
        "task_id": {"type": "string", "format": "uuid"},
        "file_name": {"type": "string", "example": "project-screenshot.png"},
        "file_url": {"type": "string", "example": "https://storage.example.com/evidence/file123.png"},
        "file_size": {"type": "integer", "example": 524288},
        "mime_type": {"type": "string", "example": "image/png"},
        "uploaded_by": {"type": "string", "format": "uuid"},
        "upload_type": {"type": "string", "enum": ["student", "parent", "advisor"], "example": "student"},
        "created_at": {"type": "string", "format": "date-time"}
    }
}

# Organization models
ORGANIZATION_MODEL = {
    "type": "object",
    "properties": {
        "id": {"type": "string", "format": "uuid"},
        "name": {"type": "string", "example": "Riverside High School"},
        "slug": {"type": "string", "example": "riverside-high"},
        "quest_visibility_policy": {"type": "string", "enum": ["all", "curated", "private"], "example": "curated"},
        "branding_config": {"type": "object", "nullable": True},
        "is_active": {"type": "boolean", "example": True},
        "created_at": {"type": "string", "format": "date-time"},
        "user_count": {"type": "integer", "example": 250}
    }
}

# Dependent models
DEPENDENT_MODEL = {
    "type": "object",
    "properties": {
        "id": {"type": "string", "format": "uuid"},
        "display_name": {"type": "string", "example": "Emma Smith"},
        "date_of_birth": {"type": "string", "format": "date", "example": "2015-03-15"},
        "avatar_url": {"type": "string", "nullable": True},
        "bio": {"type": "string", "nullable": True},
        "total_xp": {"type": "integer", "example": 350},
        "is_dependent": {"type": "boolean", "example": True},
        "managed_by_parent_id": {"type": "string", "format": "uuid"},
        "promotion_eligible_at": {"type": "string", "format": "date", "example": "2028-03-15"},
        "created_at": {"type": "string", "format": "date-time"}
    }
}

DEPENDENT_CREATE_REQUEST = {
    "type": "object",
    "required": ["display_name", "date_of_birth"],
    "properties": {
        "display_name": {"type": "string", "example": "Emma Smith"},
        "date_of_birth": {"type": "string", "format": "date", "example": "2015-03-15"}
    }
}

# Observer models
OBSERVER_INVITATION_REQUEST = {
    "type": "object",
    "required": ["email", "observer_name"],
    "properties": {
        "email": {"type": "string", "format": "email", "example": "grandparent@example.com"},
        "observer_name": {"type": "string", "example": "Grandma Smith"},
        "personal_message": {"type": "string", "nullable": True, "example": "I'd love for you to follow my learning journey!"}
    }
}

# Portfolio models
PORTFOLIO_RESPONSE = {
    "type": "object",
    "properties": {
        "user": {"$ref": "#/definitions/User"},
        "total_xp": {"type": "integer", "example": 2500},
        "completed_quests": {"type": "array", "items": {"$ref": "#/definitions/Quest"}},
        "earned_badges": {"type": "array", "items": {"$ref": "#/definitions/Badge"}},
        "xp_by_pillar": {
            "type": "object",
            "properties": {
                "stem": {"type": "integer", "example": 800},
                "wellness": {"type": "integer", "example": 600},
                "communication": {"type": "integer", "example": 500},
                "civics": {"type": "integer", "example": 400},
                "art": {"type": "integer", "example": 200}
            }
        }
    }
}

# Analytics models
ANALYTICS_SUMMARY = {
    "type": "object",
    "properties": {
        "total_users": {"type": "integer", "example": 1250},
        "total_quests": {"type": "integer", "example": 450},
        "total_tasks_completed": {"type": "integer", "example": 15000},
        "total_xp_awarded": {"type": "integer", "example": 750000},
        "active_users_30d": {"type": "integer", "example": 800},
        "quest_completion_rate": {"type": "number", "example": 0.68}
    }
}

# Pagination
PAGINATION_PARAMS = {
    "page": {"type": "integer", "default": 1, "description": "Page number"},
    "page_size": {"type": "integer", "default": 20, "description": "Items per page (max 100)"}
}

# Common parameters
COMMON_PARAMETERS = {
    "user_id": {
        "name": "user_id",
        "in": "path",
        "type": "string",
        "required": True,
        "description": "User UUID"
    },
    "quest_id": {
        "name": "quest_id",
        "in": "path",
        "type": "string",
        "required": True,
        "description": "Quest UUID"
    },
    "task_id": {
        "name": "task_id",
        "in": "path",
        "type": "string",
        "required": True,
        "description": "Task UUID"
    },
    "badge_id": {
        "name": "badge_id",
        "in": "path",
        "type": "string",
        "required": True,
        "description": "Badge UUID"
    },
    "organization_id": {
        "name": "organization_id",
        "in": "path",
        "type": "string",
        "required": True,
        "description": "Organization UUID"
    },
    "csrf_token": {
        "name": "X-CSRF-Token",
        "in": "header",
        "type": "string",
        "required": True,
        "description": "CSRF token from /csrf-token endpoint"
    }
}

# Export all definitions for flasgger
DEFINITIONS = {
    "Success": SUCCESS_RESPONSE,
    "Error": ERROR_RESPONSE,
    "LoginRequest": LOGIN_REQUEST,
    "RegistrationRequest": REGISTRATION_REQUEST,
    "AuthResponse": AUTH_RESPONSE,
    "User": USER_MODEL,
    "UserProfileUpdate": USER_PROFILE_UPDATE,
    "Quest": QUEST_MODEL,
    "QuestListResponse": QUEST_LIST_RESPONSE,
    "QuestCreateRequest": QUEST_CREATE_REQUEST,
    "Task": TASK_MODEL,
    "TaskCompletionRequest": TASK_COMPLETION_REQUEST,
    "Badge": BADGE_MODEL,
    "Evidence": EVIDENCE_MODEL,
    "Organization": ORGANIZATION_MODEL,
    "Dependent": DEPENDENT_MODEL,
    "DependentCreateRequest": DEPENDENT_CREATE_REQUEST,
    "ObserverInvitationRequest": OBSERVER_INVITATION_REQUEST,
    "Portfolio": PORTFOLIO_RESPONSE,
    "AnalyticsSummary": ANALYTICS_SUMMARY
}
