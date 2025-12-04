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
        'xsi': 'http://www.w3.org/2001/XMLSchema-instance'
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
                'quests_preview': [...]
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

                # Generate preview objects
                badge_preview = self._generate_badge_preview(course_data, assignments)
                quests_preview = self._generate_quests_preview(assignments, course_data)

                return {
                    'success': True,
                    'course': course_data,
                    'badge_preview': badge_preview,
                    'quests_preview': quests_preview,
                    'stats': {
                        'total_assignments': len(assignments),
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
            Dict with course title, description, modules, assignment_refs
        """
        try:
            manifest_xml = zip_file.read('imsmanifest.xml')
            root = ET.fromstring(manifest_xml)

            # Extract course title from metadata
            title = 'Untitled Course'
            title_elem = root.find('.//lomimscc:title/lomimscc:string', self.NAMESPACES)
            if title_elem is not None and title_elem.text:
                title = title_elem.text.strip()

            # Extract organizations (modules/structure)
            modules = []
            assignment_refs = []

            organizations = root.find('.//imscc:organizations', self.NAMESPACES)
            if organizations is not None:
                for org in organizations.findall('.//imscc:organization', self.NAMESPACES):
                    module_data = self._parse_organization(org)
                    modules.extend(module_data['modules'])
                    assignment_refs.extend(module_data['assignment_refs'])

            return {
                'title': title,
                'modules': modules,
                'assignment_refs': assignment_refs
            }

        except Exception as e:
            logger.error(f"Error parsing manifest: {str(e)}")
            return {
                'title': 'Untitled Course',
                'modules': [],
                'assignment_refs': []
            }

    def _parse_organization(self, org_element: ET.Element) -> Dict:
        """
        Parse organization element (modules and items)

        Returns:
            Dict with modules list and assignment_refs list
        """
        modules = []
        assignment_refs = []

        for item in org_element.findall('.//imscc:item', self.NAMESPACES):
            item_data = self._parse_item(item)

            if item_data['type'] == 'module':
                modules.append(item_data)
            elif item_data['type'] == 'assignment':
                assignment_refs.append(item_data)

        return {
            'modules': modules,
            'assignment_refs': assignment_refs
        }

    def _parse_item(self, item_element: ET.Element) -> Dict:
        """Parse individual item element (could be module, assignment, page, etc.)"""
        identifier = item_element.get('identifier', '')
        identifierref = item_element.get('identifierref', '')

        # Get title
        title_elem = item_element.find('imscc:title', self.NAMESPACES)
        title = title_elem.text.strip() if title_elem is not None and title_elem.text else 'Untitled'

        # Determine type based on identifier pattern
        item_type = 'unknown'
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

        return {
            'identifier': identifier,
            'identifierref': identifierref,
            'title': title,
            'type': item_type
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

        # Get all assignment XML files
        assignment_files = [f for f in zip_file.namelist() if f.startswith('assignment') and f.endswith('.xml')]

        for assignment_file in assignment_files:
            try:
                assignment_xml = zip_file.read(assignment_file)
                root = ET.fromstring(assignment_xml)

                # Extract assignment details
                assignment = {}

                # Title
                title = root.find('.//title')
                assignment['title'] = title.text.strip() if title is not None and title.text else 'Untitled Assignment'

                # Description/Instructions
                text = root.find('.//text')
                if text is not None and text.text:
                    assignment['description'] = self._clean_html(text.text)
                else:
                    assignment['description'] = ''

                # Points possible
                points = root.find('.//points_possible')
                assignment['points_possible'] = float(points.text) if points is not None and points.text else 0

                # Assignment type
                submission_types = root.find('.//submission_types')
                if submission_types is not None and submission_types.text:
                    assignment['submission_types'] = submission_types.text.strip().split(',')
                else:
                    assignment['submission_types'] = ['none']

                # Due date
                due_at = root.find('.//due_at')
                assignment['due_date'] = due_at.text.strip() if due_at is not None and due_at.text else None

                # Assignment ID
                assignment_id = root.find('.//assignment_identifier')
                assignment['assignment_id'] = assignment_id.text.strip() if assignment_id is not None and assignment_id.text else None

                # Source file for reference
                assignment['source_file'] = assignment_file

                assignments.append(assignment)

            except Exception as e:
                logger.error(f"Error parsing assignment {assignment_file}: {str(e)}")
                continue

        return assignments

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

        return {
            'name': course_data.get('title', 'Untitled Course'),
            'description': course_data.get('description', 'Imported from Canvas course'),
            'course_code': course_data.get('course_code', ''),
            'badge_type': 'lms_course',
            'pillar_primary': 'stem',  # Default - admin can change
            'min_quests': len(assignments),
            'min_xp': len(assignments) * 100,  # 100 XP per assignment default
            'total_canvas_points': total_points,
            'quest_source_filter': 'canvas_import',
            'metadata': {
                'import_source': 'canvas_imscc',
                'import_date': None,  # Will be set on actual import
                'canvas_course_code': course_data.get('course_code', ''),
                'start_date': course_data.get('start_date'),
                'end_date': course_data.get('end_date')
            }
        }

    def _generate_quests_preview(self, assignments: List[Dict], course_data: Dict) -> List[Dict]:
        """
        Generate preview of what Quests would be created

        Returns:
            List of quest dicts
        """
        quests = []

        for idx, assignment in enumerate(assignments):
            quest = {
                'title': assignment['title'],
                'description': assignment['description'][:500] if assignment['description'] else 'No description provided',
                'quest_type': 'course',
                'lms_platform': 'canvas',
                'lms_assignment_id': assignment.get('assignment_id'),
                'is_active': False,  # Start as draft
                'is_public': False,
                'metadata': {
                    'canvas_points': assignment.get('points_possible', 0),
                    'submission_types': assignment.get('submission_types', []),
                    'due_date': assignment.get('due_date'),
                    'source_file': assignment.get('source_file')
                },
                'badge_quest_settings': {
                    'is_required': True,
                    'order_index': idx + 1
                },
                'estimated_xp': 100  # Default XP per quest
            }

            quests.append(quest)

        return quests

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
