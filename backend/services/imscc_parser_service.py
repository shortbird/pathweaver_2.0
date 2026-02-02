"""
IMSCC Parser Service

Parses Canvas course export files (.imscc format) to extract:
- Course metadata (title, description) → Maps to Badge
- Assignments → Maps to Quests
- Assignment details → Maps to Quest descriptions

IMSCC is a zip file containing:
- imsmanifest.xml (course structure)
- course_settings/course_settings.xml (metadata)
- assignment_*/assignment_*.xml (assignment details)
"""

import zipfile
import xml.etree.ElementTree as ET
from io import BytesIO
from typing import Dict, List, Optional, Tuple
from services.base_service import BaseService

from utils.logger import get_logger

logger = get_logger(__name__)


class IMSCCParserService(BaseService):
    """Service for parsing IMSCC course packages"""

    # XML namespaces used in IMSCC files
    NAMESPACES = {
        'imscc': 'http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1',
        'lom': 'http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource',
        'lomimscc': 'http://ltsc.ieee.org/xsd/imsccv1p1/LOM/manifest',
        'xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        'canvas': 'http://canvas.instructure.com/xsd/cccv1p0'
    }

    def parse_imscc_file(self, file_content: bytes) -> Dict:
        """
        Parse IMSCC file and extract course structure

        Args:
            file_content: Raw bytes of the .imscc/.zip file

        Returns:
            Dict containing parsed course data:
            {
                'success': bool,
                'error': str (if success=False),
                'course': {...},
                'badge_preview': {...},
                'quest_preview': {...},
                'tasks_preview': [...]
            }
        """
        try:
            # Open zip file
            with zipfile.ZipFile(BytesIO(file_content)) as zip_file:
                # Verify it's a valid IMSCC file
                if 'imsmanifest.xml' not in zip_file.namelist():
                    return {
                        'success': False,
                        'error': 'Invalid IMSCC file: missing imsmanifest.xml'
                    }

                # Parse manifest
                manifest_data = self._parse_manifest(zip_file)

                # Parse course settings if available
                course_settings = self._parse_course_settings(zip_file)

                # Merge course metadata
                course_data = {
                    **manifest_data,
                    **course_settings
                }

                # Parse assignments
                assignments = self._parse_assignments(zip_file, manifest_data.get('assignment_refs', []))

                # Parse pages (web content)
                pages = self._parse_pages(zip_file, manifest_data.get('page_refs', []))

                # Generate preview objects
                badge_preview = self._generate_badge_preview(course_data, assignments)
                quest_preview = self._generate_quest_preview(course_data, assignments)
                tasks_preview = self._generate_tasks_preview(assignments)
                pages_preview = self._generate_pages_preview(pages)

                return {
                    'success': True,
                    'course': course_data,
                    'badge_preview': badge_preview,
                    'quest_preview': quest_preview,
                    'tasks_preview': tasks_preview,
                    'pages_preview': pages_preview,
                    'stats': {
                        'total_assignments': len(assignments),
                        'total_pages': len(pages),
                        'total_modules': len(manifest_data.get('modules', [])),
                        'has_course_settings': bool(course_settings)
                    }
                }

        except zipfile.BadZipFile:
            return {
                'success': False,
                'error': 'Invalid zip file format'
            }
        except Exception as e:
            logger.error(f"Error parsing IMSCC file: {str(e)}")
            return {
                'success': False,
                'error': f'Failed to parse IMSCC file: {str(e)}'
            }

    def _parse_manifest(self, zip_file: zipfile.ZipFile) -> Dict:
        """
        Parse imsmanifest.xml to extract course structure

        Returns:
            Dict with course title, description, modules, assignment_refs, resources
        """
        try:
            manifest_xml = zip_file.read('imsmanifest.xml')
            root = ET.fromstring(manifest_xml)

            # Extract course title from metadata
            title = 'Untitled Course'
            title_elem = root.find('.//lomimscc:title/lomimscc:string', self.NAMESPACES)
            if title_elem is not None and title_elem.text:
                title = title_elem.text.strip()

            # Extract resources section (maps identifierref to actual files)
            resources = self._parse_resources(root)

            # Extract organizations (modules/structure)
            modules = []
            assignment_refs = []
            page_refs = []

            organizations = root.find('.//imscc:organizations', self.NAMESPACES)
            if organizations is not None:
                for org in organizations.findall('.//imscc:organization', self.NAMESPACES):
                    module_data = self._parse_organization(org, resources)
                    modules.extend(module_data['modules'])
                    assignment_refs.extend(module_data['assignment_refs'])
                    page_refs.extend(module_data.get('page_refs', []))

            return {
                'title': title,
                'modules': modules,
                'assignment_refs': assignment_refs,
                'page_refs': page_refs,
                'resources': resources
            }

        except Exception as e:
            logger.error(f"Error parsing manifest: {str(e)}")
            return {
                'title': 'Untitled Course',
                'modules': [],
                'assignment_refs': [],
                'page_refs': [],
                'resources': {}
            }

    def _parse_resources(self, root: ET.Element) -> Dict:
        """
        Parse resources section to map identifierref to actual files and types

        Returns:
            Dict mapping resource identifier to resource metadata
        """
        resources = {}

        resources_elem = root.find('.//imscc:resources', self.NAMESPACES)
        if resources_elem is not None:
            for resource in resources_elem.findall('imscc:resource', self.NAMESPACES):
                identifier = resource.get('identifier', '')
                resource_type = resource.get('type', '')

                # Get file href if available
                file_elem = resource.find('imscc:file', self.NAMESPACES)
                href = file_elem.get('href', '') if file_elem is not None else ''

                resources[identifier] = {
                    'type': resource_type,
                    'href': href,
                    'identifier': identifier
                }

        return resources

    def _parse_organization(self, org_element: ET.Element, resources: Dict) -> Dict:
        """
        Parse organization element (modules and items)

        Args:
            org_element: XML element for organization
            resources: Dict of resources from _parse_resources

        Returns:
            Dict with modules, assignment_refs, and page_refs lists
        """
        modules = []
        assignment_refs = []
        page_refs = []

        for item in org_element.findall('.//imscc:item', self.NAMESPACES):
            item_data = self._parse_item(item, resources)

            if item_data['type'] == 'module':
                modules.append(item_data)
            elif item_data['type'] == 'assignment':
                assignment_refs.append(item_data)
            elif item_data['type'] == 'page':
                page_refs.append(item_data)

        return {
            'modules': modules,
            'assignment_refs': assignment_refs,
            'page_refs': page_refs
        }

    def _parse_item(self, item_element: ET.Element, resources: Dict) -> Dict:
        """
        Parse individual item element (could be module, assignment, page, etc.)

        Args:
            item_element: XML element for item
            resources: Dict of resources to look up type information
        """
        identifier = item_element.get('identifier', '')
        identifierref = item_element.get('identifierref', '')

        # Get title
        title_elem = item_element.find('imscc:title', self.NAMESPACES)
        title = title_elem.text.strip() if title_elem is not None and title_elem.text else 'Untitled'

        # Determine type - first check resource type, then fall back to pattern matching
        item_type = 'unknown'
        resource_href = ''

        if identifierref and identifierref in resources:
            resource = resources[identifierref]
            resource_type = resource.get('type', '').lower()
            resource_href = resource.get('href', '')

            # Map Canvas resource types to our types
            if 'assignment' in resource_type or 'associatedcontent/imscc_xmlv1p1/learning-application-resource' in resource_type:
                item_type = 'assignment'
            elif 'webcontent' in resource_type:
                item_type = 'page'
            elif 'discussion' in resource_type or 'imsdt_xmlv1p1' in resource_type:
                item_type = 'discussion'
            elif 'quiz' in resource_type or 'imsqti_xmlv1p2/imscc_xmlv1p1/assessment' in resource_type:
                item_type = 'quiz'

        # Fall back to identifier pattern matching if type still unknown
        if item_type == 'unknown':
            if 'assignment' in identifier.lower():
                item_type = 'assignment'
            elif 'module' in identifier.lower() or identifierref == '':
                item_type = 'module'
            elif 'page' in identifier.lower():
                item_type = 'page'
            elif 'discussion' in identifier.lower():
                item_type = 'discussion'
            elif 'quiz' in identifier.lower():
                item_type = 'quiz'

        # If no identifierref, it's likely a module/folder
        if not identifierref:
            item_type = 'module'

        return {
            'identifier': identifier,
            'identifierref': identifierref,
            'title': title,
            'type': item_type,
            'href': resource_href
        }

    def _parse_course_settings(self, zip_file: zipfile.ZipFile) -> Dict:
        """
        Parse course_settings/course_settings.xml for additional metadata

        Returns:
            Dict with description, code, etc.
        """
        try:
            settings_path = 'course_settings/course_settings.xml'
            if settings_path not in zip_file.namelist():
                return {}

            settings_xml = zip_file.read(settings_path)
            root = ET.fromstring(settings_xml)

            result = {}

            # Extract course code
            course_code = root.find('.//course_code')
            if course_code is not None and course_code.text:
                result['course_code'] = course_code.text.strip()

            # Extract description
            description = root.find('.//description')
            if description is not None and description.text:
                result['description'] = description.text.strip()

            # Extract start/end dates
            start_at = root.find('.//start_at')
            if start_at is not None and start_at.text:
                result['start_date'] = start_at.text.strip()

            end_at = root.find('.//end_at')
            if end_at is not None and end_at.text:
                result['end_date'] = end_at.text.strip()

            return result

        except Exception as e:
            logger.error(f"Error parsing course settings: {str(e)}")
            return {}

    def _parse_assignments(self, zip_file: zipfile.ZipFile, assignment_refs: List[Dict]) -> List[Dict]:
        """
        Parse individual assignment XML files

        Args:
            zip_file: Open zip file
            assignment_refs: List of assignment references from manifest

        Returns:
            List of assignment dicts with detailed information
        """
        assignments = []

        # Canvas stores assignments in folders like: g{guid}/assignment_settings.xml
        # We need to look for assignment_settings.xml in the folders referenced by href
        for assignment_ref in assignment_refs:
            href = assignment_ref.get('href', '')
            if not href:
                continue

            # Extract folder from href (e.g., "g7a3f1874e5f749d3c6f77e5445aa3914/unit-1-critical-thinking-dropbox.html")
            folder = href.split('/')[0] if '/' in href else ''
            if not folder:
                continue

            assignment_file = f"{folder}/assignment_settings.xml"

            if assignment_file not in zip_file.namelist():
                logger.warning(f"Assignment settings file not found: {assignment_file}")
                continue
            try:
                assignment_xml = zip_file.read(assignment_file)
                root = ET.fromstring(assignment_xml)

                # Extract assignment details
                assignment = {}

                # Title - prefer from assignment_ref (from manifest) as it's cleaner
                assignment['title'] = assignment_ref.get('title', 'Untitled Assignment')

                # Also check XML title as fallback
                if not assignment['title'] or assignment['title'] == 'Untitled Assignment':
                    title = root.find('.//title')
                    assignment['title'] = title.text.strip() if title is not None and title.text else 'Untitled Assignment'

                # Description/Instructions - check both with and without namespace
                text = root.find('.//canvas:text', self.NAMESPACES)
                if text is None:
                    text = root.find('.//text')
                if text is not None and text.text:
                    assignment['description'] = self._clean_html(text.text)
                else:
                    assignment['description'] = ''

                # Points possible - use Canvas namespace
                points = root.find('.//canvas:points_possible', self.NAMESPACES)
                if points is None:
                    points = root.find('.//points_possible')
                assignment['points_possible'] = float(points.text) if points is not None and points.text else 0

                # Assignment type - use Canvas namespace
                submission_types = root.find('.//canvas:submission_types', self.NAMESPACES)
                if submission_types is None:
                    submission_types = root.find('.//submission_types')
                if submission_types is not None and submission_types.text:
                    assignment['submission_types'] = submission_types.text.strip().split(',')
                else:
                    assignment['submission_types'] = ['none']

                # Due date - use Canvas namespace
                due_at = root.find('.//canvas:due_at', self.NAMESPACES)
                if due_at is None:
                    due_at = root.find('.//due_at')
                assignment['due_date'] = due_at.text.strip() if due_at is not None and due_at.text else None

                # Assignment ID - try identifier from manifest first
                assignment['assignment_id'] = assignment_ref.get('identifier', None)

                # Source file for reference
                assignment['source_file'] = assignment_file

                assignments.append(assignment)

            except Exception as e:
                logger.error(f"Error parsing assignment {assignment_file}: {str(e)}")
                continue

        return assignments

    def _parse_pages(self, zip_file: zipfile.ZipFile, page_refs: List[Dict]) -> List[Dict]:
        """
        Parse page/webcontent HTML files

        Args:
            zip_file: Open zip file
            page_refs: List of page references from manifest

        Returns:
            List of page dicts with content extracted
        """
        pages = []

        for page_ref in page_refs:
            href = page_ref.get('href', '')
            if not href:
                continue

            # Check if the HTML file exists in the ZIP
            if href not in zip_file.namelist():
                logger.warning(f"Page file not found: {href}")
                continue

            try:
                html_content = zip_file.read(href).decode('utf-8', errors='ignore')

                page = {
                    'title': page_ref.get('title', 'Untitled Page'),
                    'content': self._clean_html(html_content),
                    'html': html_content,  # Keep original for reference
                    'source_file': href,
                    'identifier': page_ref.get('identifier', '')
                }

                pages.append(page)

            except Exception as e:
                logger.error(f"Error parsing page {href}: {str(e)}")
                continue

        return pages

    def _clean_html(self, html_content: str) -> str:
        """
        Clean HTML content - basic implementation
        For production, consider using bleach or html2text library
        """
        if not html_content:
            return ''

        # Remove common HTML tags (basic implementation)
        import re
        text = re.sub(r'<[^>]+>', '', html_content)
        text = re.sub(r'\s+', ' ', text)
        return text.strip()

    def _generate_badge_preview(self, course_data: Dict, assignments: List[Dict]) -> Dict:
        """
        Generate preview of what the Badge would look like

        Returns:
            Dict representing the badge that would be created
        """
        total_points = sum(a.get('points_possible', 0) for a in assignments)

        # Badge represents the Canvas course
        # min_xp = total Canvas points (sum of all assignment points)
        # min_quests = 1 (the course itself is the quest)

        return {
            'name': course_data.get('title', 'Untitled Course'),
            'description': course_data.get('description', 'Imported from Canvas course'),
            'course_code': course_data.get('course_code', ''),
            'badge_type': 'lms_course',
            'pillar_primary': 'stem',  # Default - admin can change
            'min_quests': 1,  # One quest (the course container)
            'min_xp': int(total_points),  # Total Canvas points from all assignments
            'total_canvas_points': total_points,
            'quest_source_filter': 'canvas_import',
            'metadata': {
                'import_source': 'canvas_imscc',
                'import_date': None,  # Will be set on actual import
                'canvas_course_code': course_data.get('course_code', ''),
                'start_date': course_data.get('start_date'),
                'end_date': course_data.get('end_date'),
                'total_assignments': len(assignments)
            }
        }

    def _generate_quest_preview(self, course_data: Dict, assignments: List[Dict]) -> Dict:
        """
        Generate preview of the Quest (course container)

        Returns:
            Dict representing the single quest that would be created
        """
        total_points = sum(a.get('points_possible', 0) for a in assignments)

        # The course itself becomes the quest
        # It's a container for the tasks (assignments)
        return {
            'title': course_data.get('title', 'Untitled Course'),
            'description': course_data.get('description', 'Imported from Canvas course'),
            'quest_type': 'course',
            'lms_platform': 'canvas',
            'lms_course_id': course_data.get('course_code'),
            'is_active': False,  # Start as draft
            'is_public': False,
            'metadata': {
                'import_source': 'canvas_imscc',
                'canvas_course_code': course_data.get('course_code', ''),
                'start_date': course_data.get('start_date'),
                'end_date': course_data.get('end_date'),
                'total_assignments': len(assignments),
                'total_canvas_points': total_points
            },
            'badge_quest_settings': {
                'is_required': True,
                'order_index': 1
            }
        }

    def _generate_tasks_preview(self, assignments: List[Dict]) -> List[Dict]:
        """
        Generate preview of Tasks (assignments)

        Returns:
            List of task dicts that would be created
        """
        tasks = []

        for idx, assignment in enumerate(assignments):
            task = {
                'title': assignment['title'],
                'description': assignment['description'] if assignment['description'] else 'No description provided',
                'pillar': 'stem',  # Default - would be determined during import
                'xp_value': int(assignment.get('points_possible', 0)),  # Canvas points = XP
                'order_index': idx + 1,
                'is_required': False,
                'is_manual': False,
                'approval_status': 'approved',
                'metadata': {
                    'lms_assignment_id': assignment.get('assignment_id'),
                    'submission_types': assignment.get('submission_types', []),
                    'due_date': assignment.get('due_date'),
                    'source_file': assignment.get('source_file'),
                    'canvas_points': assignment.get('points_possible', 0)
                }
            }

            tasks.append(task)

        return tasks

    def _generate_pages_preview(self, pages: List[Dict]) -> List[Dict]:
        """
        Generate preview of Pages (web content)

        Returns:
            List of page dicts for AI processing
        """
        preview_pages = []

        for idx, page in enumerate(pages):
            preview_page = {
                'title': page.get('title', f'Page {idx + 1}'),
                'content': page.get('content', ''),
                'order_index': idx + 1,
                'metadata': {
                    'source_file': page.get('source_file'),
                    'identifier': page.get('identifier', ''),
                    'content_length': len(page.get('content', ''))
                }
            }

            preview_pages.append(preview_page)

        return preview_pages

    def validate_imscc_file(self, file_content: bytes) -> Tuple[bool, Optional[str]]:
        """
        Validate that file is a proper IMSCC format

        Returns:
            Tuple of (is_valid, error_message)
        """
        try:
            with zipfile.ZipFile(BytesIO(file_content)) as zip_file:
                # Check for required manifest
                if 'imsmanifest.xml' not in zip_file.namelist():
                    return False, 'Missing required imsmanifest.xml file'

                # Try to parse manifest
                manifest_xml = zip_file.read('imsmanifest.xml')
                ET.fromstring(manifest_xml)

                return True, None

        except zipfile.BadZipFile:
            return False, 'File is not a valid zip archive'
        except ET.ParseError:
            return False, 'Invalid XML in manifest file'
        except Exception as e:
            return False, f'Validation error: {str(e)}'

    def diagnose_imscc_file(self, file_content: bytes) -> Dict:
        """
        Analyze IMSCC contents and report extraction coverage.

        Use this to verify what content types exist in the file
        and which ones will be extracted during processing.

        Returns:
            Dict with diagnostic information:
            {
                'success': bool,
                'total_files': int,
                'resources': {
                    'assignments': {'found': int, 'extracted': bool},
                    'pages': {'found': int, 'extracted': bool},
                    ...
                },
                'coverage_estimate': str,
                'file_sample': [list of file paths]
            }
        """
        try:
            with zipfile.ZipFile(BytesIO(file_content)) as zip_file:
                # Get all files in ZIP
                all_files = zip_file.namelist()

                # Parse manifest for resources
                manifest = self._parse_manifest(zip_file)
                resources = manifest.get('resources', {})

                # Categorize resources by type
                stats = {
                    'assignments': {'found': 0, 'extracted': True, 'files': []},
                    'pages': {'found': 0, 'extracted': True, 'files': []},
                    'discussions': {'found': 0, 'extracted': False, 'files': []},
                    'quizzes': {'found': 0, 'extracted': False, 'files': []},
                    'files': {'found': 0, 'extracted': False, 'files': []},
                    'external_tools': {'found': 0, 'extracted': False, 'files': []},
                    'unknown': {'found': 0, 'extracted': False, 'files': []}
                }

                for identifier, res in resources.items():
                    res_type = res.get('type', '').lower()
                    href = res.get('href', '')

                    if 'learning-application-resource' in res_type or 'assignment' in res_type:
                        stats['assignments']['found'] += 1
                        stats['assignments']['files'].append(href)
                    elif 'webcontent' in res_type:
                        stats['pages']['found'] += 1
                        stats['pages']['files'].append(href)
                    elif 'imsdt' in res_type or 'discussion' in res_type:
                        stats['discussions']['found'] += 1
                        stats['discussions']['files'].append(href)
                    elif 'imsqti' in res_type or 'assessment' in res_type or 'quiz' in res_type:
                        stats['quizzes']['found'] += 1
                        stats['quizzes']['files'].append(href)
                    elif 'imswl' in res_type or 'weblink' in res_type:
                        stats['external_tools']['found'] += 1
                        stats['external_tools']['files'].append(href)
                    elif 'imsbasiclti' in res_type:
                        stats['external_tools']['found'] += 1
                        stats['external_tools']['files'].append(href)
                    else:
                        stats['unknown']['found'] += 1
                        stats['unknown']['files'].append(f"{identifier}: {res_type}")

                # Count media/attachment files (not in resources but in ZIP)
                media_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.mp3', '.pdf', '.doc', '.docx']
                for f in all_files:
                    if any(f.lower().endswith(ext) for ext in media_extensions):
                        stats['files']['found'] += 1
                        if len(stats['files']['files']) < 10:  # Limit sample
                            stats['files']['files'].append(f)

                # Calculate coverage estimate
                total_resources = sum(s['found'] for s in stats.values())
                extracted_resources = sum(
                    s['found'] for s in stats.values() if s['extracted']
                )
                coverage_pct = (extracted_resources / total_resources * 100) if total_resources > 0 else 0

                return {
                    'success': True,
                    'total_files': len(all_files),
                    'total_resources': total_resources,
                    'resources': {
                        k: {'found': v['found'], 'extracted': v['extracted']}
                        for k, v in stats.items()
                    },
                    'resource_details': {
                        k: v['files'][:5]  # First 5 files per type
                        for k, v in stats.items()
                        if v['found'] > 0
                    },
                    'coverage_estimate': f"{coverage_pct:.0f}%",
                    'file_sample': all_files[:30],
                    'course_title': manifest.get('title', 'Unknown'),
                    'modules_found': len(manifest.get('modules', [])),
                    'assignment_refs_found': len(manifest.get('assignment_refs', [])),
                    'page_refs_found': len(manifest.get('page_refs', []))
                }

        except zipfile.BadZipFile:
            return {
                'success': False,
                'error': 'File is not a valid zip archive'
            }
        except Exception as e:
            logger.error(f"Error diagnosing IMSCC file: {str(e)}")
            return {
                'success': False,
                'error': f'Diagnostic failed: {str(e)}'
            }
