-- Migration: Update user_task_evidence_documents to reference user_quest_tasks instead of quest_tasks_archived
-- This aligns the evidence document system with the V3 personalized task system

-- Drop the old foreign key constraint
ALTER TABLE public.user_task_evidence_documents
DROP CONSTRAINT IF EXISTS user_task_evidence_documents_task_id_fkey;

-- Add new foreign key constraint pointing to user_quest_tasks
ALTER TABLE public.user_task_evidence_documents
ADD CONSTRAINT user_task_evidence_documents_task_id_fkey
FOREIGN KEY (task_id) REFERENCES public.user_quest_tasks(id);
