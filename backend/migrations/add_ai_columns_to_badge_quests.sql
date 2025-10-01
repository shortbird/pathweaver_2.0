-- Add AI metadata columns to badge_quests table
-- This migration adds columns to store AI confidence scores and reasoning
-- when quests are automatically linked to badges via AI recommendations

-- Add ai_confidence column (0-100 score)
ALTER TABLE public.badge_quests
ADD COLUMN IF NOT EXISTS ai_confidence INTEGER;

-- Add ai_reasoning column (explanation of why the AI recommended this link)
ALTER TABLE public.badge_quests
ADD COLUMN IF NOT EXISTS ai_reasoning TEXT;

-- Add comment to document the purpose
COMMENT ON COLUMN public.badge_quests.ai_confidence IS 'AI confidence score (0-100) for this quest-badge link recommendation';
COMMENT ON COLUMN public.badge_quests.ai_reasoning IS 'AI explanation of why this quest is appropriate for this badge';

-- Create index for querying by AI confidence
CREATE INDEX IF NOT EXISTS idx_badge_quests_ai_confidence ON public.badge_quests(ai_confidence) WHERE ai_confidence IS NOT NULL;
