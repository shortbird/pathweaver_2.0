"""
Khan Academy Course Scraper Service

Scrapes Khan Academy course structures and creates Optio course quests.
Extracts course titles, descriptions, units (as tasks) with descriptions.
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
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        })
        # Cache scraped courses for 24 hours
        self.cache = {}
        self.cache_duration = timedelta(hours=24)

    def scrape_course(self, course_url: str, subject_area: str = "Math") -> Optional[Dict[str, Any]]:
        """
        Scrape a Khan Academy course and return structured data.

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

            # Fetch page HTML
            response = self.session.get(course_url, timeout=15)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, 'lxml')

            # Extract course title and description
            course_title = self._extract_course_title(soup, course_url)
            course_description = self._extract_course_description(soup)

            # Extract units (tasks)
            units = self._extract_units(soup)

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

    def _extract_units(self, soup: BeautifulSoup) -> List[Dict[str, Any]]:
        """Extract unit/lesson structure from course page"""
        units = []
        order_index = 0

        try:
            # Strategy 1: Look for navigation links or unit cards
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
