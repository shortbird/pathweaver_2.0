/**
 * Shared pillar utilities used across student overview views.
 */

export const PILLAR_DEFINITIONS = [
  { id: 'stem', name: 'STEM', description: 'Science, technology, engineering, and mathematics' },
  { id: 'communication', name: 'Communication', description: 'Writing, speaking, storytelling, and presentation' },
  { id: 'art', name: 'Art', description: 'Visual arts, music, design, and creative expression' },
  { id: 'wellness', name: 'Wellness', description: 'Health, fitness, mindfulness, and personal growth' },
  { id: 'civics', name: 'Civics', description: 'Citizenship, community, social impact, and leadership' }
];

const LEGACY_PILLAR_MAPPING = {
  'stem_logic': 'stem',
  'language_communication': 'communication',
  'arts_creativity': 'art',
  'life_wellness': 'wellness',
  'society_culture': 'civics',
  'thinking_skills': 'stem',
  'creativity': 'art',
  'practical_skills': 'wellness',
  'general': 'stem'
};

const VALID_PILLARS = ['stem', 'wellness', 'communication', 'civics', 'art'];

export function mapPillarNameToId(pillarName) {
  if (!pillarName) return 'stem';

  const lowerName = pillarName.toLowerCase ? pillarName.toLowerCase() : pillarName;

  if (VALID_PILLARS.includes(lowerName)) {
    return lowerName;
  }

  return LEGACY_PILLAR_MAPPING[lowerName] || 'stem';
}

export function buildQuestOrbs(completedQuests) {
  return completedQuests.map((achievement) => {
    const xpDistribution = {};
    let questTotalXp = 0;

    if (achievement.task_evidence) {
      Object.values(achievement.task_evidence).forEach((taskInfo) => {
        const pillarName = taskInfo.pillar;
        const xp = taskInfo.xp_awarded || 0;
        if (pillarName && xp > 0) {
          const pillarId = mapPillarNameToId(pillarName);
          xpDistribution[pillarId] = (xpDistribution[pillarId] || 0) + xp;
          questTotalXp += xp;
        }
      });
    }

    if (questTotalXp === 0 && achievement.total_xp_earned) {
      questTotalXp = achievement.total_xp_earned;
      if (Object.keys(xpDistribution).length === 0) {
        xpDistribution['stem'] = questTotalXp;
      }
    }

    const quest = achievement.quest || {};
    return {
      id: quest.id || achievement.id,
      title: quest.title || achievement.title || 'Untitled Quest',
      totalXP: questTotalXp || 50,
      xpDistribution: Object.keys(xpDistribution).length > 0 ? xpDistribution : { stem: 50 },
      status: achievement.status || 'completed',
      completedAt: achievement.completed_at
    };
  });
}
