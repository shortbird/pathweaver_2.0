-- Migration: Clean up orphaned evidence documents and update foreign key constraint
-- This fixes the migration from legacy quest_tasks_archived to V3 user_quest_tasks

-- Step 1: Find and delete orphaned evidence documents that reference non-existent tasks
-- These are evidence documents created for tasks that don't exist in user_quest_tasks
DELETE FROM public.user_task_evidence_documents
WHERE task_id NOT IN (SELECT id FROM public.user_quest_tasks);

-- Step 2: Find and delete orphaned evidence document blocks
-- These are blocks whose parent document no longer exists
DELETE FROM public.evidence_document_blocks
WHERE document_id NOT IN (SELECT id FROM public.user_task_evidence_documents);

-- Step 3: Drop the old foreign key constraint
ALTER TABLE public.user_task_evidence_documents
DROP CONSTRAINT IF EXISTS user_task_evidence_documents_task_id_fkey;

-- Step 4: Add new foreign key constraint pointing to user_quest_tasks
ALTER TABLE public.user_task_evidence_documents
ADD CONSTRAINT user_task_evidence_documents_task_id_fkey
FOREIGN KEY (task_id) REFERENCES public.user_quest_tasks(id)
ON DELETE CASCADE;  -- Automatically delete evidence when task is deleted

-- Step 5: Add a unique constraint to prevent duplicate evidence documents per user per task
-- This prevents the 409 conflict errors
ALTER TABLE public.user_task_evidence_documents
ADD CONSTRAINT user_task_evidence_documents_user_task_unique
UNIQUE (user_id, task_id);
