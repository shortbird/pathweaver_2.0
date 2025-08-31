import React from 'react';
import { Link } from 'react-router-dom';
import Button from '../ui/Button';

const LearningRecommendations = ({ userSkills, recentActivity }) => {
  // Analyze user's skills to find gaps
  const getWeakestSkill = () => {
    if (!userSkills || userSkills.length === 0) return null;
    
    const skills = ['creativity', 'critical_thinking', 'practical_skills', 'communication', 'cultural_literacy'];
    const userSkillMap = {};
    userSkills.forEach(skill => {
      userSkillMap[skill.category] = skill.xp || 0;
    });
    
    // Find skills with lowest XP
    let weakest = null;
    let lowestXP = Infinity;
    
    skills.forEach(skill => {
      const xp = userSkillMap[skill] || 0;
      if (xp < lowestXP) {
        lowestXP = xp;
        weakest = skill;
      }
    });
    
    return weakest;
  };

  const weakestSkill = getWeakestSkill();
  
  const recommendations = [
    {
      type: 'skill_gap',
      title: 'Develop Your ' + (weakestSkill ? weakestSkill.replace('_', ' ') : 'Skills'),
      description: weakestSkill 
        ? `Your ${weakestSkill.replace('_', ' ')} skills could use some attention. Try quests that focus on this area!`
        : 'Complete more quests to get personalized recommendations.',
      icon: '🎯',
      action: 'Find Quests',
      link: `/quests?pillar=${weakestSkill || 'all'}`,
      color: 'from-purple-500 to-pink-500'
    },
    {
      type: 'collaboration',
      title: 'Team Up for Double XP',
      description: 'Collaborate with a friend on your next quest and both earn 2x XP!',
      icon: '👥',
      action: 'Learn More',
      link: '/quests',
      color: 'from-blue-500 to-cyan-500'
    },
    {
      type: 'streak',
      title: 'Keep Your Streak Going',
      description: 'Complete a task today to maintain your learning momentum!',
      icon: '🔥',
      action: 'Continue Learning',
      link: '/dashboard',
      color: 'from-orange-500 to-red-500'
    }
  ];

  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Recommended for You</h2>
        <span className="text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded-full font-semibold">
          PERSONALIZED
        </span>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {recommendations.map((rec, index) => (
          <div 
            key={index}
            className="relative group hover:shadow-lg transition-all duration-300 rounded-lg border border-gray-100 overflow-hidden"
          >
            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${rec.color}`} />
            
            <div className="p-4">
              <div className="text-3xl mb-3">{rec.icon}</div>
              <h3 className="font-semibold text-gray-900 mb-2">{rec.title}</h3>
              <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                {rec.description}
              </p>
              <Link to={rec.link}>
                <Button variant="outline" size="sm" className="w-full">
                  {rec.action}
                </Button>
              </Link>
            </div>
          </div>
        ))}
      </div>
      
      {/* AI Insights (Future Feature Placeholder) */}
      <div className="mt-6 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-sm">
            AI
          </div>
          <div className="flex-1">
            <p className="text-sm text-gray-700">
              <span className="font-semibold">AI Insight:</span> Based on your learning pattern, 
              you learn best through hands-on projects. Consider practical skills quests!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LearningRecommendations;