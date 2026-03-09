"""
Credit Dashboard - Task merge endpoint.

Endpoints:
- POST /api/credit-dashboard/merge - Merge similar tasks into one
"""

from flask import request
from database import get_supabase_admin_singleton
from utils.auth.decorators import require_role
from utils.api_response_v1 import success_response, error_response
from datetime import datetime

from utils.logger import get_logger

logger = get_logger(__name__)

from . import bp


@bp.route('/merge', methods=['POST'])
@require_role('advisor', 'accreditor', 'superadmin')
def merge_tasks(user_id: str):
    """
    Merge multiple task completions into a single survivor.
    Consolidates evidence blocks and updates XP.
    """
    try:
        admin_supabase = get_supabase_admin_singleton()
        data = request.get_json() or {}

        completion_ids = data.get('completion_ids', [])
        survivor_id = data.get('survivor_id')
        final_xp = data.get('final_xp')
        reason = (data.get('reason') or '').strip()

        # Validation
        if not completion_ids or len(completion_ids) < 2:
            return error_response(code='VALIDATION_ERROR', message='At least 2 completions required for merge', status=400)
        if not survivor_id or survivor_id not in completion_ids:
            return error_response(code='VALIDATION_ERROR', message='Survivor must be one of the selected completions', status=400)
        if final_xp is None or final_xp < 0:
            return error_response(code='VALIDATION_ERROR', message='Final XP value is required', status=400)

        # Fetch all completions
        completions = admin_supabase.table('quest_task_completions') \
            .select('id, user_id, user_quest_task_id, diploma_status') \
            .in_('id', completion_ids) \
            .execute()

        if not completions.data or len(completions.data) != len(completion_ids):
            return error_response(code='NOT_FOUND', message='One or more completions not found', status=404)

        # Verify all belong to same student
        student_ids = set(c['user_id'] for c in completions.data)
        if len(student_ids) != 1:
            return error_response(code='VALIDATION_ERROR', message='All completions must belong to the same student', status=400)

        student_id = student_ids.pop()
        now = datetime.utcnow().isoformat()

        # Create merge record
        merge_result = admin_supabase.table('task_merges').insert({
            'merged_by': user_id,
            'student_id': student_id,
            'survivor_completion_id': survivor_id,
            'final_xp': final_xp,
            'merge_reason': reason
        }).execute()

        merge_id = merge_result.data[0]['id']

        # Create source records
        for c in completions.data:
            task_id = c.get('user_quest_task_id')
            original_xp = 0
            if task_id:
                task = admin_supabase.table('user_quest_tasks') \
                    .select('xp_value') \
                    .eq('id', task_id) \
                    .single() \
                    .execute()
                original_xp = (task.data or {}).get('xp_value', 0)

            admin_supabase.table('task_merge_sources').insert({
                'merge_id': merge_id,
                'completion_id': c['id'],
                'original_xp': original_xp
            }).execute()

        # Consolidate evidence: copy blocks from merged tasks into survivor's document
        survivor_completion = next(c for c in completions.data if c['id'] == survivor_id)
        survivor_task_id = survivor_completion.get('user_quest_task_id')

        if survivor_task_id:
            # Get or create survivor's evidence document
            survivor_doc = admin_supabase.table('user_task_evidence_documents') \
                .select('id') \
                .eq('task_id', survivor_task_id) \
                .eq('user_id', student_id) \
                .limit(1) \
                .execute()

            survivor_doc_id = survivor_doc.data[0]['id'] if survivor_doc.data else None

            if survivor_doc_id:
                # Get current max order_index in survivor doc
                max_order = admin_supabase.table('evidence_document_blocks') \
                    .select('order_index') \
                    .eq('document_id', survivor_doc_id) \
                    .order('order_index', desc=True) \
                    .limit(1) \
                    .execute()

                current_order = (max_order.data[0]['order_index'] if max_order.data else 0) + 1

                # For each non-survivor completion, copy evidence blocks
                for c in completions.data:
                    if c['id'] == survivor_id:
                        continue

                    source_task_id = c.get('user_quest_task_id')
                    if not source_task_id:
                        continue

                    # Get source task title for separator
                    source_task = admin_supabase.table('user_quest_tasks') \
                        .select('title') \
                        .eq('id', source_task_id) \
                        .single() \
                        .execute()
                    source_title = (source_task.data or {}).get('title', 'Unknown Task')

                    # Get source document
                    source_doc = admin_supabase.table('user_task_evidence_documents') \
                        .select('id') \
                        .eq('task_id', source_task_id) \
                        .eq('user_id', student_id) \
                        .limit(1) \
                        .execute()

                    if not source_doc.data:
                        continue

                    source_doc_id = source_doc.data[0]['id']

                    # Insert separator block
                    admin_supabase.table('evidence_document_blocks').insert({
                        'document_id': survivor_doc_id,
                        'block_type': 'text',
                        'content': f'--- Merged from: {source_title} ---',
                        'order_index': current_order
                    }).execute()
                    current_order += 1

                    # Copy all blocks from source document
                    source_blocks = admin_supabase.table('evidence_document_blocks') \
                        .select('block_type, content, metadata') \
                        .eq('document_id', source_doc_id) \
                        .order('order_index') \
                        .execute()

                    for block in (source_blocks.data or []):
                        admin_supabase.table('evidence_document_blocks').insert({
                            'document_id': survivor_doc_id,
                            'block_type': block['block_type'],
                            'content': block.get('content'),
                            'metadata': block.get('metadata'),
                            'order_index': current_order
                        }).execute()
                        current_order += 1

        # Update survivor's XP value
        if survivor_task_id:
            admin_supabase.table('user_quest_tasks').update({
                'xp_value': final_xp
            }).eq('id', survivor_task_id).execute()

        # Mark non-survivor completions as merged
        for c in completions.data:
            if c['id'] != survivor_id:
                admin_supabase.table('quest_task_completions').update({
                    'diploma_status': 'merged',
                    'merged_into': survivor_id
                }).eq('id', c['id']).execute()

        logger.info(f"User {user_id[:8]} merged {len(completion_ids)} completions for student {student_id[:8]}, survivor={survivor_id[:8]}, final_xp={final_xp}")

        return success_response(data={
            'merge_id': merge_id,
            'survivor_id': survivor_id,
            'merged_count': len(completion_ids) - 1,
            'final_xp': final_xp
        })

    except Exception as e:
        logger.error(f"Error merging tasks: {str(e)}")
        return error_response(code='MERGE_ERROR', message='Failed to merge tasks', status=500)
