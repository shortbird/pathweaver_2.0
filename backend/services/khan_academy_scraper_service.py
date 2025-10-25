"""
Khan Academy Course Scraper Service

Scrapes Khan Academy course structures and creates Optio course quests.
Extracts course titles, descriptions, units (as tasks) with descriptions.

Strategy: Multi-approach scraping without Selenium
1. Check for GraphQL API endpoints
2. Look for embedded JSON in script tags
3. Try internal REST API patterns
4. Parse HTML as fallback
"""
import os
import requests
from bs4 import BeautifulSoup
from typing import Dict, List, Optional, Any
from services.base_service import BaseService
from datetime import datetime, timedelta
import time
import re
import json

from utils.logger import get_logger

logger = get_logger(__name__)


class KhanAcademyScraper(BaseService):
    """Service for scraping Khan Academy courses and converting to Optio quests"""

    def __init__(self):
        super().__init__()
        self.base_url = "https://www.khanacademy.org"
        self.api_base = "https://www.khanacademy.org/api"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.khanacademy.org/',
        })
        # Cache scraped courses for 24 hours
        self.cache = {}
        self.cache_duration = timedelta(hours=24)

    def scrape_course(self, course_url: str, subject_area: str = "Math") -> Optional[Dict[str, Any]]:
        """
        Scrape a Khan Academy course and return structured data.
        Uses multiple strategies to find course content.

        Args:
            course_url: Full URL to KA course page
            subject_area: Subject category (Math, Science, etc.)

        Returns:
            Dict with course data or None if scraping fails
        """
        try:
            # Check cache
            cache_key = course_url
            if cache_key in self.cache:
                cached_data, cached_time = self.cache[cache_key]
                if datetime.utcnow() - cached_time < self.cache_duration:
                    logger.info(f"Using cached data for {course_url}")
                    return cached_data

            logger.info(f"Scraping Khan Academy course: {course_url}")

            # Strategy 1: Try to find and use internal API endpoints
            api_data = self._try_api_endpoints(course_url)
            if api_data:
                logger.info("Successfully extracted data via API endpoints")
                self.cache[cache_key] = (api_data, datetime.utcnow())
                return api_data

            # Strategy 2: Fetch HTML and look for embedded JSON
            logger.info("Trying HTML parsing with embedded JSON...")
            response = self.session.get(course_url, timeout=15)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, 'lxml')

            # Look for Next.js data or other embedded JSON
            embedded_data = self._extract_embedded_json(soup)
            if embedded_data:
                logger.info("Successfully extracted data from embedded JSON")
                self.cache[cache_key] = (embedded_data, datetime.utcnow())
                return embedded_data

            # Strategy 3: Traditional HTML parsing
            logger.info("Falling back to HTML parsing...")
            course_title = self._extract_course_title(soup, course_url)
            course_description = self._extract_course_description(soup)
            units = self._extract_units_from_html(soup)

            if not course_title or not units:
                logger.error(f"Failed to extract course data from {course_url}")
                return None

            course_data = {
                'title': course_title,
                'description': course_description or f"Learn {course_title} on Khan Academy",
                'subject_area': subject_area,
                'source_url': course_url,
                'units': units,
                'scraped_at': datetime.utcnow().isoformat()
            }

            # Cache the result
            self.cache[cache_key] = (course_data, datetime.utcnow())

            logger.info(f"Successfully scraped course: {course_title} ({len(units)} units)")
            return course_data

        except requests.exceptions.RequestException as e:
            logger.error(f"Network error scraping {course_url}: {str(e)}")
            return None
        except Exception as e:
            logger.error(f"Error scraping {course_url}: {str(e)}")
            return None

    def _try_api_endpoints(self, course_url: str) -> Optional[Dict[str, Any]]:
        """
        Try various Khan Academy API endpoints to get course data.
        KA has GraphQL and REST APIs that might be accessible.
        """
        try:
            # Extract course slug from URL
            # e.g., https://www.khanacademy.org/math/algebra -> algebra
            url_parts = course_url.rstrip('/').split('/')
            if len(url_parts) < 2:
                return None

            course_slug = url_parts[-1]
            subject_slug = url_parts[-2] if len(url_parts) > 2 else None

            # Try 1: GraphQL endpoint (KA uses this internally)
            logger.info(f"Trying GraphQL API for {course_slug}...")
            graphql_data = self._try_graphql_api(course_slug, subject_slug)
            if graphql_data:
                return graphql_data

            # Try 2: Old REST API patterns (may still work)
            logger.info(f"Trying REST API for {course_slug}...")
            rest_data = self._try_rest_api(course_slug, subject_slug)
            if rest_data:
                return rest_data

            # Try 3: Internal JSON endpoints
            logger.info(f"Trying internal JSON endpoints for {course_slug}...")
            json_data = self._try_json_endpoints(course_slug, subject_slug)
            if json_data:
                return json_data

            return None

        except Exception as e:
            logger.error(f"Error trying API endpoints: {str(e)}")
            return None

    def _try_graphql_api(self, course_slug: str, subject_slug: Optional[str]) -> Optional[Dict[str, Any]]:
        """Try Khan Academy's GraphQL API"""
        try:
            # KA's GraphQL endpoint (discovered from browser network tab)
            graphql_url = "https://www.khanacademy.org/api/internal/graphql"

            # Example query structure (may need adjustment based on actual KA schema)
            query = {
                "operationName": "getCourseStructure",
                "variables": {"slug": course_slug},
                "query": """
                    query getCourseStructure($slug: String!) {
                        topic(slug: $slug) {
                            title
                            description
                            children {
                                title
                                description
                                kind
                            }
                        }
                    }
                """
            }

            response = self.session.post(graphql_url, json=query, timeout=10)

            if response.status_code == 200:
                data = response.json()
                if data and 'data' in data and 'topic' in data['data']:
                    topic = data['data']['topic']
                    return self._parse_graphql_response(topic, course_slug)

        except Exception as e:
            logger.debug(f"GraphQL attempt failed: {str(e)}")

        return None

    def _try_rest_api(self, course_slug: str, subject_slug: Optional[str]) -> Optional[Dict[str, Any]]:
        """Try Khan Academy's old REST API patterns"""
        try:
            # Old API patterns that might still work
            endpoints_to_try = [
                f"{self.api_base}/v1/topic/{course_slug}",
                f"{self.api_base}/internal/topic/{course_slug}",
                f"https://www.khanacademy.org/{subject_slug}/{course_slug}.json" if subject_slug else None,
            ]

            for endpoint in endpoints_to_try:
                if not endpoint:
                    continue

                try:
                    response = self.session.get(endpoint, timeout=10)
                    if response.status_code == 200:
                        data = response.json()
                        if data:
                            return self._parse_rest_response(data, course_slug)
                except Exception:
                    continue

        except Exception as e:
            logger.debug(f"REST API attempt failed: {str(e)}")

        return None

    def _try_json_endpoints(self, course_slug: str, subject_slug: Optional[str]) -> Optional[Dict[str, Any]]:
        """Try to find JSON data endpoints"""
        try:
            # Some sites expose JSON versions of pages
            json_urls = [
                f"https://www.khanacademy.org/{subject_slug}/{course_slug}/data.json" if subject_slug else None,
                f"https://www.khanacademy.org/api/v2/topics/{course_slug}",
            ]

            for url in json_urls:
                if not url:
                    continue

                try:
                    response = self.session.get(url, timeout=10)
                    if response.status_code == 200 and response.headers.get('content-type', '').startswith('application/json'):
                        data = response.json()
                        if data:
                            return self._parse_json_response(data, course_slug)
                except Exception:
                    continue

        except Exception as e:
            logger.debug(f"JSON endpoints attempt failed: {str(e)}")

        return None

    def _parse_graphql_response(self, topic_data: Dict, course_slug: str) -> Dict[str, Any]:
        """Parse GraphQL API response into our format"""
        units = []

        children = topic_data.get('children', [])
        for idx, child in enumerate(children[:50]):
            units.append({
                'title': child.get('title', f'Unit {idx + 1}'),
                'description': child.get('description', f'Complete this unit'),
                'order_index': idx,
                'pillar': 'stem',
                'xp_value': 100,
                'is_required': True,
                'diploma_subjects': self._get_diploma_subjects_from_title(child.get('title', ''))
            })

        return {
            'title': topic_data.get('title', course_slug.replace('-', ' ').title()),
            'description': topic_data.get('description', f'Learn {course_slug}'),
            'subject_area': 'Math',
            'source_url': f"{self.base_url}/{course_slug}",
            'units': units,
            'scraped_at': datetime.utcnow().isoformat()
        }

    def _parse_rest_response(self, data: Dict, course_slug: str) -> Dict[str, Any]:
        """Parse REST API response into our format"""
        units = []

        # Different API versions might structure data differently
        children = data.get('children', data.get('topics', data.get('units', [])))

        for idx, child in enumerate(children[:50]):
            if isinstance(child, dict):
                units.append({
                    'title': child.get('title', child.get('name', f'Unit {idx + 1}')),
                    'description': child.get('description', child.get('desc', f'Complete this unit')),
                    'order_index': idx,
                    'pillar': 'stem',
                    'xp_value': 100,
                    'is_required': True,
                    'diploma_subjects': self._get_diploma_subjects_from_title(child.get('title', child.get('name', '')))
                })

        return {
            'title': data.get('title', data.get('name', course_slug.replace('-', ' ').title())),
            'description': data.get('description', data.get('desc', f'Learn {course_slug}')),
            'subject_area': 'Math',
            'source_url': f"{self.base_url}/{course_slug}",
            'units': units,
            'scraped_at': datetime.utcnow().isoformat()
        }

    def _parse_json_response(self, data: Dict, course_slug: str) -> Dict[str, Any]:
        """Parse generic JSON response"""
        return self._parse_rest_response(data, course_slug)

    def _extract_embedded_json(self, soup: BeautifulSoup) -> Optional[Dict[str, Any]]:
        """Extract course data from embedded JSON in HTML"""
        try:
            # Look for Next.js data or similar
            script_tags = soup.find_all('script', type='application/json')

            for script in script_tags:
                if not script.string:
                    continue

                try:
                    data = json.loads(script.string)

                    # Try different JSON structures
                    if isinstance(data, dict):
                        # Next.js pattern
                        if 'props' in data:
                            pageProps = data.get('props', {}).get('pageProps', {})
                            if 'topic' in pageProps:
                                return self._parse_graphql_response(pageProps['topic'], '')
                            elif 'contentItems' in pageProps:
                                return self._parse_content_items(pageProps['contentItems'])

                        # Direct data pattern
                        if 'topic' in data:
                            return self._parse_graphql_response(data['topic'], '')
                        elif 'children' in data or 'units' in data:
                            return self._parse_rest_response(data, '')

                except (json.JSONDecodeError, KeyError, TypeError):
                    continue

            # Also look for window.__INITIAL_STATE__ or similar
            for script in soup.find_all('script'):
                if script.string and ('__INITIAL_STATE__' in script.string or 'window.KA' in script.string):
                    # Extract JSON from JavaScript
                    match = re.search(r'(__INITIAL_STATE__|window\.KA)\s*=\s*({.+?});', script.string, re.DOTALL)
                    if match:
                        try:
                            data = json.loads(match.group(2))
                            if data:
                                return self._parse_rest_response(data, '')
                        except Exception:
                            continue

        except Exception as e:
            logger.debug(f"Error extracting embedded JSON: {str(e)}")

        return None

    def _parse_content_items(self, items: List) -> Dict[str, Any]:
        """Parse contentItems structure"""
        units = []

        for idx, item in enumerate(items[:50]):
            if isinstance(item, dict):
                units.append({
                    'title': item.get('title', f'Unit {idx + 1}'),
                    'description': item.get('description', f'Complete this unit'),
                    'order_index': idx,
                    'pillar': 'stem',
                    'xp_value': 100,
                    'is_required': True,
                    'diploma_subjects': self._get_diploma_subjects_from_title(item.get('title', ''))
                })

        return {
            'title': 'Course',
            'description': 'Learn with Khan Academy',
            'subject_area': 'Math',
            'source_url': '',
            'units': units,
            'scraped_at': datetime.utcnow().isoformat()
        }

    def _extract_course_title(self, soup: BeautifulSoup, url: str) -> Optional[str]:
        """Extract course title from page"""
        try:
            # Try multiple selectors for course title
            # Option 1: Meta og:title tag
            og_title = soup.find('meta', property='og:title')
            if og_title and og_title.get('content'):
                title = og_title['content']
                # Clean up "| Khan Academy" suffix
                title = re.sub(r'\s*\|\s*Khan Academy.*$', '', title)
                if title:
                    return title.strip()

            # Option 2: Page title tag
            title_tag = soup.find('title')
            if title_tag:
                title = title_tag.get_text()
                title = re.sub(r'\s*\|\s*Khan Academy.*$', '', title)
                if title:
                    return title.strip()

            # Option 3: h1 heading
            h1 = soup.find('h1')
            if h1:
                return h1.get_text().strip()

            # Fallback: extract from URL
            url_parts = url.rstrip('/').split('/')
            if url_parts:
                title_slug = url_parts[-1]
                # Convert slug to title (e.g., "algebra-1" -> "Algebra 1")
                title = title_slug.replace('-', ' ').title()
                return title

        except Exception as e:
            logger.error(f"Error extracting course title: {str(e)}")

        return None

    def _extract_course_description(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract course description from page"""
        try:
            # Option 1: Meta description tag
            meta_desc = soup.find('meta', attrs={'name': 'description'})
            if meta_desc and meta_desc.get('content'):
                desc = meta_desc['content'].strip()
                if len(desc) > 50:  # Reasonable description length
                    return desc

            # Option 2: og:description
            og_desc = soup.find('meta', property='og:description')
            if og_desc and og_desc.get('content'):
                desc = og_desc['content'].strip()
                if len(desc) > 50:
                    return desc

            # Option 3: First paragraph in main content
            # Look for common content containers
            content_selectors = [
                'div[class*="course-description"]',
                'div[class*="description"]',
                'article p:first-of-type',
                'main p:first-of-type'
            ]

            for selector in content_selectors:
                elem = soup.select_one(selector)
                if elem:
                    desc = elem.get_text().strip()
                    if len(desc) > 50:
                        return desc

        except Exception as e:
            logger.error(f"Error extracting course description: {str(e)}")

        return None

    def _extract_units_from_html(self, soup: BeautifulSoup) -> List[Dict[str, Any]]:
        """Extract unit/lesson structure from HTML parsing (fallback method)"""
        units = []
        order_index = 0

        try:
            # Look for navigation links or unit cards in HTML
            unit_selectors = [
                'nav a[href*="/"]',  # Navigation links
                'div[class*="unit"] h2, div[class*="unit"] h3',  # Unit headings
                'section[class*="unit"]',  # Section elements
                'li[class*="unit"]',  # List items
                'a[class*="unit-link"]',  # Unit links
            ]

            found_units = []

            # Try each selector
            for selector in unit_selectors:
                elements = soup.select(selector)
                if elements and len(elements) >= 3:  # Likely found units if 3+ items
                    found_units = elements
                    logger.info(f"Found {len(elements)} units using selector: {selector}")
                    break

            # If we found some script tags with JSON, try those first
            script_tags = soup.find_all('script', type='application/json')
            for script in script_tags:
                try:
                    data = json.loads(script.string)
                    # Look for course structure in the JSON
                    if isinstance(data, dict):
                        # Khan Academy might have course data in various structures
                        # Try to find units/lessons in the data
                        if 'props' in data and isinstance(data['props'], dict):
                            pageProps = data['props'].get('pageProps', {})
                            if 'contentItems' in pageProps:
                                # Found structured content
                                for idx, item in enumerate(pageProps['contentItems'][:50]):
                                    if isinstance(item, dict):
                                        units.append({
                                            'title': item.get('title', f'Unit {idx + 1}'),
                                            'description': item.get('description', f'Complete Unit {idx + 1}'),
                                            'order_index': idx,
                                            'pillar': 'stem',
                                            'xp_value': 100,
                                            'is_required': True,
                                            'diploma_subjects': self._get_diploma_subjects_from_title(item.get('title', ''))
                                        })
                                if units:
                                    logger.info(f"Extracted {len(units)} units from embedded JSON")
                                    return units
                except (json.JSONDecodeError, KeyError, TypeError) as e:
                    continue

            # Strategy 2: Look for navigation links or unit cards in HTML
            # Khan Academy often uses nav elements or section cards for units

            # Try finding unit sections
            unit_selectors = [
                'nav a[href*="/"]',  # Navigation links
                'div[class*="unit"] h2, div[class*="unit"] h3',  # Unit headings
                'section[class*="unit"]',  # Section elements
                'li[class*="unit"]',  # List items
                'a[class*="unit-link"]',  # Unit links
            ]

            found_units = []

            # Try each selector
            for selector in unit_selectors:
                elements = soup.select(selector)
                if elements and len(elements) >= 3:  # Likely found units if 3+ items
                    found_units = elements
                    logger.info(f"Found {len(elements)} units using selector: {selector}")
                    break

            # Process found units
            for idx, elem in enumerate(found_units[:50]):  # Limit to 50 units max
                unit_title = None
                unit_description = None
                unit_url = None

                # Extract title
                if elem.name == 'a':
                    unit_title = elem.get_text().strip()
                    unit_url = elem.get('href')
                elif elem.name in ['h2', 'h3', 'h4']:
                    unit_title = elem.get_text().strip()
                    # Try to find associated link
                    link = elem.find_parent('a') or elem.find('a')
                    if link:
                        unit_url = link.get('href')
                else:
                    # Try to find title within element
                    title_elem = elem.find(['h2', 'h3', 'h4', 'a'])
                    if title_elem:
                        unit_title = title_elem.get_text().strip()
                        if title_elem.name == 'a':
                            unit_url = title_elem.get('href')

                # Clean up title
                if unit_title:
                    # Remove unit numbers like "Unit 1:" if present
                    unit_title = re.sub(r'^Unit\s+\d+:\s*', '', unit_title, flags=re.IGNORECASE)
                    # Remove common prefixes
                    unit_title = re.sub(r'^(Lesson|Chapter|Section)\s+\d+:\s*', '', unit_title, flags=re.IGNORECASE)
                    unit_title = unit_title.strip()

                # Try to extract description (often in sibling or child element)
                if elem.find_next_sibling(['p', 'div']):
                    desc_elem = elem.find_next_sibling(['p', 'div'])
                    desc_text = desc_elem.get_text().strip()
                    if desc_text and len(desc_text) > 20 and len(desc_text) < 500:
                        unit_description = desc_text

                # Skip if title is too short or looks like navigation
                if not unit_title or len(unit_title) < 3:
                    continue

                # Skip common navigation items
                skip_keywords = ['home', 'login', 'sign up', 'donate', 'about', 'help', 'search']
                if any(keyword in unit_title.lower() for keyword in skip_keywords):
                    continue

                units.append({
                    'title': unit_title,
                    'description': unit_description or f"Complete {unit_title}",
                    'order_index': order_index,
                    'pillar': 'stem',  # Default pillar for KA content
                    'xp_value': 100,  # Default XP per task
                    'is_required': True,
                    'diploma_subjects': self._get_diploma_subjects_from_title(unit_title),
                    'source_url': unit_url
                })
                order_index += 1

            # If no units found, create generic structure from title
            if not units:
                logger.warning("No units found via selectors, creating generic structure")
                # Create 5-10 generic units based on common course structure
                generic_units = [
                    "Introduction and Fundamentals",
                    "Core Concepts",
                    "Advanced Topics",
                    "Applications",
                    "Problem Solving",
                    "Review and Practice"
                ]
                for idx, title in enumerate(generic_units):
                    units.append({
                        'title': title,
                        'description': f"Learn about {title.lower()}",
                        'order_index': idx,
                        'pillar': 'stem',
                        'xp_value': 100,
                        'is_required': True,
                        'diploma_subjects': ['Electives']
                    })

        except Exception as e:
            logger.error(f"Error extracting units: {str(e)}")

        return units

    def _get_diploma_subjects_from_title(self, title: str) -> List[str]:
        """Map unit title to diploma subjects"""
        title_lower = title.lower()

        # Math-related keywords
        math_keywords = ['algebra', 'geometry', 'calculus', 'trigonometry', 'math', 'equation', 'function', 'graph']
        if any(kw in title_lower for kw in math_keywords):
            return ['Mathematics']

        # Science keywords
        science_keywords = ['biology', 'chemistry', 'physics', 'science', 'lab', 'experiment']
        if any(kw in title_lower for kw in science_keywords):
            return ['Science']

        # History/Social Studies
        history_keywords = ['history', 'government', 'civics', 'politics', 'society']
        if any(kw in title_lower for kw in history_keywords):
            return ['Social Studies']

        # Arts
        art_keywords = ['art', 'music', 'paint', 'draw', 'design', 'creative']
        if any(kw in title_lower for kw in art_keywords):
            return ['Arts']

        # Computer Science
        cs_keywords = ['programming', 'coding', 'computer', 'algorithm', 'software']
        if any(kw in title_lower for kw in cs_keywords):
            return ['Computer Science']

        return ['Electives']

    def map_subject_to_pillar(self, subject_area: str) -> str:
        """Map subject area to Optio pillar"""
        subject_lower = subject_area.lower()

        if any(kw in subject_lower for kw in ['math', 'science', 'physics', 'chemistry', 'biology', 'computer', 'engineering']):
            return 'stem'
        elif any(kw in subject_lower for kw in ['art', 'music', 'design', 'creative']):
            return 'art'
        elif any(kw in subject_lower for kw in ['history', 'government', 'civics', 'politics']):
            return 'civics'
        elif any(kw in subject_lower for kw in ['english', 'writing', 'communication', 'language']):
            return 'communication'
        elif any(kw in subject_lower for kw in ['health', 'wellness', 'fitness', 'mental']):
            return 'wellness'

        return 'stem'  # Default

    def get_rate_limit_delay(self) -> float:
        """Return delay in seconds between requests to be respectful"""
        return 2.0  # 2 second delay between requests


# Singleton instance
khan_academy_scraper = KhanAcademyScraper()
