"""
Curriculum Chunking Service

Handles smart content chunking for large curriculum files.
Enables parallel processing of large documents.
"""

from typing import Dict, List, Tuple, Any
from concurrent.futures import ThreadPoolExecutor, as_completed

from utils.logger import get_logger

logger = get_logger(__name__)


def chunk_content(raw_content: dict, max_chars: int = 12000) -> List[Dict]:
    """
    Split raw content into processable chunks.

    For large IMSCC files, splits by modules to enable parallel processing.

    Args:
        raw_content: Parsed content dict (from parse_source)
        max_chars: Maximum characters per chunk

    Returns:
        List of content chunks, each with metadata
    """
    # Get main text content
    text = raw_content.get('text', '')
    sections = raw_content.get('sections', [])
    source_type = raw_content.get('source_type', 'unknown')

    # If content is small enough, return single chunk
    if len(text) <= max_chars and not sections:
        return [{
            'chunk_index': 0,
            'total_chunks': 1,
            'text': text,
            'sections': [],
            'source_type': source_type
        }]

    # For IMSCC with sections, chunk by sections
    if sections:
        chunks = []
        current_chunk_text = ''
        current_chunk_sections = []
        chunk_index = 0

        for section in sections:
            section_text = section.get('content', '')

            # If adding this section exceeds limit, save current chunk
            if current_chunk_text and len(current_chunk_text) + len(section_text) > max_chars:
                chunks.append({
                    'chunk_index': chunk_index,
                    'text': current_chunk_text,
                    'sections': current_chunk_sections,
                    'source_type': source_type
                })
                chunk_index += 1
                current_chunk_text = ''
                current_chunk_sections = []

            current_chunk_text += section_text + '\n\n'
            current_chunk_sections.append(section)

        # Don't forget last chunk
        if current_chunk_text:
            chunks.append({
                'chunk_index': chunk_index,
                'text': current_chunk_text,
                'sections': current_chunk_sections,
                'source_type': source_type
            })

        # Update total_chunks
        total = len(chunks)
        for chunk in chunks:
            chunk['total_chunks'] = total

        return chunks

    # For plain text without sections, split by character count
    chunks = []
    chunk_index = 0
    start = 0

    while start < len(text):
        end = min(start + max_chars, len(text))

        # Try to break at paragraph boundary
        if end < len(text):
            last_para = text.rfind('\n\n', start, end)
            if last_para > start + max_chars // 2:
                end = last_para + 2

        chunks.append({
            'chunk_index': chunk_index,
            'text': text[start:end],
            'sections': [],
            'source_type': source_type
        })

        chunk_index += 1
        start = end

    # Update total_chunks
    total = len(chunks)
    for chunk in chunks:
        chunk['total_chunks'] = total

    return chunks


def merge_structure_results(results: List[Tuple[int, Dict]]) -> Dict:
    """
    Merge structure detection results from multiple chunks.

    Combines modules/projects from all chunks into unified structure.

    Args:
        results: List of (chunk_index, result) tuples

    Returns:
        Merged structure dict
    """
    # Sort by chunk index
    sorted_results = sorted(results, key=lambda x: x[0])

    merged = {
        'course_title': '',
        'course_description': '',
        'modules': []
    }

    for chunk_idx, result in sorted_results:
        # Take course title from first chunk that has it
        if not merged['course_title'] and result.get('course_title'):
            merged['course_title'] = result['course_title']

        # Take course description from first chunk that has it
        if not merged['course_description'] and result.get('course_description'):
            merged['course_description'] = result['course_description']

        # Merge modules
        chunk_modules = result.get('modules', [])
        if not chunk_modules:
            # Try alternate keys
            chunk_modules = result.get('projects', []) or result.get('units', [])

        for module in chunk_modules:
            # Check for duplicate by title
            existing = next(
                (m for m in merged['modules'] if m.get('title') == module.get('title')),
                None
            )

            if existing:
                # Merge lessons into existing module
                existing_lessons = existing.get('lessons', [])
                new_lessons = module.get('lessons', [])

                # Add only new lessons (by title)
                existing_titles = {l.get('title') for l in existing_lessons}
                for lesson in new_lessons:
                    if lesson.get('title') not in existing_titles:
                        existing_lessons.append(lesson)
            else:
                # Add new module
                merged['modules'].append(module)

    # Ensure we have at least one module
    if not merged['modules']:
        merged['modules'] = [{
            'title': 'Main Module',
            'description': '',
            'lessons': []
        }]

    return merged


def process_chunks_parallel(
    chunks: List[Dict],
    process_func,
    max_workers: int = 3
) -> List[Tuple[int, Dict]]:
    """
    Process multiple chunks in parallel.

    Args:
        chunks: List of content chunks
        process_func: Function to process each chunk (takes chunk dict, returns result dict)
        max_workers: Maximum parallel workers

    Returns:
        List of (chunk_index, result) tuples
    """
    results = []

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(process_func, chunk): chunk['chunk_index']
            for chunk in chunks
        }

        for future in as_completed(futures):
            chunk_idx = futures[future]
            try:
                result = future.result()
                results.append((chunk_idx, result))
                logger.info(f"Chunk {chunk_idx} processed successfully")
            except Exception as e:
                logger.error(f"Chunk {chunk_idx} failed: {e}")
                # Add empty result for failed chunk
                results.append((chunk_idx, {'modules': []}))

    return results
