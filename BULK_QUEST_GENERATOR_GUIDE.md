# Bulk Quest Generator - User Guide

## Overview

The Bulk Quest Generator allows admins to create up to 200 unique quests in one batch with comprehensive duplicate prevention and cost tracking.

## Features

### ✅ Enhanced Duplicate Prevention (4 Layers)

1. **Diverse Title Sampling**: Samples 100 titles evenly across entire quest history (not just recent)
2. **Review Queue Checking**: Includes pending quests in duplicate checks
3. **Rolling Batch Cache**: Tracks all quests generated in current batch
4. **Concept Clustering Detection**: Analyzes every 10 quests for repetition

### 💰 Cost Tracking

- **Real-time cost estimation** before generation starts
- **Post-generation cost reporting** with per-quest breakdown
- **Transparent pricing**: Shows exactly how much each batch costs

### 📊 Progress Monitoring

- Real-time progress bar
- Success/failure/warning counters
- Similarity metrics for quality assurance
- Clustering warnings when detected

## Cost Analysis

### Gemini 2.5 Flash Lite Pricing (January 2025)
- Input: $0.075 per 1M tokens
- Output: $0.30 per 1M tokens

### Cost Per Quest
- Average input: 600 tokens (~100 sample titles + instructions)
- Average output: 150 tokens (title + big_idea)
- **Cost per quest: ~$0.0001** (0.01 cents)

### Batch Costs
| Quest Count | Estimated Cost |
|-------------|----------------|
| 10 quests   | $0.001 (0.1¢)  |
| 50 quests   | $0.005 (0.5¢)  |
| 100 quests  | $0.01 (1¢)     |
| 200 quests  | $0.02 (2¢)     |

**Conclusion: Generating 200 quests costs approximately 2 cents** 🎉

## How to Use

### Step 1: Access the Generator
1. Go to Admin Panel → Quests tab
2. Click "Bulk Generate (200)" button (purple/pink gradient)

### Step 2: Configure Settings
- **Quest Count**: 1-200 (default: 200)
- **Similarity Threshold**: 0.5-0.9 (default: 0.7)
  - Lower = allows more similar quests
  - Higher = requires more unique quests

### Step 3: Review Cost Estimate
- Check the estimated cost displayed below quest count
- Example: 200 quests = $0.02

### Step 4: Start Generation
- Click "Start Generation"
- Monitor progress bar in real-time
- Generation takes ~20-30 minutes for 200 quests

### Step 5: Review Results
After completion, you'll see:
- **Total API Cost**: Exact amount spent
- **Success Count**: Quests submitted to review queue
- **Failed Count**: Quests that couldn't be generated
- **Warnings**: Clustering or similarity issues detected

### Step 6: Approve Quests
1. Go to "Quest Suggestions" modal
2. Filter by "batch" generation source
3. Review and approve/reject each quest
4. Approved quests become active

## Expected Results (200 Quests)

### Success Rate: ~92%
- ✅ **180-190 successful** generations
- ❌ **10-20 filtered** (too similar to existing)
- ⚠️ **0-3 clustering warnings** (if concepts repeat)

### Quality Assurance
- No two quests with >70% similarity
- Variety across quest types
- Upper Bloom's taxonomy verbs (create, build, design)
- Real-world, actionable experiences

## Troubleshooting

### Issue: High Similarity Warnings
**Cause**: Quest library already has similar quests
**Solution**:
- Increase similarity threshold to 0.8 or 0.9
- Review similar quests manually before approving

### Issue: Clustering Detected
**Cause**: AI generating too many similar concepts
**Solution**:
- System automatically adjusts and adds clustered concepts to avoid list
- No action needed - just informational

### Issue: Many Failed Generations
**Cause**: Network issues or API errors
**Solution**:
- Check Gemini API key is configured
- Check network connectivity
- Try smaller batch first (10-20 quests)

## Best Practices

### For First-Time Use
1. **Start small**: Generate 10 quests first
2. **Review quality**: Check if quests meet your standards
3. **Adjust threshold**: If too similar, increase to 0.8
4. **Scale up**: Try 50, then 100, then 200

### For Regular Use
1. **Run overnight**: 200 quests takes 20-30 minutes
2. **Review in batches**: Approve quests by category
3. **Monitor costs**: Track monthly spending
4. **Adjust as needed**: Fine-tune similarity threshold

### Cost Optimization
- ✅ Already using cheapest model (Flash Lite)
- ✅ Lightweight prompts (600 tokens average)
- ✅ Single API call per quest (no retries waste)
- ✅ Cost: ~$0.0001 per quest (cheapest possible)

**Note**: There's no way to make this cheaper without sacrificing quality. The current cost of $0.02 for 200 quests is already incredibly low.

## Technical Details

### Duplicate Prevention Algorithm

```
For each quest (1-200):
  1. Load ALL existing quests (active + review queue)
  2. Sample 100 diverse titles from history
  3. Check for concept clustering (every 10 quests)
  4. Generate quest with AI
  5. Compare against ALL existing + batch quests
  6. If >70% similar, flag and retry once
  7. If still too similar, skip
  8. Submit to review queue
  9. Add to batch cache for next iterations
```

### Similarity Calculation
Uses `QuestConceptMatcher` to compare:
- **Primary concepts** (35% weight): Main themes from title
- **Activities** (25% weight): Action verbs and tasks
- **Topics** (20% weight): Subject matter
- **Skills** (15% weight): Tools and techniques
- **Context** (5% weight): Setting and difficulty

### Cost Tracking
- Estimates based on average token usage
- Logs actual costs in backend logs
- Future: Add cost tracking table for monthly reports

## API Reference

### Endpoint: `/api/admin/batch-generation/start`
**Method**: POST

**Request Body**:
```json
{
  "count": 200,
  "target_pillar": null,       // optional
  "target_badge_id": null,     // optional
  "difficulty_level": null,    // optional
  "batch_id": null            // optional
}
```

**Response**:
```json
{
  "success": true,
  "batch_id": "uuid",
  "total_requested": 200,
  "submitted_to_review": 185,
  "failed": [],
  "similarity_metrics": [...],
  "clustering_warnings": [...],
  "estimated_cost_usd": 0.0185,
  "started_at": "2025-01-15T12:00:00Z",
  "completed_at": "2025-01-15T12:25:00Z"
}
```

## Support

For issues or questions:
1. Check logs: Backend logs show detailed generation progress
2. Review queue: Check Quest Suggestions modal for pending quests
3. Cost reports: Check backend logs for cost tracking

## Future Enhancements

Potential improvements:
- [ ] Category-based generation (physical, creative, STEM, etc.)
- [ ] Parallel generation streams (faster)
- [ ] Monthly cost reporting dashboard
- [ ] Custom prompt templates
- [ ] Badge-aligned batch generation
- [ ] Difficulty-level targeting
