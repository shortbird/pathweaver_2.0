-- Migration: Add multi-format evidence document system
-- Created: 2025-01-20
-- Purpose: Replace single-format evidence with multi-format document system

-- Evidence documents table (replaces quest_task_completions)
CREATE TABLE IF NOT EXISTS user_task_evidence_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES quest_tasks(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE NULL,

    -- Ensure one document per user per task
    UNIQUE(user_id, task_id)
);

-- Content blocks within evidence documents
CREATE TABLE IF NOT EXISTS evidence_document_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES user_task_evidence_documents(id) ON DELETE CASCADE,
    block_type TEXT NOT NULL CHECK (block_type IN ('text', 'image', 'video', 'link', 'document')),
    content JSONB NOT NULL,
    order_index INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Ensure proper ordering within document
    UNIQUE(document_id, order_index)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_evidence_documents_user_id ON user_task_evidence_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_evidence_documents_quest_id ON user_task_evidence_documents(quest_id);
CREATE INDEX IF NOT EXISTS idx_evidence_documents_task_id ON user_task_evidence_documents(task_id);
CREATE INDEX IF NOT EXISTS idx_evidence_documents_status ON user_task_evidence_documents(status);
CREATE INDEX IF NOT EXISTS idx_evidence_documents_completed_at ON user_task_evidence_documents(completed_at);

CREATE INDEX IF NOT EXISTS idx_evidence_blocks_document_id ON evidence_document_blocks(document_id);
CREATE INDEX IF NOT EXISTS idx_evidence_blocks_order ON evidence_document_blocks(document_id, order_index);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_evidence_document_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER evidence_documents_updated_at
    BEFORE UPDATE ON user_task_evidence_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_evidence_document_updated_at();

-- Function to reorder blocks when inserting/deleting
CREATE OR REPLACE FUNCTION reorder_evidence_blocks()
RETURNS TRIGGER AS $$
BEGIN
    -- On insert, shift existing blocks down if necessary
    IF TG_OP = 'INSERT' THEN
        UPDATE evidence_document_blocks
        SET order_index = order_index + 1
        WHERE document_id = NEW.document_id
        AND order_index >= NEW.order_index
        AND id != NEW.id;
        RETURN NEW;
    END IF;

    -- On delete, shift blocks up to fill gap
    IF TG_OP = 'DELETE' THEN
        UPDATE evidence_document_blocks
        SET order_index = order_index - 1
        WHERE document_id = OLD.document_id
        AND order_index > OLD.order_index;
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Triggers for block reordering
CREATE TRIGGER evidence_blocks_reorder_insert
    AFTER INSERT ON evidence_document_blocks
    FOR EACH ROW
    EXECUTE FUNCTION reorder_evidence_blocks();

CREATE TRIGGER evidence_blocks_reorder_delete
    AFTER DELETE ON evidence_document_blocks
    FOR EACH ROW
    EXECUTE FUNCTION reorder_evidence_blocks();

-- Comments for documentation
COMMENT ON TABLE user_task_evidence_documents IS 'Stores evidence documents for task completion with draft/completed status';
COMMENT ON TABLE evidence_document_blocks IS 'Individual content blocks within evidence documents (text, image, video, etc.)';
COMMENT ON COLUMN evidence_document_blocks.content IS 'JSONB storing type-specific content data';
COMMENT ON COLUMN evidence_document_blocks.order_index IS 'Determines display order of blocks within document';