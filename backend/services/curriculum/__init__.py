"""
Curriculum Services Module

Orchestrates the AI curriculum upload pipeline.

This module has been decomposed from a single 1945 line file into:
- progress.py: Progress tracking and checkpoints
- chunking.py: Smart content chunking for parallel processing
- parsing.py: Source parsing and IMSCC conversion
- content.py: Content validation and processing

The main CurriculumUploadService class remains in curriculum_upload_service.py
at the parent level for backward compatibility, but uses these helper modules.
"""

from .progress import ProgressTracker
from .chunking import chunk_content, merge_structure_results, process_chunks_parallel
from .parsing import filter_imscc_content, imscc_to_text, imscc_to_sections, build_content_summary
from .content import (
    validate_philosophy_alignment,
    clean_course_description,
    clean_quest_description,
    process_course,
    process_projects,
    process_lessons,
    build_preview
)

__all__ = [
    'ProgressTracker',
    'chunk_content',
    'merge_structure_results',
    'process_chunks_parallel',
    'filter_imscc_content',
    'imscc_to_text',
    'imscc_to_sections',
    'build_content_summary',
    'validate_philosophy_alignment',
    'clean_course_description',
    'clean_quest_description',
    'process_course',
    'process_projects',
    'process_lessons',
    'build_preview',
]
