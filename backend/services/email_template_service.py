"""
Email Template Service - Manages email templates from YAML and database

Handles:
- Loading templates from email_copy.yaml or database
- Rendering templates with Jinja2
- Syncing YAML templates to database
- Creating/updating custom templates
- Providing template previews
"""

import os
import logging
from typing import Optional, Dict, Any, List
from jinja2 import Environment, Template, TemplateError
from services.base_service import BaseService
from services.email_copy_loader import email_copy_loader
from repositories.crm_repository import CRMRepository

logger = logging.getLogger(__name__)


class EmailTemplateService(BaseService):
    """Service for managing email templates from YAML and database"""

    def __init__(self):
        super().__init__()
        self.crm_repo = CRMRepository()
        self.copy_loader = email_copy_loader

    def get_template(self, template_key: str) -> Optional[Dict[str, Any]]:
        """
        Get template by key from database or YAML fallback.

        Args:
            template_key: Template identifier (e.g., 'welcome', 'onboarding_day_1')

        Returns:
            Template dictionary with structure matching email_copy.yaml format
        """
        try:
            # Try database first
            db_template = self.crm_repo.get_template_by_key(template_key)
            if db_template:
                logger.info(f"Loaded template '{template_key}' from database")
                return {
                    'key': db_template['template_key'],
                    'name': db_template['name'],
                    'subject': db_template['subject'],
                    'data': db_template['template_data'],
                    'is_system': db_template.get('is_system', False),
                    'source': 'database'
                }

            # Fallback to YAML
            yaml_copy = self.copy_loader.get_email_copy(template_key)
            if yaml_copy:
                logger.info(f"Loaded template '{template_key}' from YAML")
                return {
                    'key': template_key,
                    'name': template_key.replace('_', ' ').title(),
                    'subject': yaml_copy.get('subject', ''),
                    'data': yaml_copy,
                    'is_system': True,
                    'source': 'yaml'
                }

            logger.warning(f"Template '{template_key}' not found in database or YAML")
            return None

        except Exception as e:
            logger.error(f"Error loading template '{template_key}': {e}")
            return None

    def list_templates(self, include_yaml: bool = True) -> List[Dict[str, Any]]:
        """
        List all available templates from database and optionally YAML.

        Args:
            include_yaml: If True, include templates from email_copy.yaml

        Returns:
            List of template dictionaries with metadata
        """
        templates = []

        try:
            # Get database templates
            db_templates = self.crm_repo.get_templates()
            for tpl in db_templates:
                templates.append({
                    'template_key': tpl['template_key'],
                    'key': tpl['template_key'],
                    'name': tpl['name'],
                    'subject': tpl['subject'],
                    'description': tpl.get('description', ''),
                    'is_system': tpl.get('is_system', False),
                    'source': 'database',
                    'created_at': tpl.get('created_at'),
                    'template_data': tpl.get('template_data'),  # Include full template_data for editing
                    'data': tpl.get('template_data')  # Alias for consistency
                })

            # Get YAML templates if requested
            if include_yaml:
                yaml_emails = self.copy_loader.copy_data.get('emails', {})
                db_keys = {tpl['key'] for tpl in templates}

                for key, data in yaml_emails.items():
                    if key not in db_keys:  # Don't duplicate if already in DB
                        templates.append({
                            'template_key': key,
                            'key': key,
                            'name': key.replace('_', ' ').title(),
                            'subject': data.get('subject', ''),
                            'description': f"System template from email_copy.yaml",
                            'is_system': True,
                            'source': 'yaml',
                            'created_at': None,
                            'template_data': data,  # Include YAML data for editing
                            'data': data  # Alias for consistency
                        })

            logger.info(f"Listed {len(templates)} templates")
            return templates

        except Exception as e:
            logger.error(f"Error listing templates: {e}")
            return []

    def create_template(
        self,
        template_key: str,
        name: str,
        subject: str,
        template_data: Dict[str, Any],
        description: Optional[str] = None,
        created_by: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a new custom template in database.

        Args:
            template_key: Unique identifier (e.g., 'custom_welcome')
            name: Display name
            subject: Email subject line
            template_data: Full template structure (YAML-like dict)
            description: Optional description
            created_by: UUID of creator

        Returns:
            Created template dictionary
        """
        try:
            # Check if key already exists
            existing = self.crm_repo.get_template_by_key(template_key)
            if existing:
                raise ValueError(f"Template with key '{template_key}' already exists")

            # Validate template_data structure
            self._validate_template_data(template_data)

            template_record = {
                'template_key': template_key,
                'name': name,
                'subject': subject,
                'description': description or '',
                'template_data': template_data,
                'is_system': False,  # Custom templates are never system
                'created_by': created_by
            }

            created = self.crm_repo.create_template(template_record)
            logger.info(f"Created custom template '{template_key}'")
            return created

        except Exception as e:
            logger.error(f"Error creating template '{template_key}': {e}")
            raise

    def update_template(
        self,
        template_key: str,
        updates: Dict[str, Any],
        created_by: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Update an existing template or create override for system templates.

        Args:
            template_key: Template identifier
            updates: Dictionary of fields to update
            created_by: UUID of user creating override (for system templates)

        Returns:
            Updated template dictionary
        """
        try:
            existing = self.crm_repo.get_template_by_key(template_key)

            # If system template, create override instead of updating
            if existing and existing.get('is_system'):
                logger.info(f"Creating override for system template '{template_key}'")

                # Validate template_data if being updated
                if 'template_data' in updates:
                    self._validate_template_data(updates['template_data'])

                # Mark existing as not override, create new override
                override_data = {
                    'template_key': template_key,
                    'name': updates.get('name', existing['name']),
                    'subject': updates.get('subject', existing['subject']),
                    'description': updates.get('description', existing.get('description', '')),
                    'template_data': updates.get('template_data', existing['template_data']),
                    'is_system': False,  # Override is not a system template
                    'is_override': True,  # Mark as override
                    'created_by': created_by
                }

                # Update existing template to mark it as overridden
                self.crm_repo.update_template(template_key, override_data)
                logger.info(f"Created override for system template '{template_key}'")
                return self.crm_repo.get_template_by_key(template_key)

            # For non-system templates, update normally
            if 'template_data' in updates:
                self._validate_template_data(updates['template_data'])

            updated = self.crm_repo.update_template(template_key, updates)
            logger.info(f"Updated template '{template_key}'")
            return updated

        except Exception as e:
            logger.error(f"Error updating template '{template_key}': {e}")
            raise

    def delete_template(self, template_key: str) -> bool:
        """
        Delete a custom template.

        Args:
            template_key: Template identifier

        Returns:
            True if deleted successfully
        """
        try:
            # This will automatically fail if system template due to repo check
            self.crm_repo.delete_template(template_key)
            logger.info(f"Deleted custom template '{template_key}'")
            return True

        except Exception as e:
            logger.error(f"Error deleting template '{template_key}': {e}")
            raise

    def render_preview(
        self,
        template_key: str,
        sample_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, str]:
        """
        Render a template with sample data for preview.

        Args:
            template_key: Template identifier
            sample_data: Sample variable values (e.g., {'user_name': 'John Doe'})

        Returns:
            Dictionary with rendered 'subject' and 'preview_text'
        """
        try:
            template = self.get_template(template_key)
            if not template:
                raise ValueError(f"Template '{template_key}' not found")

            # Default sample data
            default_data = {
                'user_name': 'Jane Student',
                'first_name': 'Jane',
                'last_name': 'Student',
                'email': 'jane@example.com',
                'total_xp': 1250,
                'quest_title': 'Introduction to Python',
                'xp_earned': 500,
                'confirmation_link': 'https://www.optioeducation.com/confirm/abc123',
                'reset_link': 'https://www.optioeducation.com/reset/abc123',
                'expiry_hours': 24
            }

            # Merge with provided sample data
            if sample_data:
                default_data.update(sample_data)

            # Render subject
            subject_template = Template(template['subject'])
            rendered_subject = subject_template.render(**default_data)

            # Render first paragraph as preview
            template_data = template['data']
            preview_parts = []

            if template_data.get('greeting'):
                greeting_template = Template(template_data['greeting'])
                preview_parts.append(greeting_template.render(**default_data))

            if template_data.get('paragraphs'):
                first_para = template_data['paragraphs'][0]
                para_template = Template(first_para)
                preview_parts.append(para_template.render(**default_data))

            preview_text = ' '.join(preview_parts)

            return {
                'subject': rendered_subject,
                'preview_text': preview_text,
                'variables_used': list(default_data.keys())
            }

        except TemplateError as e:
            logger.error(f"Template rendering error for '{template_key}': {e}")
            return {
                'subject': '[Error rendering subject]',
                'preview_text': f'Template error: {str(e)}',
                'variables_used': []
            }
        except Exception as e:
            logger.error(f"Error previewing template '{template_key}': {e}")
            raise

    def sync_yaml_to_database(self, template_keys: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Sync templates from email_copy.yaml to database.

        Args:
            template_keys: If provided, only sync these templates. Otherwise sync all.

        Returns:
            Dictionary with 'created', 'updated', 'errors' counts
        """
        results = {'created': 0, 'updated': 0, 'errors': 0, 'skipped': 0}

        try:
            yaml_emails = self.copy_loader.copy_data.get('emails', {})

            keys_to_sync = template_keys if template_keys else list(yaml_emails.keys())

            for key in keys_to_sync:
                try:
                    if key not in yaml_emails:
                        logger.warning(f"Template '{key}' not found in YAML, skipping")
                        results['skipped'] += 1
                        continue

                    yaml_data = yaml_emails[key]

                    # Check if already in database
                    existing = self.crm_repo.get_template_by_key(key)

                    if existing:
                        # Update if it's a system template (we own it)
                        if existing.get('is_system'):
                            self.crm_repo.update_template(key, {
                                'subject': yaml_data.get('subject', ''),
                                'template_data': yaml_data,
                                'name': key.replace('_', ' ').title()
                            })
                            results['updated'] += 1
                            logger.info(f"Updated system template '{key}' from YAML")
                        else:
                            # Don't overwrite custom templates
                            results['skipped'] += 1
                            logger.info(f"Skipped custom template '{key}'")
                    else:
                        # Create new system template
                        self.crm_repo.create_template({
                            'template_key': key,
                            'name': key.replace('_', ' ').title(),
                            'subject': yaml_data.get('subject', ''),
                            'description': f"System template synced from email_copy.yaml",
                            'template_data': yaml_data,
                            'is_system': True
                        })
                        results['created'] += 1
                        logger.info(f"Created system template '{key}' from YAML")

                except Exception as e:
                    logger.error(f"Error syncing template '{key}': {e}")
                    results['errors'] += 1

            logger.info(f"YAML sync complete: {results}")
            return results

        except Exception as e:
            logger.error(f"Error during YAML sync: {e}")
            raise

    def _validate_template_data(self, template_data: Dict[str, Any]) -> None:
        """
        Validate template data structure.

        Args:
            template_data: Template data dictionary

        Raises:
            ValueError: If validation fails
        """
        # Basic validation - ensure it's a dict
        if not isinstance(template_data, dict):
            raise ValueError("template_data must be a dictionary")

        # Check for required fields (following email_copy.yaml structure)
        # At minimum should have either 'paragraphs' or 'greeting'
        if not any(key in template_data for key in ['paragraphs', 'greeting', 'body_p1']):
            raise ValueError("template_data must contain at least one content field (paragraphs, greeting, or body_p1)")

        # Validate CTA structure if present
        if 'cta' in template_data:
            cta = template_data['cta']
            if not isinstance(cta, dict) or 'text' not in cta or 'url' not in cta:
                raise ValueError("cta must be a dict with 'text' and 'url' keys")

        logger.debug("Template data validation passed")
