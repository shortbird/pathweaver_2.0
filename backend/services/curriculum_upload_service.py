"""
Curriculum Upload Service
=========================

Orchestrates the AI curriculum upload pipeline:
1. Parse source (PDF, DOCX, text, IMSCC)
2. Detect structure (AI identifies modules, lessons)
3. Align philosophy (Transform to Optio language)
4. Generate content (Create step-based lessons)

Processes in background and auto-creates draft course.
Notifies user when complete so they can edit in CourseBuilder.

Features:
- Checkpoint saves after each stage (resume on failure)
- Progress streaming (real-time status updates)
- Smart content chunking (parallel processing for large courses)
- Review gate (pause after Stage 2 for human verification)

Architecture:
- This file is the orchestrator (~600 lines)
- AI methods delegated to: services/curriculum/ai.py
- Review workflow delegated to: services/curriculum/review.py
- Progress tracking: services/curriculum/progress.py
- Content processing: services/curriculum/content.py
- Chunking: services/curriculum/chunking.py
- Parsing: services/curriculum/parsing.py
"""

import gc
import json
from datetime import datetime
from typing import Dict, List, Optional, Any
from concurrent.futures import ThreadPoolExecutor, as_completed

from services.document_parser_service import DocumentParserService
from services.imscc_parser_service import IMSCCParserService
from database import get_supabase_admin_client

# Import from curriculum submodule
from services.curriculum import (
    CurriculumAIService,
    CurriculumReviewService,
    ProgressTracker,
    filter_imscc_content,
    imscc_to_text,
    imscc_to_sections,
)

from utils.logger import get_logger

logger = get_logger(__name__)

# Stage name mapping for progress display
STAGE_NAMES = {
    1: 'Parsing document',
    2: 'Detecting structure',
    3: 'Aligning philosophy',
    4: 'Generating content'
}


class CurriculumUploadError(Exception):
    """Base exception for curriculum upload errors."""
    pass


class CurriculumUploadService:
    """
    Orchestrates the multi-stage AI curriculum upload pipeline.

    Pipeline Stages:
    1. parse_source() - Extract raw content from IMSCC/PDF/DOCX/text
    2. detect_structure() - AI identifies curriculum structure
    3. align_philosophy() - Transform language to Optio philosophy
    4. generate_course_content() - Create step-based lessons (no tasks)

    Output is auto-saved as draft course for editing in CourseBuilder.

    Uses composition to delegate to specialized services:
    - CurriculumAIService: AI transformation methods
    - CurriculumReviewService: Human review workflow
    - ProgressTracker: Checkpoint and progress management
    """

    def __init__(self):
        """Initialize with composed services."""
        # Composed services
        self.ai_service = CurriculumAIService()
        self.review_service = CurriculumReviewService()
        self.progress_tracker = ProgressTracker()

        # Parsers
        self.document_parser = DocumentParserService()
        self.imscc_parser = IMSCCParserService()

        # Lazy-loaded admin client
        self._admin_client = None

        logger.info("CurriculumUploadService initialized with composed services")

    @property
    def admin_client(self):
        """Lazy-loaded admin client for database operations."""
        if self._admin_client is None:
            self._admin_client = get_supabase_admin_client()
        return self._admin_client

    # =========================================================================
    # Checkpoint & Progress Methods (delegate to ProgressTracker)
    # =========================================================================

    def _sanitize_for_db(self, data):
        """
        Remove null characters and other problematic content before DB save.
        PostgreSQL cannot store \\u0000 in text/jsonb fields.
        """
        if data is None:
            return None
        json_str = json.dumps(data, ensure_ascii=False)
        json_str = json_str.replace('\\u0000', '').replace('\x00', '')
        return json.loads(json_str)

    def _save_checkpoint(self, upload_id: str, stage: int, output: dict) -> None:
        """Save stage output and mark checkpoint for resume capability."""
        column_map = {
            1: 'raw_content',
            2: 'structured_content',
            3: 'aligned_content',
            4: 'generated_content'
        }
        timestamp_col = f'stage_{stage}_completed_at'

        try:
            sanitized_output = self._sanitize_for_db(output)
            self.admin_client.table('curriculum_uploads').update({
                column_map[stage]: sanitized_output,
                timestamp_col: datetime.utcnow().isoformat(),
                'current_stage': stage,
                'can_resume': True,
                'resume_from_stage': stage + 1 if stage < 4 else None
            }).eq('id', upload_id).execute()
            logger.info(f"Checkpoint saved for upload {upload_id}, stage {stage}")
        except Exception as e:
            logger.error(f"Failed to save checkpoint: {str(e)}")

    def _update_progress(
        self,
        upload_id: str,
        stage: int,
        percent: int,
        item: str = None
    ) -> None:
        """Update progress information for real-time status polling."""
        overall_progress = (stage - 1) * 25 + (percent * 25 // 100) if percent else (stage - 1) * 25

        try:
            update_data = {
                'progress_percent': overall_progress,
                'current_stage_name': STAGE_NAMES.get(stage, f'Stage {stage}'),
                'current_item': item
            }
            self.admin_client.table('curriculum_uploads').update(
                update_data
            ).eq('id', upload_id).execute()
        except Exception as e:
            logger.warning(f"Failed to update progress: {str(e)}")

    def _get_upload(self, upload_id: str) -> Optional[Dict]:
        """Fetch upload record from database."""
        try:
            result = self.admin_client.table('curriculum_uploads').select(
                '*'
            ).eq('id', upload_id).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"Failed to get upload: {str(e)}")
            return None

    def _mark_error(self, upload_id: str, error_message: str) -> None:
        """Mark upload as failed with error message."""
        try:
            self.admin_client.table('curriculum_uploads').update({
                'status': 'error',
                'error_message': error_message,
                'can_resume': True
            }).eq('id', upload_id).execute()
        except Exception as e:
            logger.error(f"Failed to mark error: {str(e)}")

    def resume_upload(
        self,
        upload_id: str,
        options: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Resume a failed upload from the last successful stage."""
        upload = self._get_upload(upload_id)

        if not upload:
            return {'success': False, 'error': 'Upload not found'}

        if not upload.get('can_resume'):
            return {'success': False, 'error': 'Upload cannot be resumed'}

        resume_from = upload.get('resume_from_stage', 1)
        logger.info(f"Resuming upload {upload_id} from stage {resume_from}")

        self.admin_client.table('curriculum_uploads').update({
            'status': 'processing',
            'error_message': None
        }).eq('id', upload_id).execute()

        return self.process_upload_with_tracking(
            upload_id=upload_id,
            source_type=upload.get('source_type', 'text'),
            content=None,
            filename=upload.get('original_filename'),
            options=options or {},
            resume_from=resume_from
        )

    # =========================================================================
    # Smart Content Chunking Methods
    # =========================================================================

    def _chunk_content(self, raw_content: dict, max_chars: int = 12000) -> List[Dict]:
        """Split content into processable chunks by module boundaries."""
        sections = raw_content.get('sections', [])

        if not sections:
            return [raw_content]

        chunks = []
        current_chunk = {'sections': [], 'char_count': 0, 'raw_text': ''}

        for section in sections:
            section_content = section.get('content', '')
            section_size = len(section_content)

            if (section.get('type') == 'module' and
                    current_chunk['char_count'] > max_chars // 2 and
                    current_chunk['sections']):
                chunks.append(current_chunk)
                current_chunk = {'sections': [], 'char_count': 0, 'raw_text': ''}

            current_chunk['sections'].append(section)
            current_chunk['char_count'] += section_size
            current_chunk['raw_text'] += f"\n{section.get('title', '')}\n{section_content}"

        if current_chunk['sections']:
            chunks.append(current_chunk)

        logger.info(f"Split content into {len(chunks)} chunks")
        return chunks

    def _detect_structure_chunk(
        self,
        chunk: Dict,
        chunk_idx: int,
        total_chunks: int
    ) -> Dict:
        """Detect structure for a single content chunk."""
        chunk_parse_result = {
            'success': True,
            'raw_text': chunk.get('raw_text', ''),
            'sections': chunk.get('sections', []),
            'metadata': {'chunk_index': chunk_idx, 'total_chunks': total_chunks}
        }
        return self.ai_service.detect_structure(chunk_parse_result)

    def detect_structure_chunked(
        self,
        raw_content: dict,
        upload_id: str = None
    ) -> Dict[str, Any]:
        """Detect structure with parallel processing for large content."""
        chunks = self._chunk_content(raw_content)

        # Small content - process normally
        if len(chunks) == 1:
            if upload_id:
                self._update_progress(upload_id, 2, 0, "Analyzing content structure")
            result = self.ai_service.detect_structure(raw_content)
            if upload_id:
                self._update_progress(upload_id, 2, 100, "Structure detection complete")
            return result

        # Large content - process chunks in parallel
        logger.info(f"Processing {len(chunks)} chunks in parallel")
        results = []
        CHUNK_TIMEOUT = 150

        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = {
                executor.submit(
                    self._detect_structure_chunk, chunk, i, len(chunks)
                ): i
                for i, chunk in enumerate(chunks)
            }

            for future in as_completed(futures):
                chunk_idx = futures[future]
                try:
                    result = future.result(timeout=CHUNK_TIMEOUT)
                    results.append((chunk_idx, result))

                    if upload_id:
                        progress = (len(results) * 100) // len(chunks)
                        self._update_progress(
                            upload_id, 2, progress,
                            f"Processed chunk {len(results)} of {len(chunks)}"
                        )
                except TimeoutError:
                    logger.error(f"Chunk {chunk_idx} timed out")
                    results.append((chunk_idx, {'success': False, 'error': 'Chunk timed out'}))
                except Exception as e:
                    logger.error(f"Chunk {chunk_idx} failed: {str(e)}")
                    results.append((chunk_idx, {'success': False, 'error': str(e)}))

        results.sort(key=lambda x: x[0])
        return self._merge_structure_results(results)

    def _merge_structure_results(self, results: List[tuple]) -> Dict:
        """Combine chunked structure detection results."""
        if not results:
            return {'success': False, 'error': 'No results to merge'}

        failures = [r for _, r in results if not r.get('success')]
        if len(failures) == len(results):
            return {'success': False, 'error': 'All chunks failed to process'}

        merged = {
            'success': True,
            'course': {},
            'modules': [],
            'lessons': [],
            'tasks': [],
            'curriculum_type': 'course_outline'
        }

        module_id_offset = 0
        lesson_id_offset = 0
        task_id_offset = 0

        for chunk_idx, result in results:
            if not result.get('success'):
                continue

            if not merged['course'] and result.get('course'):
                merged['course'] = result['course']

            for module in result.get('modules', []):
                new_module = dict(module)
                old_id = new_module.get('id', f'module_{chunk_idx}')
                new_module['id'] = f'module_{module_id_offset + 1}'
                new_module['order'] = module_id_offset

                for lesson in result.get('lessons', []):
                    if lesson.get('parent_module') == old_id:
                        lesson['parent_module'] = new_module['id']

                merged['modules'].append(new_module)
                module_id_offset += 1

            for lesson in result.get('lessons', []):
                new_lesson = dict(lesson)
                new_lesson['id'] = f'lesson_{lesson_id_offset + 1}'
                merged['lessons'].append(new_lesson)
                lesson_id_offset += 1

            for task in result.get('tasks', []):
                new_task = dict(task)
                new_task['id'] = f'task_{task_id_offset + 1}'
                merged['tasks'].append(new_task)
                task_id_offset += 1

        logger.info(f"Merged {len(results)} chunks: {len(merged['modules'])} modules, "
                    f"{len(merged['lessons'])} lessons, {len(merged['tasks'])} tasks")

        return merged

    # =========================================================================
    # Review Gate Methods (delegate to CurriculumReviewService)
    # =========================================================================

    def process_upload_to_review(
        self,
        upload_id: str,
        source_type: str,
        content: bytes,
        filename: Optional[str] = None,
        options: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Process upload through Stage 2 only, then pause for human review."""
        options = options or {}
        content_types = options.get('content_types')

        try:
            # Stage 1: Parse source
            self._update_progress(upload_id, 1, 0, "Starting document parsing")
            parse_result = self.parse_source(source_type, content, filename, content_types, upload_id)

            if not parse_result.get('success'):
                self._mark_error(upload_id, parse_result.get('error', 'Parse failed'))
                return parse_result

            self._save_checkpoint(upload_id, 1, parse_result)
            self._update_progress(upload_id, 1, 100, "Document parsed")

            # Stage 2: Detect structure
            self._update_progress(upload_id, 2, 0, "Detecting curriculum structure")
            structure_result = self.detect_structure_chunked(parse_result, upload_id)

            if not structure_result.get('success'):
                self._mark_error(upload_id, structure_result.get('error', 'Structure detection failed'))
                return structure_result

            self._save_checkpoint(upload_id, 2, structure_result)

            # Delegate to review service
            return self.review_service.process_to_review(
                upload_id, parse_result, structure_result
            )

        except Exception as e:
            logger.error(f"Process to review failed: {str(e)}")
            self._mark_error(upload_id, str(e))
            return {'success': False, 'error': str(e)}

    def approve_structure(
        self,
        upload_id: str,
        edits: Optional[Dict] = None,
        options: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Approve structure (with optional edits) and continue processing."""
        approval_result = self.review_service.approve_structure(upload_id, edits)

        if not approval_result.get('success'):
            return approval_result

        upload = self._get_upload(upload_id)
        if not upload:
            return {'success': False, 'error': 'Upload not found'}

        return self.process_upload_with_tracking(
            upload_id=upload_id,
            source_type=upload.get('source_type', 'text'),
            content=None,
            filename=upload.get('original_filename'),
            options=options or {},
            resume_from=3
        )

    # =========================================================================
    # Main Pipeline Methods (with tracking)
    # =========================================================================

    def process_upload_with_tracking(
        self,
        upload_id: str,
        source_type: str,
        content: Optional[bytes],
        filename: Optional[str] = None,
        options: Optional[Dict] = None,
        resume_from: int = 1
    ) -> Dict[str, Any]:
        """
        Execute the curriculum upload pipeline with checkpoint saves and progress tracking.
        """
        options = options or {}
        transformation_level = options.get('transformation_level', 'moderate')
        preserve_structure = options.get('preserve_structure', True)
        content_types = options.get('content_types')
        learning_objectives = options.get('learning_objectives')

        parse_sections_count = 0
        detected_modules_count = 0

        try:
            # Stage 1: Parse source content
            if resume_from <= 1:
                self._update_progress(upload_id, 1, 10, "Reading document...")
                logger.info(f"Stage 1: Parsing {source_type} content")

                self._update_progress(upload_id, 1, 30, "Extracting content...")
                parse_result = self.parse_source(source_type, content, filename, content_types, upload_id)

                if not parse_result.get('success'):
                    self._mark_error(upload_id, parse_result.get('error', 'Failed to parse source'))
                    return {
                        'success': False,
                        'error': parse_result.get('error', 'Failed to parse source'),
                        'stages': {'parse': parse_result}
                    }

                self._update_progress(upload_id, 1, 80, "Saving parsed content...")
                self._save_checkpoint(upload_id, 1, parse_result)
                self._update_progress(upload_id, 1, 100, "Document parsed successfully")

                del content
                gc.collect()
            else:
                upload = self._get_upload(upload_id)
                parse_result = upload.get('raw_content', {})
                if not parse_result:
                    return {'success': False, 'error': 'No parsed content found for resume'}
                logger.info("Stage 1: Loaded from checkpoint")

            # Stage 2: Detect curriculum structure
            if resume_from <= 2:
                self._update_progress(upload_id, 2, 10, "Analyzing document structure...")
                logger.info("Stage 2: Detecting curriculum structure")

                self._update_progress(upload_id, 2, 30, "AI analyzing curriculum...")
                structure_result = self.detect_structure_chunked(parse_result, upload_id)

                if not structure_result.get('success'):
                    self._mark_error(upload_id, structure_result.get('error', 'Failed to detect structure'))
                    return {
                        'success': False,
                        'error': structure_result.get('error', 'Failed to detect structure'),
                        'stages': {'parse': parse_result, 'structure': structure_result}
                    }

                self._update_progress(upload_id, 2, 90, "Saving structure...")
                self._save_checkpoint(upload_id, 2, structure_result)
                self._update_progress(upload_id, 2, 100, "Structure detected successfully")
            else:
                upload = self._get_upload(upload_id)
                structure_result = upload.get('structured_content', {})
                if not structure_result:
                    return {'success': False, 'error': 'No structured content found for resume'}
                logger.info("Stage 2: Loaded from checkpoint")

            parse_sections_count = len(parse_result.get('sections', []))
            detected_modules_count = len(structure_result.get('modules', []))

            # Stage 3: Align to Optio philosophy
            if resume_from <= 3:
                self._update_progress(upload_id, 3, 10, "Preparing philosophy alignment...")
                logger.info(f"Stage 3: Aligning to Optio philosophy (level={transformation_level})")

                self._update_progress(upload_id, 3, 30, "AI transforming content...")
                alignment_result = self.ai_service.align_philosophy(
                    structure_result,
                    transformation_level=transformation_level,
                    preserve_structure=preserve_structure
                )

                if not alignment_result.get('success'):
                    self._mark_error(upload_id, alignment_result.get('error', 'Failed to align philosophy'))
                    return {
                        'success': False,
                        'error': alignment_result.get('error', 'Failed to align philosophy'),
                        'stages': {
                            'parse': parse_result,
                            'structure': structure_result,
                            'alignment': alignment_result
                        }
                    }

                self._update_progress(upload_id, 3, 90, "Saving aligned content...")
                self._save_checkpoint(upload_id, 3, alignment_result)
                self._update_progress(upload_id, 3, 100, "Philosophy alignment complete")
            else:
                upload = self._get_upload(upload_id)
                alignment_result = upload.get('aligned_content', {})
                if not alignment_result:
                    return {'success': False, 'error': 'No aligned content found for resume'}
                logger.info("Stage 3: Loaded from checkpoint")

            # Stage 4: Generate course content
            self._update_progress(upload_id, 4, 10, "Preparing content generation...")
            logger.info(f"Stage 4: Generating course content (objectives: {len(learning_objectives) if learning_objectives else 0})")

            self._update_progress(upload_id, 4, 30, "AI generating lessons...")
            content_result = self.ai_service.generate_course_content(alignment_result, learning_objectives)

            if not content_result.get('success'):
                self._mark_error(upload_id, content_result.get('error', 'Failed to generate content'))
                return {
                    'success': False,
                    'error': content_result.get('error', 'Failed to generate content'),
                    'stages': {
                        'parse': parse_result,
                        'structure': structure_result,
                        'alignment': alignment_result,
                        'content': content_result
                    }
                }

            self._update_progress(upload_id, 4, 80, "Saving generated content...")
            self._save_checkpoint(upload_id, 4, content_result)
            self._update_progress(upload_id, 4, 100, "Content generation complete!")

            # Build preview
            preview = {
                'course': content_result.get('course', {}),
                'projects': content_result.get('projects', [])
            }

            generated_projects_count = len(content_result.get('projects', []))
            total_lessons = sum(
                len(project.get('lessons', []))
                for project in content_result.get('projects', [])
            )

            # Mark as complete
            self.admin_client.table('curriculum_uploads').update({
                'status': 'complete',
                'progress_percent': 100,
                'current_stage_name': 'Complete',
                'current_item': f'{generated_projects_count} projects with {total_lessons} lessons',
                'can_resume': False,
                'resume_from_stage': None
            }).eq('id', upload_id).execute()

            return {
                'success': True,
                'preview': preview,
                'metadata': {
                    'source_type': source_type,
                    'filename': filename,
                    'transformation_level': transformation_level,
                    'preserve_structure': preserve_structure,
                    'source_sections': parse_sections_count,
                    'detected_modules': detected_modules_count,
                    'generated_projects': generated_projects_count,
                    'generated_lessons': total_lessons
                }
            }

        except Exception as e:
            logger.error(f"Curriculum upload pipeline failed: {str(e)}")
            self._mark_error(upload_id, f'Pipeline failed: {str(e)}')
            return {
                'success': False,
                'error': f'Pipeline failed: {str(e)}'
            }

    def process_upload(
        self,
        source_type: str,
        content: bytes,
        filename: Optional[str] = None,
        options: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Execute the full curriculum upload pipeline (without DB tracking).

        For simple/testing use cases. Use process_upload_with_tracking for production.
        """
        options = options or {}
        transformation_level = options.get('transformation_level', 'moderate')
        preserve_structure = options.get('preserve_structure', True)
        content_types = options.get('content_types')
        learning_objectives = options.get('learning_objectives')

        try:
            # Stage 1: Parse
            logger.info(f"Stage 1: Parsing {source_type} content")
            parse_result = self.parse_source(source_type, content, filename, content_types)

            if not parse_result.get('success'):
                return {
                    'success': False,
                    'error': parse_result.get('error', 'Failed to parse source'),
                    'stages': {'parse': parse_result}
                }

            # Stage 2: Detect structure
            logger.info("Stage 2: Detecting curriculum structure")
            structure_result = self.ai_service.detect_structure(parse_result)

            if not structure_result.get('success'):
                return {
                    'success': False,
                    'error': structure_result.get('error', 'Failed to detect structure'),
                    'stages': {'parse': parse_result, 'structure': structure_result}
                }

            # Stage 3: Align philosophy
            logger.info(f"Stage 3: Aligning to Optio philosophy")
            alignment_result = self.ai_service.align_philosophy(
                structure_result,
                transformation_level=transformation_level,
                preserve_structure=preserve_structure
            )

            if not alignment_result.get('success'):
                return {
                    'success': False,
                    'error': alignment_result.get('error', 'Failed to align philosophy'),
                    'stages': {
                        'parse': parse_result,
                        'structure': structure_result,
                        'alignment': alignment_result
                    }
                }

            # Stage 4: Generate content
            logger.info("Stage 4: Generating course content")
            content_result = self.ai_service.generate_course_content(alignment_result, learning_objectives)

            if not content_result.get('success'):
                return {
                    'success': False,
                    'error': content_result.get('error', 'Failed to generate content'),
                    'stages': {
                        'parse': parse_result,
                        'structure': structure_result,
                        'alignment': alignment_result,
                        'content': content_result
                    }
                }

            preview = {
                'course': content_result.get('course', {}),
                'projects': content_result.get('projects', [])
            }

            total_lessons = sum(
                len(project.get('lessons', []))
                for project in content_result.get('projects', [])
            )

            return {
                'success': True,
                'stages': {
                    'parse': parse_result,
                    'structure': structure_result,
                    'alignment': alignment_result,
                    'content': content_result
                },
                'preview': preview,
                'metadata': {
                    'source_type': source_type,
                    'filename': filename,
                    'transformation_level': transformation_level,
                    'preserve_structure': preserve_structure,
                    'source_sections': len(parse_result.get('sections', [])),
                    'detected_modules': len(structure_result.get('modules', [])),
                    'generated_projects': len(content_result.get('projects', [])),
                    'generated_lessons': total_lessons
                }
            }

        except Exception as e:
            logger.error(f"Curriculum upload pipeline failed: {str(e)}")
            return {
                'success': False,
                'error': f'Pipeline failed: {str(e)}'
            }

    # =========================================================================
    # Source Parsing
    # =========================================================================

    def parse_source(
        self,
        source_type: str,
        content: bytes,
        filename: Optional[str] = None,
        content_types: Optional[Dict] = None,
        upload_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Stage 1: Parse source content into raw text and sections.

        Delegates to appropriate parser based on source type.
        """
        progress_callback = None
        if upload_id:
            def progress_callback(message: str):
                try:
                    self._update_progress(upload_id, 1, None, message)
                except Exception:
                    pass

        if source_type == 'imscc':
            result = self.imscc_parser.parse_imscc_file(content)

            if not result.get('success'):
                return result

            if content_types:
                result = self._filter_imscc_content(result, content_types)

            return {
                'success': True,
                'raw_text': self._imscc_to_text(result),
                'sections': self._imscc_to_sections(result),
                'metadata': {
                    'source_type': 'imscc',
                    'filename': filename,
                    'course_title': result.get('course', {}).get('title', ''),
                    'total_assignments': result.get('stats', {}).get('total_assignments', 0),
                    'total_pages': result.get('stats', {}).get('total_pages', 0),
                    'total_modules': result.get('stats', {}).get('total_modules', 0),
                    'content_types_included': content_types
                },
                'original_data': result
            }
        else:
            return self.document_parser.parse_document(
                content, source_type, filename, progress_callback
            )

    def _filter_imscc_content(self, result: Dict, content_types: Dict) -> Dict:
        """Filter IMSCC parse result based on user-selected content types."""
        filtered = dict(result)

        if not content_types.get('assignments', True):
            filtered['tasks_preview'] = []
            if 'stats' in filtered:
                filtered['stats']['total_assignments'] = 0

        if not content_types.get('pages', True):
            filtered['pages_preview'] = []
            if 'stats' in filtered:
                filtered['stats']['total_pages'] = 0

        included = [k for k, v in content_types.items() if v]
        excluded = [k for k, v in content_types.items() if not v]
        logger.info(f"IMSCC content filter - included: {included}, excluded: {excluded}")

        return filtered

    def _imscc_to_text(self, imscc_result: Dict) -> str:
        """Convert IMSCC parse result to plain text."""
        parts = []

        course = imscc_result.get('course', {})
        if course.get('title'):
            parts.append(f"Course: {course['title']}")
        if course.get('description'):
            parts.append(f"Description: {course['description']}")

        for page in imscc_result.get('pages_preview', []):
            parts.append(f"\nPage: {page.get('title', '')}")
            if page.get('content'):
                parts.append(page['content'])

        for task in imscc_result.get('tasks_preview', []):
            parts.append(f"\nAssignment: {task.get('title', '')}")
            if task.get('description'):
                parts.append(task['description'])

        return '\n\n'.join(parts)

    def _imscc_to_sections(self, imscc_result: Dict) -> List[Dict]:
        """Convert IMSCC parse result to sections format."""
        sections = []

        course = imscc_result.get('course', {})
        if course.get('title') or course.get('description'):
            sections.append({
                'title': course.get('title', 'Course Overview'),
                'type': 'course',
                'content': course.get('description', ''),
                'level': 1
            })

        for module in imscc_result.get('course', {}).get('modules', []):
            sections.append({
                'title': module.get('title', 'Module'),
                'type': 'module',
                'content': '',
                'level': 1
            })

        for page in imscc_result.get('pages_preview', []):
            sections.append({
                'title': page.get('title', 'Page'),
                'type': 'page',
                'content': page.get('content', ''),
                'level': 2
            })

        for task in imscc_result.get('tasks_preview', []):
            sections.append({
                'title': task.get('title', 'Assignment'),
                'type': 'assignment',
                'content': task.get('description', ''),
                'level': 2,
                'xp_value': task.get('xp_value', 0)
            })

        return sections

    # =========================================================================
    # From-Scratch Course Generation
    # =========================================================================

    def process_generation(
        self,
        upload_id: str,
        topic: str,
        learning_objectives: Optional[List[str]],
        user_id: str,
        organization_id: str
    ) -> Dict[str, Any]:
        """
        Generate a complete course from scratch based on topic and optional objectives.

        This bypasses the normal 4-stage pipeline since there's no source curriculum
        to parse, structure, or align. It goes directly to content generation.
        """
        try:
            self._update_progress(upload_id, 1, 10, "Preparing to generate course...")
            logger.info(f"Generating course from topic: {topic}")

            self._update_progress(upload_id, 2, 30, "AI generating course structure...")

            # Use AI service for generation
            result = self.ai_service.generate_from_topic(topic, learning_objectives)

            if not result.get('success'):
                self._mark_error(upload_id, result.get('error', 'AI generation failed'))
                return result

            self._update_progress(upload_id, 3, 60, "Processing generated content...")

            course = result.get('course', {})
            projects = result.get('projects', [])

            logger.info(f"Generated {len(projects)} projects for topic: {topic}")

            self._update_progress(upload_id, 4, 80, "Creating course in database...")

            content_result = {
                'success': True,
                'course': course,
                'projects': projects
            }

            preview = {
                'course': course,
                'projects': projects
            }

            # Finalize by creating the course
            from routes.admin.curriculum_upload import _finalize_curriculum_upload

            finalize_result = {
                'success': True,
                'preview': preview,
                'metadata': {
                    'source_type': 'generate',
                    'topic': topic,
                    'generated_projects': len(projects),
                    'learning_objectives_provided': len(learning_objectives) if learning_objectives else 0
                }
            }

            _finalize_curriculum_upload(upload_id, user_id, organization_id, finalize_result)

            # Get the created course ID
            upload_result = self.admin_client.table('curriculum_uploads').select(
                'created_quest_id'
            ).eq('id', upload_id).execute()
            created_quest_id = upload_result.data[0]['created_quest_id'] if upload_result.data else None

            return {
                'success': True,
                'course_id': created_quest_id,
                'projects_count': len(projects)
            }

        except Exception as e:
            logger.error(f"Course generation error: {str(e)}")
            self._mark_error(upload_id, f'Generation failed: {str(e)}')
            return {
                'success': False,
                'error': f'Generation failed: {str(e)}'
            }

    # =========================================================================
    # Backward Compatibility - Delegate to AI Service
    # =========================================================================

    def detect_structure(self, parse_result: Dict) -> Dict[str, Any]:
        """Stage 2: Detect curriculum structure. Delegates to AI service."""
        return self.ai_service.detect_structure(parse_result)

    def align_philosophy(
        self,
        structure_result: Dict,
        transformation_level: str = 'moderate',
        preserve_structure: bool = True
    ) -> Dict[str, Any]:
        """Stage 3: Align to Optio philosophy. Delegates to AI service."""
        return self.ai_service.align_philosophy(
            structure_result, transformation_level, preserve_structure
        )

    def generate_course_content(
        self,
        alignment_result: Dict,
        learning_objectives: List[str] = None
    ) -> Dict[str, Any]:
        """Stage 4: Generate course content. Delegates to AI service."""
        return self.ai_service.generate_course_content(alignment_result, learning_objectives)
