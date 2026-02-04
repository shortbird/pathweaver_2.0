"""
Curriculum Parsing Utilities

Handles source content parsing and IMSCC conversion.
"""

from typing import Dict, List, Any

from utils.logger import get_logger

logger = get_logger(__name__)


def filter_imscc_content(result: Dict, content_types: Dict) -> Dict:
    """
    Filter IMSCC parsed content based on selected content types.

    Args:
        result: Full IMSCC parse result
        content_types: Dict of content type flags (e.g., {'modules': True, 'assignments': False})

    Returns:
        Filtered result with only selected content types
    """
    if not content_types:
        return result

    filtered = {
        'text': result.get('text', ''),
        'metadata': result.get('metadata', {}),
        'source_type': 'imscc'
    }

    # Filter sections based on content types
    if 'sections' in result:
        filtered_sections = []
        for section in result['sections']:
            section_type = section.get('type', 'unknown')

            # Map section types to content type flags
            include = False
            if section_type in ['module', 'unit'] and content_types.get('modules', True):
                include = True
            elif section_type == 'assignment' and content_types.get('assignments', True):
                include = True
            elif section_type == 'quiz' and content_types.get('quizzes', True):
                include = True
            elif section_type in ['page', 'content'] and content_types.get('pages', True):
                include = True
            elif section_type == 'discussion' and content_types.get('discussions', False):
                include = True
            elif section_type == 'file' and content_types.get('files', False):
                include = True

            if include:
                filtered_sections.append(section)

        filtered['sections'] = filtered_sections

    return filtered


def imscc_to_text(imscc_result: Dict) -> str:
    """
    Convert IMSCC parse result to plain text for AI processing.

    Args:
        imscc_result: Parsed IMSCC content

    Returns:
        Plain text representation
    """
    parts = []

    # Add metadata
    metadata = imscc_result.get('metadata', {})
    if metadata.get('title'):
        parts.append(f"Course: {metadata['title']}")
    if metadata.get('description'):
        parts.append(f"Description: {metadata['description']}")

    parts.append('')

    # Add sections
    for section in imscc_result.get('sections', []):
        section_type = section.get('type', 'content')
        title = section.get('title', 'Untitled')
        content = section.get('content', '')

        parts.append(f"[{section_type.upper()}] {title}")
        if content:
            parts.append(content)
        parts.append('')

    return '\n'.join(parts)


def imscc_to_sections(imscc_result: Dict) -> List[Dict]:
    """
    Convert IMSCC parse result to section list for chunking.

    Args:
        imscc_result: Parsed IMSCC content

    Returns:
        List of section dicts with type, title, content
    """
    sections = []

    for section in imscc_result.get('sections', []):
        sections.append({
            'type': section.get('type', 'content'),
            'title': section.get('title', 'Untitled'),
            'content': section.get('content', ''),
            'metadata': section.get('metadata', {})
        })

    return sections


def build_content_summary(raw_text: str, sections: List[Dict]) -> str:
    """
    Build a summary of content for AI context.

    Used to give AI an overview before detailed processing.

    Args:
        raw_text: Full text content
        sections: List of sections

    Returns:
        Content summary string
    """
    summary_parts = []

    # Word count
    word_count = len(raw_text.split())
    summary_parts.append(f"Total content: ~{word_count} words")

    # Section breakdown
    if sections:
        type_counts = {}
        for section in sections:
            stype = section.get('type', 'unknown')
            type_counts[stype] = type_counts.get(stype, 0) + 1

        summary_parts.append("Content breakdown:")
        for stype, count in sorted(type_counts.items()):
            summary_parts.append(f"  - {stype}: {count}")

    # Section titles (first 10)
    if sections:
        summary_parts.append("\nSection titles:")
        for section in sections[:10]:
            title = section.get('title', 'Untitled')
            summary_parts.append(f"  - {title}")
        if len(sections) > 10:
            summary_parts.append(f"  ... and {len(sections) - 10} more")

    return '\n'.join(summary_parts)
