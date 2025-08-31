import React, { useState } from 'react';
import { useDemo } from '../../contexts/DemoContext';
import { Users, GraduationCap, Heart, Target, Shield, Star } from 'lucide-react';

const PersonaSelector = () => {
  const { actions } = useDemo();
  const [hoveredPersona, setHoveredPersona] = useState(null);

  const personas = [
    {
      id: 'parent',
      title: "I'm a Parent",
      subtitle: "Looking for the best education for my child",
      icon: Users,
      color: 'from-[#6d469b] to-[#8b5fbf]',
      benefits: [
        "See how to re-engage your unmotivated student",
        "Explore accredited diploma options",
        "Learn about teacher support & accountability",
        "Understand college preparation features"
      ],
      painPoints: [
        "My child is disengaged at school",
        "Want them prepared for adulthood",
        "Need more personalized learning",
        "Looking for real-world skills"
      ],
      message: "Finally, an education that engages your child AND prepares them for college"
    },
    {
      id: 'student',
      title: "I'm a Student", 
      subtitle: "Ready to make my learning count",
      icon: GraduationCap,
      color: 'from-[#ef597b] to-[#ff7a9a]',
      benefits: [
        "Turn your real projects into credits",
        "Build an impressive portfolio",
        "Learn through doing, not memorizing",
        "Show colleges who you really are"
      ],
      painPoints: [
        "Bored with traditional schoolwork",
        "My real learning goes unrecognized",
        "Want to pursue my passions",
        "Need learning that prepares me for a successful future"
      ],
      message: "Your real life IS your education - we just help you prove it"
    }
  ];

  const handlePersonaSelect = (personaId) => {
    actions.selectPersona(personaId);
    actions.trackInteraction('persona_selected', { persona: personaId });
    
    // Auto-advance after selection
    setTimeout(() => {
      actions.nextStep();
    }, 500);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <h2 className="text-3xl font-bold text-[#003f5c]">
          Let's Personalize Your Experience
        </h2>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Choose your perspective to see how Optio can transform education for you
        </p>
      </div>

      {/* Persona Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
        {personas.map((persona) => {
          const Icon = persona.icon;
          const isHovered = hoveredPersona === persona.id;
          
          return (
            <button
              key={persona.id}
              onClick={() => handlePersonaSelect(persona.id)}
              onMouseEnter={() => setHoveredPersona(persona.id)}
              onMouseLeave={() => setHoveredPersona(null)}
              className={`relative group text-left p-8 rounded-2xl border-2 transition-all duration-300
                ${isHovered 
                  ? 'border-[#6d469b] shadow-2xl transform -translate-y-2 bg-gradient-to-br from-[#6d469b] to-[#ef597b]' 
                  : 'border-gray-200 shadow-lg hover:shadow-xl bg-white'}`}
            >
              {/* Icon */}
              <div className={`mb-6 inline-flex p-4 rounded-full transition-colors
                ${isHovered ? 'bg-white/20' : `bg-gradient-to-r ${persona.color} bg-opacity-10`}`}>
                <Icon className={`w-8 h-8 ${isHovered ? 'text-white' : 'text-[#6d469b]'}`} />
              </div>

              {/* Title & Subtitle */}
              <h3 className={`text-2xl font-bold mb-2 ${isHovered ? 'text-white' : 'text-[#003f5c]'}`}>
                {persona.title}
              </h3>
              <p className={`text-lg mb-6 ${isHovered ? 'text-white/90' : 'text-gray-600'}`}>
                {persona.subtitle}
              </p>

              {/* Pain Points */}
              <div className="space-y-3 mb-6">
                <p className={`text-sm font-semibold ${isHovered ? 'text-white' : 'text-gray-700'}`}>
                  If this sounds like you:
                </p>
                <ul className="space-y-2">
                  {persona.painPoints.map((point, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Heart className={`w-4 h-4 mt-0.5 flex-shrink-0 
                        ${isHovered ? 'text-white/80' : 'text-[#ef597b]'}`} />
                      <span className={`text-sm ${isHovered ? 'text-white/90' : 'text-gray-600'}`}>
                        {point}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Benefits Preview */}
              <div className={`p-4 rounded-lg ${isHovered ? 'bg-white/10' : 'bg-gray-50'}`}>
                <p className={`text-sm font-semibold mb-2 ${isHovered ? 'text-white' : 'text-gray-700'}`}>
                  You'll discover:
                </p>
                <ul className="space-y-1">
                  {persona.benefits.slice(0, 2).map((benefit, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Star className={`w-3 h-3 mt-0.5 flex-shrink-0 
                        ${isHovered ? 'text-[#FFCA3A]' : 'text-[#FFCA3A]'}`} />
                      <span className={`text-xs ${isHovered ? 'text-white/80' : 'text-gray-600'}`}>
                        {benefit}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Hover Message - removed to prevent text overlap */}

              {/* Selection Indicator */}
              <div className={`absolute top-4 right-4 transition-all duration-300
                ${isHovered ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}>
                <div className="flex items-center gap-2 px-3 py-1 bg-white/20 rounded-full">
                  <Target className="w-4 h-4 text-white" />
                  <span className="text-sm text-white font-medium">Select</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Trust Indicators */}
      <div className="flex items-center justify-center gap-8 pt-8 border-t border-gray-200">
        <div className="flex items-center gap-2 text-gray-600">
          <Shield className="w-5 h-5 text-green-500" />
          <span className="text-sm">Safe & Secure</span>
        </div>
        <div className="flex items-center gap-2 text-gray-600">
          <Star className="w-5 h-5 text-[#FFCA3A]" />
          <span className="text-sm">No Credit Card Required</span>
        </div>
        <div className="flex items-center gap-2 text-gray-600">
          <Users className="w-5 h-5 text-[#6d469b]" />
          <span className="text-sm">Join 10,000+ families embracing this new philosophy</span>
        </div>
      </div>
    </div>
  );
};

export default PersonaSelector;