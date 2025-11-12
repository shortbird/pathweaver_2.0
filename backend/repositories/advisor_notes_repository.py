"""
Repository for advisor notes data access.
Handles all database operations for confidential advisor notes.
"""

from typing import Dict, List, Optional
from datetime import datetime
from database import get_supabase_admin_client


class AdvisorNotesRepository:
    """Repository for managing advisor notes data"""

    def __init__(self):
        self.supabase = get_supabase_admin_client()

    def create_note(self, note_data: Dict) -> Dict:
        """
        Create a new advisor note.

        Args:
            note_data: Dictionary with advisor_id, subject_id, note_text

        Returns:
            Created note record
        """
        response = self.supabase.table('advisor_notes')\
            .insert(note_data)\
            .execute()

        return response.data[0] if response.data else None

    def get_notes_for_subject(
        self,
        subject_id: str,
        advisor_id: Optional[str] = None
    ) -> List[Dict]:
        """
        Get all notes for a specific subject (student or parent).

        Args:
            subject_id: UUID of the subject (student/parent)
            advisor_id: Optional UUID of advisor (filters to their notes only, or admin sees all)

        Returns:
            List of note records ordered by creation date (newest first)
        """
        query = self.supabase.table('advisor_notes')\
            .select('*, users!advisor_notes_advisor_id_fkey(display_name, first_name, last_name)')\
            .eq('subject_id', subject_id)\
            .order('created_at', desc=True)

        if advisor_id:
            query = query.eq('advisor_id', advisor_id)

        response = query.execute()
        return response.data if response.data else []

    def get_note_by_id(self, note_id: str) -> Optional[Dict]:
        """
        Get a specific note by ID.

        Args:
            note_id: UUID of the note

        Returns:
            Note record or None
        """
        response = self.supabase.table('advisor_notes')\
            .select('*')\
            .eq('id', note_id)\
            .single()\
            .execute()

        return response.data if response.data else None

    def update_note(self, note_id: str, note_text: str) -> Dict:
        """
        Update a note's text.

        Args:
            note_id: UUID of the note
            note_text: New note text

        Returns:
            Updated note record
        """
        response = self.supabase.table('advisor_notes')\
            .update({'note_text': note_text})\
            .eq('id', note_id)\
            .execute()

        return response.data[0] if response.data else None

    def delete_note(self, note_id: str) -> bool:
        """
        Delete a note.

        Args:
            note_id: UUID of the note

        Returns:
            True if deleted successfully
        """
        response = self.supabase.table('advisor_notes')\
            .delete()\
            .eq('id', note_id)\
            .execute()

        return bool(response.data)

    def get_note_count_for_subject(self, subject_id: str) -> int:
        """
        Get count of notes for a subject.

        Args:
            subject_id: UUID of the subject

        Returns:
            Number of notes
        """
        response = self.supabase.table('advisor_notes')\
            .select('id', count='exact')\
            .eq('subject_id', subject_id)\
            .execute()

        return response.count if hasattr(response, 'count') else 0
