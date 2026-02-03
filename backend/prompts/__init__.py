"""
Prompt Management Module
========================

Centralized prompt components and builders for all AI services.
This module eliminates prompt duplication across services and enables easy A/B testing.

Usage:
    from prompts.components import CORE_PHILOSOPHY, PILLAR_DEFINITIONS, VALID_PILLARS
    from prompts.components import build_context, JSON_OUTPUT_INSTRUCTIONS
    from prompts.registry import PromptRegistry

Structure:
    - components.py: Shared building blocks (philosophy, pillars, JSON format)
    - registry.py: Prompt version management and retrieval
    - tutor.py: AI tutor prompt builders
    - quest.py: Quest generation prompt builders
    - task.py: Task generation prompt builders
    - badge.py: Badge generation prompt builders
"""

from prompts.components import (
    CORE_PHILOSOPHY,
    PILLAR_DEFINITIONS,
    PILLAR_DEFINITIONS_DETAILED,
    VALID_PILLARS,
    PILLAR_DISPLAY_NAMES,
    LANGUAGE_GUIDELINES,
    JSON_OUTPUT_INSTRUCTIONS,
    FORBIDDEN_WORDS,
    ENCOURAGED_WORDS,
    build_context,
    build_quest_context,
    build_lesson_context,
)

__all__ = [
    'CORE_PHILOSOPHY',
    'PILLAR_DEFINITIONS',
    'PILLAR_DEFINITIONS_DETAILED',
    'VALID_PILLARS',
    'PILLAR_DISPLAY_NAMES',
    'LANGUAGE_GUIDELINES',
    'JSON_OUTPUT_INSTRUCTIONS',
    'FORBIDDEN_WORDS',
    'ENCOURAGED_WORDS',
    'build_context',
    'build_quest_context',
    'build_lesson_context',
]
