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
"""

import uuid
import json
from datetime import datetime
from typing import Dict, List, Optional, Any
from concurrent.futures import ThreadPoolExecutor, as_completed
from services.base_ai_service import BaseAIService, AIGenerationError
from services.document_parser_service import DocumentParserService
from services.imscc_parser_service import IMSCCParserService
from database import get_supabase_admin_client

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


class CurriculumUploadService(BaseAIService):
    """
    Orchestrates the multi-stage AI curriculum upload pipeline.

    Pipeline Stages:
    1. parse_source() - Extract raw content from IMSCC/PDF/DOCX/text
    2. detect_structure() - AI identifies curriculum structure
    3. align_philosophy() - Transform language to Optio philosophy
    4. generate_course_content() - Create step-based lessons (no tasks)

    Output is auto-saved as draft course for editing in CourseBuilder.

    Uses gemini-2.5-pro for better reasoning on complex curriculum tasks.
    """

    # Use more capable model for curriculum processing
    CURRICULUM_MODEL = 'gemini-2.5-pro'

    def __init__(self):
        """Initialize with document parsers and advanced AI model."""
        # Use gemini-1.5-pro for curriculum processing (better reasoning)
        super().__init__(model_override=self.CURRICULUM_MODEL)
        self.document_parser = DocumentParserService()
        self.imscc_parser = IMSCCParserService()
        self._admin_client = None
        logger.info(f"CurriculumUploadService using model: {self.model_name}")

    @property
    def admin_client(self):
        """Lazy-loaded admin client for database operations."""
        if self._admin_client is None:
            self._admin_client = get_supabase_admin_client()
        return self._admin_client

    # =========================================================================
    # Checkpoint & Progress Methods
    # =========================================================================

    def _sanitize_for_db(self, data):
        """
        Remove null characters and other problematic content before DB save.
        PostgreSQL cannot store \\u0000 in text/jsonb fields.
        """
        import json
        if data is None:
            return None
        # Convert to JSON string, remove null chars, convert back
        json_str = json.dumps(data, ensure_ascii=False)
        # Remove null characters that PostgreSQL rejects
        json_str = json_str.replace('\\u0000', '').replace('\x00', '')
        return json.loads(json_str)

    def _save_checkpoint(self, upload_id: str, stage: int, output: dict) -> None:
        """
        Save stage output and mark checkpoint for resume capability.

        Args:
            upload_id: The upload record ID
            stage: Stage number (1-4)
            output: The stage output to save
        """
        column_map = {
            1: 'raw_content',
            2: 'structured_content',
            3: 'aligned_content',
            4: 'generated_content'
        }
        timestamp_col = f'stage_{stage}_completed_at'

        try:
            # Sanitize output to remove null characters that PostgreSQL rejects
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
        """
        Update progress information for real-time status polling.

        Args:
            upload_id: The upload record ID
            stage: Current stage number (1-4)
            percent: Progress within current stage (0-100)
            item: Current item being processed (e.g., "Module 3 of 5")
        """
        # Calculate overall progress: each stage is 25%
        overall_progress = (stage - 1) * 25 + (percent * 25 // 100)

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
            # Don't fail the pipeline for progress update errors
            logger.warning(f"Failed to update progress: {str(e)}")

    def _get_upload(self, upload_id: str) -> Optional[Dict]:
        """
        Fetch upload record from database.

        Args:
            upload_id: The upload record ID

        Returns:
            Upload record dict or None if not found
        """
        try:
            result = self.admin_client.table('curriculum_uploads').select(
                '*'
            ).eq('id', upload_id).execute()

            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"Failed to get upload: {str(e)}")
            return None

    def resume_upload(
        self,
        upload_id: str,
        options: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Resume a failed upload from the last successful stage.

        Args:
            upload_id: The upload record ID
            options: Pipeline options (transformation_level, preserve_structure)

        Returns:
            Result dict from process_upload_with_tracking
        """
        upload = self._get_upload(upload_id)

        if not upload:
            return {'success': False, 'error': 'Upload not found'}

        if not upload.get('can_resume'):
            return {'success': False, 'error': 'Upload cannot be resumed'}

        resume_from = upload.get('resume_from_stage', 1)
        logger.info(f"Resuming upload {upload_id} from stage {resume_from}")

        # Update status back to processing
        self.admin_client.table('curriculum_uploads').update({
            'status': 'processing',
            'error_message': None
        }).eq('id', upload_id).execute()

        return self.process_upload_with_tracking(
            upload_id=upload_id,
            source_type=upload.get('source_type', 'text'),
            content=None,  # Content comes from saved stages
            filename=upload.get('original_filename'),
            options=options or {},
            resume_from=resume_from
        )

    # =========================================================================
    # Smart Content Chunking Methods
    # =========================================================================

    def _chunk_content(self, raw_content: dict, max_chars: int = 12000) -> List[Dict]:
        """
        Split content into processable chunks by module boundaries.

        For large courses, this enables parallel processing of modules.

        Args:
            raw_content: Parsed content with sections
            max_chars: Max characters per chunk before splitting

        Returns:
            List of content chunks
        """
        sections = raw_content.get('sections', [])

        if not sections:
            return [raw_content]

        chunks = []
        current_chunk = {'sections': [], 'char_count': 0, 'raw_text': ''}

        for section in sections:
            section_content = section.get('content', '')
            section_size = len(section_content)

            # Start new chunk at module boundaries if current is large enough
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
        """
        Detect structure for a single content chunk.

        Args:
            chunk: Content chunk with sections
            chunk_idx: Index of this chunk
            total_chunks: Total number of chunks

        Returns:
            Structure detection result for this chunk
        """
        # Build a mini parse result for this chunk
        chunk_parse_result = {
            'success': True,
            'raw_text': chunk.get('raw_text', ''),
            'sections': chunk.get('sections', []),
            'metadata': {'chunk_index': chunk_idx, 'total_chunks': total_chunks}
        }

        return self.detect_structure(chunk_parse_result)

    def detect_structure_chunked(
        self,
        raw_content: dict,
        upload_id: str = None
    ) -> Dict[str, Any]:
        """
        Detect structure with parallel processing for large content.

        Args:
            raw_content: Parsed content
            upload_id: Optional upload ID for progress tracking

        Returns:
            Merged structure detection result
        """
        chunks = self._chunk_content(raw_content)

        # Small content - process normally
        if len(chunks) == 1:
            if upload_id:
                self._update_progress(upload_id, 2, 0, "Analyzing content structure")
            result = self.detect_structure(raw_content)
            if upload_id:
                self._update_progress(upload_id, 2, 100, "Structure detection complete")
            return result

        # Large content - process chunks in parallel
        logger.info(f"Processing {len(chunks)} chunks in parallel")
        results = []

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
                    result = future.result()
                    results.append((chunk_idx, result))

                    if upload_id:
                        progress = (len(results) * 100) // len(chunks)
                        self._update_progress(
                            upload_id, 2, progress,
                            f"Processed chunk {len(results)} of {len(chunks)}"
                        )
                except Exception as e:
                    logger.error(f"Chunk {chunk_idx} failed: {str(e)}")
                    results.append((chunk_idx, {'success': False, 'error': str(e)}))

        # Sort by chunk index and merge
        results.sort(key=lambda x: x[0])
        return self._merge_structure_results(results)

    def _merge_structure_results(self, results: List[tuple]) -> Dict:
        """
        Combine chunked structure detection results.

        Args:
            results: List of (chunk_idx, result) tuples

        Returns:
            Merged structure result
        """
        if not results:
            return {'success': False, 'error': 'No results to merge'}

        # Check for any failures
        failures = [r for _, r in results if not r.get('success')]
        if len(failures) == len(results):
            return {'success': False, 'error': 'All chunks failed to process'}

        # Take course info from first successful result
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

            # Use course info from first chunk
            if not merged['course'] and result.get('course'):
                merged['course'] = result['course']

            # Re-index and merge modules
            for module in result.get('modules', []):
                new_module = dict(module)
                old_id = new_module.get('id', f'module_{chunk_idx}')
                new_module['id'] = f'module_{module_id_offset + 1}'
                new_module['order'] = module_id_offset

                # Update lesson parent references
                for lesson in result.get('lessons', []):
                    if lesson.get('parent_module') == old_id:
                        lesson['parent_module'] = new_module['id']

                merged['modules'].append(new_module)
                module_id_offset += 1

            # Merge lessons with re-indexed IDs
            for lesson in result.get('lessons', []):
                new_lesson = dict(lesson)
                new_lesson['id'] = f'lesson_{lesson_id_offset + 1}'
                merged['lessons'].append(new_lesson)
                lesson_id_offset += 1

            # Merge tasks with re-indexed IDs
            for task in result.get('tasks', []):
                new_task = dict(task)
                new_task['id'] = f'task_{task_id_offset + 1}'
                merged['tasks'].append(new_task)
                task_id_offset += 1

        logger.info(f"Merged {len(results)} chunks: {len(merged['modules'])} modules, "
                    f"{len(merged['lessons'])} lessons, {len(merged['tasks'])} tasks")

        return merged

    # =========================================================================
    # Review Gate Methods
    # =========================================================================

    def process_upload_to_review(
        self,
        upload_id: str,
        source_type: str,
        content: bytes,
        filename: Optional[str] = None,
        options: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Process upload through Stage 2 only, then pause for human review.

        This allows users to verify/correct the detected structure before
        AI philosophy alignment and content generation.

        Args:
            upload_id: The upload record ID
            source_type: Type of content ('imscc', 'pdf', 'docx', 'text')
            content: Raw bytes of the uploaded file
            filename: Original filename
            options: Pipeline options

        Returns:
            Dict with structured_content for review
        """
        options = options or {}
        content_types = options.get('content_types')

        try:
            # Stage 1: Parse source
            self._update_progress(upload_id, 1, 0, "Starting document parsing")
            parse_result = self.parse_source(source_type, content, filename, content_types)

            if not parse_result.get('success'):
                self._mark_error(upload_id, parse_result.get('error', 'Parse failed'))
                return parse_result

            self._save_checkpoint(upload_id, 1, parse_result)
            self._update_progress(upload_id, 1, 100, "Document parsed")

            # Stage 2: Detect structure (with chunking for large content)
            self._update_progress(upload_id, 2, 0, "Detecting curriculum structure")
            structure_result = self.detect_structure_chunked(parse_result, upload_id)

            if not structure_result.get('success'):
                self._mark_error(upload_id, structure_result.get('error', 'Structure detection failed'))
                return structure_result

            self._save_checkpoint(upload_id, 2, structure_result)

            # Set status to ready_for_review instead of continuing
            self.admin_client.table('curriculum_uploads').update({
                'status': 'ready_for_review',
                'progress_percent': 50,
                'current_stage_name': 'Ready for review',
                'current_item': 'Waiting for structure approval',
                'can_resume': True,
                'resume_from_stage': 3
            }).eq('id', upload_id).execute()

            logger.info(f"Upload {upload_id} paused for structure review")

            return {
                'success': True,
                'status': 'ready_for_review',
                'structure': structure_result
            }

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
        """
        Approve structure (with optional edits) and continue processing.

        Called after user reviews Stage 2 output and approves/edits it.

        Args:
            upload_id: The upload record ID
            edits: Optional structure corrections from user
            options: Pipeline options (transformation_level, preserve_structure)

        Returns:
            Full pipeline result
        """
        upload = self._get_upload(upload_id)

        if not upload:
            return {'success': False, 'error': 'Upload not found'}

        if upload.get('status') != 'ready_for_review':
            return {'success': False, 'error': 'Upload not ready for approval'}

        # Apply any edits to structured_content
        structured = upload.get('structured_content', {})

        if edits:
            structured = self._apply_structure_edits(structured, edits)

            # Save edited structure and record the edits
            self.admin_client.table('curriculum_uploads').update({
                'structured_content': structured,
                'human_structure_edits': edits
            }).eq('id', upload_id).execute()

            logger.info(f"Applied {len(edits)} structure edits to upload {upload_id}")

        # Update status and continue from Stage 3
        self.admin_client.table('curriculum_uploads').update({
            'status': 'processing',
            'current_stage_name': 'Continuing processing',
            'current_item': 'Structure approved'
        }).eq('id', upload_id).execute()

        return self.process_upload_with_tracking(
            upload_id=upload_id,
            source_type=upload.get('source_type', 'text'),
            content=None,
            filename=upload.get('original_filename'),
            options=options or {},
            resume_from=3
        )

    def _apply_structure_edits(self, structure: Dict, edits: Dict) -> Dict:
        """
        Apply user edits to detected structure.

        Edits format:
        {
            'module_1': {'title': 'New Title', 'description': '...'},
            'lesson_2': {'title': 'New Lesson Title', 'parent_module': 'module_1'},
            ...
        }

        Args:
            structure: Original structured_content
            edits: Dict of element_id -> field edits

        Returns:
            Updated structure
        """
        if not edits:
            return structure

        updated = dict(structure)

        # Apply course edits
        if 'course' in edits:
            updated['course'] = {**updated.get('course', {}), **edits['course']}

        # Apply module edits
        for i, module in enumerate(updated.get('modules', [])):
            module_id = module.get('id', f'module_{i+1}')
            if module_id in edits:
                updated['modules'][i] = {**module, **edits[module_id]}

        # Apply lesson edits
        for i, lesson in enumerate(updated.get('lessons', [])):
            lesson_id = lesson.get('id', f'lesson_{i+1}')
            if lesson_id in edits:
                updated['lessons'][i] = {**lesson, **edits[lesson_id]}

        # Apply task edits
        for i, task in enumerate(updated.get('tasks', [])):
            task_id = task.get('id', f'task_{i+1}')
            if task_id in edits:
                updated['tasks'][i] = {**task, **edits[task_id]}

        return updated

    def _mark_error(self, upload_id: str, error_message: str) -> None:
        """Mark upload as failed with error message."""
        try:
            self.admin_client.table('curriculum_uploads').update({
                'status': 'error',
                'error_message': error_message,
                'can_resume': True  # Allow retry from last checkpoint
            }).eq('id', upload_id).execute()
        except Exception as e:
            logger.error(f"Failed to mark error: {str(e)}")

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

        This is the enhanced version of process_upload that integrates with the
        database for progress streaming and checkpoint/resume capability.

        Args:
            upload_id: The upload record ID for tracking
            source_type: Type of content ('imscc', 'pdf', 'docx', 'text')
            content: Raw bytes of the uploaded file (None if resuming)
            filename: Original filename for metadata
            options: Pipeline configuration
            resume_from: Stage to resume from (1-4), default 1

        Returns:
            Dict with all pipeline outputs
        """
        options = options or {}
        transformation_level = options.get('transformation_level', 'moderate')
        preserve_structure = options.get('preserve_structure', True)
        content_types = options.get('content_types')
        learning_objectives = options.get('learning_objectives')

        try:
            # Stage 1: Parse source content
            if resume_from <= 1:
                self._update_progress(upload_id, 1, 10, "Reading document...")
                logger.info(f"Stage 1: Parsing {source_type} content")

                self._update_progress(upload_id, 1, 30, "Extracting content...")
                parse_result = self.parse_source(source_type, content, filename, content_types)

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
            else:
                # Load from checkpoint
                upload = self._get_upload(upload_id)
                parse_result = upload.get('raw_content', {})
                if not parse_result:
                    return {'success': False, 'error': 'No parsed content found for resume'}
                logger.info(f"Stage 1: Loaded from checkpoint")

            # Stage 2: Detect curriculum structure
            if resume_from <= 2:
                self._update_progress(upload_id, 2, 10, "Analyzing document structure...")
                logger.info("Stage 2: Detecting curriculum structure")

                self._update_progress(upload_id, 2, 30, "AI analyzing curriculum...")
                # Use chunked processing for potentially large content
                structure_result = self.detect_structure_chunked(parse_result, upload_id)

                if not structure_result.get('success'):
                    self._mark_error(upload_id, structure_result.get('error', 'Failed to detect structure'))
                    return {
                        'success': False,
                        'error': structure_result.get('error', 'Failed to detect structure'),
                        'stages': {
                            'parse': parse_result,
                            'structure': structure_result
                        }
                    }

                self._update_progress(upload_id, 2, 85, "Saving structure...")
                self._save_checkpoint(upload_id, 2, structure_result)
                self._update_progress(upload_id, 2, 100, "Structure detected")
            else:
                # Load from checkpoint
                upload = self._get_upload(upload_id)
                structure_result = upload.get('structured_content', {})
                if not structure_result:
                    return {'success': False, 'error': 'No structured content found for resume'}
                logger.info(f"Stage 2: Loaded from checkpoint")

            # Stage 3: Align to Optio philosophy
            if resume_from <= 3:
                self._update_progress(upload_id, 3, 10, "Preparing content transformation...")
                logger.info(f"Stage 3: Aligning to Optio philosophy (level={transformation_level}, preserve={preserve_structure})")

                self._update_progress(upload_id, 3, 30, "AI transforming content...")
                alignment_result = self.align_philosophy(
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

                self._update_progress(upload_id, 3, 85, "Saving aligned content...")
                self._save_checkpoint(upload_id, 3, alignment_result)
                self._update_progress(upload_id, 3, 100, "Philosophy aligned")
            else:
                # Load from checkpoint
                upload = self._get_upload(upload_id)
                alignment_result = upload.get('aligned_content', {})
                if not alignment_result:
                    return {'success': False, 'error': 'No aligned content found for resume'}
                logger.info(f"Stage 3: Loaded from checkpoint")

            # Stage 4: Generate course content
            self._update_progress(upload_id, 4, 10, "Preparing to generate projects...")
            logger.info(f"Stage 4: Generating course content (learning_objectives: {len(learning_objectives) if learning_objectives else 0})")

            self._update_progress(upload_id, 4, 30, "AI generating projects and lessons...")
            content_result = self.generate_course_content(alignment_result, learning_objectives)

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

            self._save_checkpoint(upload_id, 4, content_result)
            self._update_progress(upload_id, 4, 100, "Content generated")

            # Build final preview
            preview = self._build_preview(content_result)

            # Count total lessons across all projects
            total_lessons = sum(
                len(project.get('lessons', []))
                for project in content_result.get('projects', [])
            )

            # Mark as complete
            self.admin_client.table('curriculum_uploads').update({
                'can_resume': False,
                'resume_from_stage': None
            }).eq('id', upload_id).execute()

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
        Execute the full curriculum upload pipeline.

        Args:
            source_type: Type of content ('imscc', 'pdf', 'docx', 'text')
            content: Raw bytes of the uploaded file (or text string)
            filename: Original filename for metadata
            options: Optional configuration for the pipeline:
                - transformation_level: 'light', 'moderate', 'full' (default: 'moderate')
                - preserve_structure: True/False (default: True)

        Returns:
            Dict with all pipeline outputs:
            {
                'success': bool,
                'error': str (if failed),
                'stages': {
                    'parse': {...},
                    'structure': {...},
                    'alignment': {...},
                    'content': {...}
                },
                'preview': {
                    'course': {...},
                    'lessons': [...]
                },
                'metadata': {...}
            }
        """
        options = options or {}
        transformation_level = options.get('transformation_level', 'moderate')
        preserve_structure = options.get('preserve_structure', True)
        content_types = options.get('content_types')
        learning_objectives = options.get('learning_objectives')  # For IMSCC: which content to include

        try:
            # Stage 1: Parse source content
            logger.info(f"Stage 1: Parsing {source_type} content")
            parse_result = self.parse_source(source_type, content, filename, content_types)

            if not parse_result.get('success'):
                return {
                    'success': False,
                    'error': parse_result.get('error', 'Failed to parse source'),
                    'stages': {'parse': parse_result}
                }

            # Stage 2: Detect curriculum structure
            logger.info("Stage 2: Detecting curriculum structure")
            structure_result = self.detect_structure(parse_result)

            if not structure_result.get('success'):
                return {
                    'success': False,
                    'error': structure_result.get('error', 'Failed to detect structure'),
                    'stages': {
                        'parse': parse_result,
                        'structure': structure_result
                    }
                }

            # Stage 3: Align to Optio philosophy
            logger.info(f"Stage 3: Aligning to Optio philosophy (level={transformation_level}, preserve={preserve_structure})")
            alignment_result = self.align_philosophy(
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

            # Stage 4: Generate course content
            logger.info(f"Stage 4: Generating course content (learning_objectives: {len(learning_objectives) if learning_objectives else 0})")
            content_result = self.generate_course_content(alignment_result, learning_objectives)

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

            # Build final preview
            preview = self._build_preview(content_result)

            # Count total lessons across all projects
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

    def parse_source(
        self,
        source_type: str,
        content: bytes,
        filename: Optional[str] = None,
        content_types: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Stage 1: Parse source content into raw text and sections.

        Delegates to appropriate parser based on source type.

        Args:
            source_type: Type of content
            content: Raw bytes or text
            filename: Original filename
            content_types: Optional dict of content types to include (for IMSCC)
                e.g., {'assignments': True, 'pages': True, 'discussions': False}

        Returns:
            Dict with raw_text, sections, metadata
        """
        if source_type == 'imscc':
            # Use IMSCC parser for Canvas exports
            result = self.imscc_parser.parse_imscc_file(content)

            if not result.get('success'):
                return result

            # Filter content based on user selection
            if content_types:
                result = self._filter_imscc_content(result, content_types)

            # Convert IMSCC output to our standard format
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
                'original_data': result  # Keep for reference
            }
        else:
            # Use document parser for PDF, DOCX, text
            return self.document_parser.parse_document(content, source_type, filename)

    def _filter_imscc_content(self, result: Dict, content_types: Dict) -> Dict:
        """
        Filter IMSCC parse result based on user-selected content types.

        Args:
            result: Full IMSCC parse result
            content_types: Dict like {'assignments': True, 'pages': False, ...}

        Returns:
            Filtered result with only selected content types
        """
        filtered = dict(result)  # Shallow copy

        # Filter tasks (assignments)
        if not content_types.get('assignments', True):
            filtered['tasks_preview'] = []
            if 'stats' in filtered:
                filtered['stats']['total_assignments'] = 0

        # Filter pages
        if not content_types.get('pages', True):
            filtered['pages_preview'] = []
            if 'stats' in filtered:
                filtered['stats']['total_pages'] = 0

        # Log what was filtered
        included = [k for k, v in content_types.items() if v]
        excluded = [k for k, v in content_types.items() if not v]
        logger.info(f"IMSCC content filter - included: {included}, excluded: {excluded}")

        return filtered

    def detect_structure(self, parse_result: Dict) -> Dict[str, Any]:
        """
        Stage 2: Use AI to identify curriculum structure.

        Analyzes parsed content to identify:
        - Course metadata (title, description, objectives)
        - Modules/units
        - Lessons
        - Tasks/assignments

        Args:
            parse_result: Output from parse_source()

        Returns:
            Dict with detected curriculum structure
        """
        from prompts.components import (
            PILLAR_DEFINITIONS_DETAILED,
            JSON_OUTPUT_INSTRUCTIONS_STRICT
        )
        from prompts.curriculum_upload import CURRICULUM_STRUCTURE_DETECTION

        # Prepare content for AI (truncate if too long)
        raw_text = parse_result.get('raw_text', '')
        sections = parse_result.get('sections', [])

        # Build structured input for AI
        content_summary = self._build_content_summary(raw_text, sections)

        prompt = f"""
{CURRICULUM_STRUCTURE_DETECTION}

{PILLAR_DEFINITIONS_DETAILED}

CONTENT TO ANALYZE:
{content_summary}

{JSON_OUTPUT_INSTRUCTIONS_STRICT}
"""

        try:
            result = self.generate_json(prompt, strict=True)

            # Validate structure
            if not isinstance(result, dict):
                return {
                    'success': False,
                    'error': 'AI returned invalid structure format'
                }

            return {
                'success': True,
                'course': result.get('course', {}),
                'modules': result.get('modules', []),
                'lessons': result.get('lessons', []),
                'tasks': result.get('tasks', []),
                'curriculum_type': result.get('curriculum_type', 'unknown'),
                'raw_result': result
            }

        except AIGenerationError as e:
            logger.error(f"Structure detection failed: {str(e)}")
            return {
                'success': False,
                'error': f'AI structure detection failed: {str(e)}'
            }

    def align_philosophy(
        self,
        structure_result: Dict,
        transformation_level: str = 'moderate',
        preserve_structure: bool = True
    ) -> Dict[str, Any]:
        """
        Stage 3: Transform content to align with Optio philosophy.

        Transforms:
        - Language (prove→explore, demonstrate→share, etc.)
        - Task descriptions (flexible, discovery-focused)
        - Assessment framing (reflection, not testing)
        - Removes grade/future-focused language

        Args:
            structure_result: Output from detect_structure()
            transformation_level: 'light', 'moderate', or 'full'
            preserve_structure: True to keep original structure

        Returns:
            Dict with philosophy-aligned content
        """
        from prompts.components import (
            CORE_PHILOSOPHY,
            LANGUAGE_GUIDELINES,
            JSON_OUTPUT_INSTRUCTIONS_STRICT
        )
        from prompts.curriculum_upload import get_alignment_prompt

        # Build input from detected structure
        structure_json = {
            'course': structure_result.get('course', {}),
            'modules': structure_result.get('modules', []),
            'lessons': structure_result.get('lessons', []),
            'tasks': structure_result.get('tasks', [])
        }

        import json
        structure_str = json.dumps(structure_json, indent=2)

        # Get the alignment prompt with specified options
        alignment_prompt = get_alignment_prompt(transformation_level, preserve_structure)

        prompt = f"""
{alignment_prompt}

{CORE_PHILOSOPHY}

{LANGUAGE_GUIDELINES}

CONTENT TO TRANSFORM:
```json
{structure_str}
```

{JSON_OUTPUT_INSTRUCTIONS_STRICT}
"""

        try:
            result = self.generate_json(prompt, strict=True)

            if not isinstance(result, dict):
                return {
                    'success': False,
                    'error': 'AI returned invalid alignment format'
                }

            # Validate content against philosophy
            validation = self._validate_philosophy_alignment(result)

            return {
                'success': True,
                'course': result.get('course', {}),
                'modules': result.get('modules', []),
                'lessons': result.get('lessons', []),
                'tasks': result.get('tasks', []),
                'transformation_notes': result.get('transformation_notes', []),
                'validation': validation,
                'raw_result': result
            }

        except AIGenerationError as e:
            logger.error(f"Philosophy alignment failed: {str(e)}")
            return {
                'success': False,
                'error': f'AI philosophy alignment failed: {str(e)}'
            }

    def generate_course_content(self, alignment_result: Dict, learning_objectives: List[str] = None) -> Dict[str, Any]:
        """
        Stage 4: Generate final course content in Optio format.

        Creates:
        - Course metadata (title, description)
        - Projects (standalone Quests) - one per learning objective if provided
        - Step-based lessons for each Project (version 2 format)

        Note: Tasks are NOT generated - educators add tasks in CourseBuilder.

        Args:
            alignment_result: Output from align_philosophy()
            learning_objectives: Optional list of user-provided learning objectives.
                                 If provided, creates one project per objective.

        Returns:
            Dict with course and projects ready for CourseBuilder
        """
        from prompts.components import (
            PILLAR_DEFINITIONS_DETAILED,
            SCHOOL_SUBJECTS,
            JSON_OUTPUT_INSTRUCTIONS_STRICT
        )
        from prompts.curriculum_upload import STEP_GENERATION_PROMPT

        import json
        aligned_content = json.dumps({
            'course': alignment_result.get('course', {}),
            'modules': alignment_result.get('modules', []),
            'lessons': alignment_result.get('lessons', []),
            'tasks': alignment_result.get('tasks', [])
        }, indent=2)

        # Build learning objectives section if provided by user
        objectives_section = ""
        if learning_objectives and len(learning_objectives) > 0:
            objectives_list = "\n".join([f"  {i+1}. {obj}" for i, obj in enumerate(learning_objectives)])
            objectives_section = f"""
USER-PROVIDED LEARNING OBJECTIVES:
==================================
The user has specified exactly {len(learning_objectives)} learning objectives.
Create EXACTLY {len(learning_objectives)} projects - one for each objective below:

{objectives_list}

CRITICAL REQUIREMENTS:
1. You MUST create exactly {len(learning_objectives)} projects (one per objective)
2. Each project's source_objective field should contain the corresponding objective text
3. Transform each objective into an Optio-style quest title that EMBODIES its intent:
   - Identify the core action/skill in the objective
   - Convert to action verb + specific, tangible outcome
   - The quest title should capture the objective's INTENT (not just rephrase it)
4. Completing each project should demonstrate mastery of that learning objective
"""
        else:
            objectives_section = """
NO LEARNING OBJECTIVES PROVIDED:
================================
Create 4-8 projects based on Optio's instructional design philosophy.

Apply "The Process Is The Goal" approach:
- Analyze content for natural project boundaries based on skills/knowledge areas
- Each project should result in a tangible creation (artifact, performance, deliverable)
- Name projects with action verbs + specific outcomes that make students WANT to start
- Projects should work as standalone quests in the public library
- Do NOT create projects named after modules (e.g., "Module 1: Basics")

Leave source_objective as null for all projects.
"""

        prompt = f"""
{STEP_GENERATION_PROMPT}

{objectives_section}

{PILLAR_DEFINITIONS_DETAILED}

SCHOOL SUBJECTS FOR DIPLOMA MAPPING: {', '.join(SCHOOL_SUBJECTS)}

ALIGNED CONTENT TO FORMAT:
```json
{aligned_content}
```

{JSON_OUTPUT_INSTRUCTIONS_STRICT}
"""

        try:
            result = self.generate_json(prompt, strict=True)

            if not isinstance(result, dict):
                return {
                    'success': False,
                    'error': 'AI returned invalid content format'
                }

            # Debug: log raw AI response structure (using WARNING to ensure visibility)
            logger.warning(f"[DEBUG] AI response keys: {list(result.keys())}")
            raw_projects = result.get('projects', [])
            logger.warning(f"[DEBUG] AI returned {len(raw_projects)} projects")
            for i, p in enumerate(raw_projects):
                raw_lessons = p.get('lessons', [])
                logger.warning(f"[DEBUG]   Raw project {i}: '{p.get('title', 'N/A')}' has {len(raw_lessons)} lessons")

            # Process course and projects
            course = self._process_course(result.get('course', {}))
            projects = self._process_projects(result.get('projects', []))

            logger.warning(f"[DEBUG] After processing: {len(projects)} projects")
            for i, p in enumerate(projects):
                logger.warning(f"[DEBUG]   Processed project {i}: '{p.get('title', 'N/A')}' has {len(p.get('lessons', []))} lessons")

            return {
                'success': True,
                'course': course,
                'projects': projects,
                'raw_result': result
            }

        except AIGenerationError as e:
            logger.error(f"Content generation failed: {str(e)}")
            return {
                'success': False,
                'error': f'AI content generation failed: {str(e)}'
            }

    def _imscc_to_text(self, imscc_result: Dict) -> str:
        """Convert IMSCC parse result to plain text."""
        parts = []

        course = imscc_result.get('course', {})
        if course.get('title'):
            parts.append(f"Course: {course['title']}")
        if course.get('description'):
            parts.append(f"Description: {course['description']}")

        # Include page content (instructional material)
        pages = imscc_result.get('pages_preview', [])
        for page in pages:
            parts.append(f"\nPage: {page.get('title', '')}")
            if page.get('content'):
                parts.append(page['content'])

        # Include assignments
        tasks = imscc_result.get('tasks_preview', [])
        for task in tasks:
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

        # Include pages (instructional content)
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

    def _build_content_summary(self, raw_text: str, sections: List[Dict]) -> str:
        """Build a content summary for AI analysis, with length limits."""
        MAX_CHARS = 15000  # Reasonable limit for AI processing

        parts = []

        # Include section structure
        if sections:
            parts.append("DOCUMENT STRUCTURE:")
            for i, section in enumerate(sections[:30]):  # Limit sections
                indent = "  " * (section.get('level', 1) - 1)
                section_type = section.get('type', 'section')
                title = section.get('title', f'Section {i+1}')
                parts.append(f"{indent}- [{section_type}] {title}")

            parts.append("")

        # Include raw text (truncated)
        parts.append("DOCUMENT CONTENT:")
        if len(raw_text) > MAX_CHARS:
            parts.append(raw_text[:MAX_CHARS])
            parts.append(f"\n... [Truncated, {len(raw_text) - MAX_CHARS} more characters]")
        else:
            parts.append(raw_text)

        return '\n'.join(parts)

    def _validate_philosophy_alignment(self, result: Dict) -> Dict:
        """
        Score content based on Optio philosophy alignment.

        This is informational only - all content is valid.
        Content creators have freedom in their word choices.
        """
        from prompts.components import ENCOURAGED_WORDS

        notes = []
        score = 100  # Start at 100, this is a quality indicator not a pass/fail

        # Collect all text content
        def collect_text(obj):
            texts = []
            if isinstance(obj, dict):
                for v in obj.values():
                    texts.extend(collect_text(v))
            elif isinstance(obj, list):
                for item in obj:
                    texts.extend(collect_text(item))
            elif isinstance(obj, str):
                texts.append(obj)
            return texts

        all_text = ' '.join(collect_text(result)).lower()

        # Check for Optio-aligned language (bonus, not requirement)
        encouraged_count = sum(1 for word in ENCOURAGED_WORDS if word in all_text)

        if encouraged_count >= 5:
            notes.append("Strong use of process-focused, discovery language")
            score = 100
        elif encouraged_count >= 3:
            notes.append("Good use of Optio-aligned language")
            score = 90
        elif encouraged_count >= 1:
            notes.append("Some Optio-aligned language present")
            score = 80
        else:
            notes.append("Original voice preserved (no Optio language added)")
            score = 70  # Still valid, just indicates light transformation

        # Check for big_idea presence
        if result.get('course', {}).get('big_idea'):
            notes.append("Includes 'big idea' hook for student relevance")

        return {
            'score': score,
            'is_valid': True,  # All content is valid - creator freedom
            'notes': notes
        }

    def _process_course(self, course_data: Dict) -> Dict:
        """Process and validate course data."""
        return {
            'title': course_data.get('title', 'Untitled Course'),
            'description': course_data.get('description', ''),
            'status': 'draft',
            'visibility': 'organization',
            'navigation_mode': 'sequential'
        }

    def _process_projects(self, projects_data: List) -> List[Dict]:
        """Process and validate projects (quests) with their lessons."""
        processed = []

        for i, project in enumerate(projects_data):
            # Process lessons for this project
            lessons = self._process_lessons(project.get('lessons', []))

            processed.append({
                'title': project.get('title', f'Project {i+1}'),
                'description': project.get('description', ''),
                'big_idea': project.get('big_idea', ''),
                'order': project.get('order', i),
                'quest_type': 'optio',
                'is_active': False,  # Start as draft
                'is_public': False,
                'lessons': lessons
            })

        return processed

    def _process_lessons(self, lessons_data: List) -> List[Dict]:
        """Process and validate lessons with step-based content."""
        processed = []

        for i, lesson in enumerate(lessons_data):
            # Ensure steps are in version 2 format
            steps = lesson.get('steps', lesson.get('content', []))
            if isinstance(steps, str):
                # Convert string content to single step
                steps = [{
                    'id': f'step_{uuid.uuid4().hex[:8]}',
                    'type': 'text',
                    'title': 'Content',
                    'content': steps,
                    'order': 0
                }]
            elif isinstance(steps, list):
                # Ensure each step has required fields
                processed_steps = []
                for j, step in enumerate(steps):
                    if isinstance(step, str):
                        step = {'content': step}

                    processed_steps.append({
                        'id': step.get('id', f'step_{uuid.uuid4().hex[:8]}'),
                        'type': step.get('type', 'text'),
                        'title': step.get('title', f'Step {j+1}'),
                        'content': step.get('content', ''),
                        'order': step.get('order', j),
                        'video_url': step.get('video_url', ''),
                        'files': step.get('files', [])
                    })
                steps = processed_steps

            processed.append({
                'title': lesson.get('title', f'Lesson {i+1}'),
                'description': lesson.get('description', ''),
                'order_index': lesson.get('order', i),
                'curriculum_content': {
                    'version': 2,
                    'steps': steps
                }
            })

        return processed

    def _build_preview(self, content_result: Dict) -> Dict:
        """Build the final preview structure for CourseBuilder."""
        return {
            'course': content_result.get('course', {}),
            'projects': content_result.get('projects', [])
        }
