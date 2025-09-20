-- Complete Migration Script for Multi-Format Evidence Documents
-- Run this in Supabase SQL Editor

-- =====================================================
-- STEP 1: Create new tables for multi-format evidence
-- =====================================================

-- Evidence documents table (replaces quest_task_completions)
CREATE TABLE IF NOT EXISTS user_task_evidence_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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

-- =====================================================
-- STEP 2: Create indexes for performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_evidence_documents_user_id ON user_task_evidence_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_evidence_documents_quest_id ON user_task_evidence_documents(quest_id);
CREATE INDEX IF NOT EXISTS idx_evidence_documents_task_id ON user_task_evidence_documents(task_id);
CREATE INDEX IF NOT EXISTS idx_evidence_documents_status ON user_task_evidence_documents(status);
CREATE INDEX IF NOT EXISTS idx_evidence_documents_completed_at ON user_task_evidence_documents(completed_at);

CREATE INDEX IF NOT EXISTS idx_evidence_blocks_document_id ON evidence_document_blocks(document_id);
CREATE INDEX IF NOT EXISTS idx_evidence_blocks_order ON evidence_document_blocks(document_id, order_index);

-- =====================================================
-- STEP 3: Create helper functions
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_evidence_document_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS evidence_documents_updated_at ON user_task_evidence_documents;
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
DROP TRIGGER IF EXISTS evidence_blocks_reorder_insert ON evidence_document_blocks;
CREATE TRIGGER evidence_blocks_reorder_insert
    AFTER INSERT ON evidence_document_blocks
    FOR EACH ROW
    EXECUTE FUNCTION reorder_evidence_blocks();

DROP TRIGGER IF EXISTS evidence_blocks_reorder_delete ON evidence_document_blocks;
CREATE TRIGGER evidence_blocks_reorder_delete
    AFTER DELETE ON evidence_document_blocks
    FOR EACH ROW
    EXECUTE FUNCTION reorder_evidence_blocks();

-- =====================================================
-- STEP 4: Migrate existing evidence data
-- =====================================================

-- Migrate from user_quest_tasks (V3 system) to new multi-format system
INSERT INTO user_task_evidence_documents (
    user_id,
    quest_id,
    task_id,
    status,
    created_at,
    updated_at,
    completed_at
)
SELECT DISTINCT
    uqt.user_id,
    qt.quest_id,
    uqt.quest_task_id as task_id,
    'completed' as status,
    uqt.completed_at as created_at,
    uqt.completed_at as updated_at,
    uqt.completed_at
FROM user_quest_tasks uqt
JOIN quest_tasks qt ON qt.id = uqt.quest_task_id
WHERE NOT EXISTS (
    SELECT 1 FROM user_task_evidence_documents uted
    WHERE uted.user_id = uqt.user_id
    AND uted.task_id = uqt.quest_task_id
);

-- Create evidence blocks from existing evidence
INSERT INTO evidence_document_blocks (
    document_id,
    block_type,
    content,
    order_index,
    created_at
)
SELECT
    uted.id as document_id,
    CASE
        WHEN uqt.evidence_type = 'text' THEN 'text'
        WHEN uqt.evidence_type = 'link' THEN 'link'
        WHEN uqt.evidence_type = 'video' THEN 'video'
        WHEN uqt.evidence_type = 'image' THEN 'image'
        WHEN uqt.evidence_type = 'document' THEN 'document'
        ELSE 'text'
    END as block_type,
    CASE
        WHEN uqt.evidence_type = 'text' THEN
            jsonb_build_object('text', uqt.evidence_content)
        WHEN uqt.evidence_type IN ('link', 'video') THEN
            jsonb_build_object('url', uqt.evidence_content, 'title', '')
        WHEN uqt.evidence_type IN ('image', 'document') THEN
            jsonb_build_object('url', uqt.evidence_content, 'alt', '', 'caption', '')
        ELSE
            jsonb_build_object('text', uqt.evidence_content)
    END as content,
    0 as order_index,
    uqt.completed_at as created_at
FROM user_task_evidence_documents uted
JOIN user_quest_tasks uqt ON uqt.user_id = uted.user_id AND uqt.quest_task_id = uted.task_id
WHERE NOT EXISTS (
    SELECT 1 FROM evidence_document_blocks edb
    WHERE edb.document_id = uted.id
);

-- Migrate from quest_task_completions (older system) to new multi-format system
INSERT INTO user_task_evidence_documents (
    user_id,
    quest_id,
    task_id,
    status,
    created_at,
    updated_at,
    completed_at
)
SELECT DISTINCT
    qtc.user_id,
    qtc.quest_id,
    qtc.task_id,
    'completed' as status,
    qtc.completed_at as created_at,
    qtc.completed_at as updated_at,
    qtc.completed_at
FROM quest_task_completions qtc
WHERE NOT EXISTS (
    SELECT 1 FROM user_task_evidence_documents uted
    WHERE uted.user_id = qtc.user_id
    AND uted.task_id = qtc.task_id
);

-- Create evidence blocks from quest_task_completions
INSERT INTO evidence_document_blocks (
    document_id,
    block_type,
    content,
    order_index,
    created_at
)
SELECT
    uted.id as document_id,
    CASE
        WHEN qtc.evidence_url IS NOT NULL AND qtc.evidence_url != '' THEN
            CASE
                WHEN qtc.evidence_url LIKE '%.jpg' OR qtc.evidence_url LIKE '%.jpeg' OR qtc.evidence_url LIKE '%.png' OR qtc.evidence_url LIKE '%.gif' THEN 'image'
                WHEN qtc.evidence_url LIKE '%.pdf' OR qtc.evidence_url LIKE '%.doc%' THEN 'document'
                WHEN qtc.evidence_url LIKE '%youtube%' OR qtc.evidence_url LIKE '%vimeo%' THEN 'video'
                ELSE 'link'
            END
        ELSE 'text'
    END as block_type,
    CASE
        WHEN qtc.evidence_url IS NOT NULL AND qtc.evidence_url != '' THEN
            CASE
                WHEN qtc.evidence_url LIKE '%.jpg' OR qtc.evidence_url LIKE '%.jpeg' OR qtc.evidence_url LIKE '%.png' OR qtc.evidence_url LIKE '%.gif' THEN
                    jsonb_build_object('url', qtc.evidence_url, 'alt', 'Task evidence', 'caption', COALESCE(qtc.evidence_text, ''))
                WHEN qtc.evidence_url LIKE '%.pdf' OR qtc.evidence_url LIKE '%.doc%' THEN
                    jsonb_build_object('url', qtc.evidence_url, 'filename', 'Evidence document', 'title', COALESCE(qtc.evidence_text, ''))
                ELSE
                    jsonb_build_object('url', qtc.evidence_url, 'title', COALESCE(qtc.evidence_text, ''), 'description', '')
            END
        ELSE
            jsonb_build_object('text', COALESCE(qtc.evidence_text, 'Task completed'))
    END as content,
    CASE WHEN qtc.evidence_text IS NOT NULL AND qtc.evidence_text != '' AND qtc.evidence_url IS NOT NULL AND qtc.evidence_url != '' THEN 1 ELSE 0 END as order_index,
    qtc.completed_at as created_at
FROM user_task_evidence_documents uted
JOIN quest_task_completions qtc ON qtc.user_id = uted.user_id AND qtc.task_id = uted.task_id
WHERE NOT EXISTS (
    SELECT 1 FROM evidence_document_blocks edb
    WHERE edb.document_id = uted.id
)
AND (qtc.evidence_url IS NOT NULL OR qtc.evidence_text IS NOT NULL);

-- Add text block for evidence_text when there's also a URL
INSERT INTO evidence_document_blocks (
    document_id,
    block_type,
    content,
    order_index,
    created_at
)
SELECT
    uted.id as document_id,
    'text' as block_type,
    jsonb_build_object('text', qtc.evidence_text) as content,
    0 as order_index,
    qtc.completed_at as created_at
FROM user_task_evidence_documents uted
JOIN quest_task_completions qtc ON qtc.user_id = uted.user_id AND qtc.task_id = uted.task_id
WHERE qtc.evidence_text IS NOT NULL
AND qtc.evidence_text != ''
AND qtc.evidence_url IS NOT NULL
AND qtc.evidence_url != ''
AND NOT EXISTS (
    SELECT 1 FROM evidence_document_blocks edb
    WHERE edb.document_id = uted.id AND edb.block_type = 'text'
);

-- =====================================================
-- STEP 5: Enable Row Level Security
-- =====================================================

-- Enable RLS on new tables
ALTER TABLE user_task_evidence_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_document_blocks ENABLE ROW LEVEL SECURITY;

-- Policy for user_task_evidence_documents: users can only access their own documents
CREATE POLICY "Users can view their own evidence documents" ON user_task_evidence_documents
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own evidence documents" ON user_task_evidence_documents
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own evidence documents" ON user_task_evidence_documents
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own evidence documents" ON user_task_evidence_documents
    FOR DELETE USING (auth.uid() = user_id);

-- Policy for evidence_document_blocks: users can only access blocks from their own documents
CREATE POLICY "Users can view blocks from their own documents" ON evidence_document_blocks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_task_evidence_documents uted
            WHERE uted.id = document_id AND uted.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert blocks into their own documents" ON evidence_document_blocks
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_task_evidence_documents uted
            WHERE uted.id = document_id AND uted.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update blocks in their own documents" ON evidence_document_blocks
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM user_task_evidence_documents uted
            WHERE uted.id = document_id AND uted.user_id = auth.uid()
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_task_evidence_documents uted
            WHERE uted.id = document_id AND uted.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete blocks from their own documents" ON evidence_document_blocks
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM user_task_evidence_documents uted
            WHERE uted.id = document_id AND uted.user_id = auth.uid()
        )
    );

-- Public viewing policy for diplomas/portfolios (admin can view all)
CREATE POLICY "Public can view completed evidence for diplomas" ON user_task_evidence_documents
    FOR SELECT USING (
        status = 'completed' AND
        EXISTS (
            SELECT 1 FROM diplomas d
            WHERE d.user_id = user_task_evidence_documents.user_id
            AND d.is_public = true
        )
    );

CREATE POLICY "Public can view blocks from public completed documents" ON evidence_document_blocks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_task_evidence_documents uted
            JOIN diplomas d ON d.user_id = uted.user_id
            WHERE uted.id = document_id
            AND uted.status = 'completed'
            AND d.is_public = true
        )
    );

-- =====================================================
-- STEP 6: Add comments for documentation
-- =====================================================

COMMENT ON TABLE user_task_evidence_documents IS 'Stores evidence documents for task completion with draft/completed status';
COMMENT ON TABLE evidence_document_blocks IS 'Individual content blocks within evidence documents (text, image, video, etc.)';
COMMENT ON COLUMN evidence_document_blocks.content IS 'JSONB storing type-specific content data';
COMMENT ON COLUMN evidence_document_blocks.order_index IS 'Determines display order of blocks within document';

-- =====================================================
-- STEP 7: Verify migration
-- =====================================================

-- Display migration results
SELECT
    'Migration Summary' as step,
    (SELECT COUNT(*) FROM user_task_evidence_documents) as total_documents,
    (SELECT COUNT(*) FROM evidence_document_blocks) as total_blocks,
    (SELECT COUNT(*) FROM user_task_evidence_documents WHERE status = 'completed') as completed_documents,
    (SELECT COUNT(DISTINCT user_id) FROM user_task_evidence_documents) as users_with_evidence;

-- Show sample of migrated data
SELECT
    'Sample Documents' as info,
    uted.id,
    uted.user_id,
    uted.status,
    uted.created_at,
    COUNT(edb.id) as block_count
FROM user_task_evidence_documents uted
LEFT JOIN evidence_document_blocks edb ON edb.document_id = uted.id
GROUP BY uted.id, uted.user_id, uted.status, uted.created_at
ORDER BY uted.created_at DESC
LIMIT 10;