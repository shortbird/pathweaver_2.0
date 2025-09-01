import React, { useState, useEffect } from 'react';
import { useDemo } from '../../contexts/DemoContext';
import { 
  GraduationCap, 
  Award, 
  Star, 
  BookOpen, 
  Target, 
  Users, 
  CheckCircle, 
  ArrowRight,
  Sparkles,
  Trophy,
  FileText,
  Camera,
  Lightbulb,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

const DiplomaIntroduction = () => {
  const { demoState, actions } = useDemo();
  const { persona } = demoState;
  const [animatedElements, setAnimatedElements] = useState({});


  // Animate elements on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedElements({ showMainContent: true });
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const getPersonaContent = () => {
    switch (persona) {
      case 'parent':
        return {
          headline: "Your Child's Optio Portfolio Diploma",
          subtitle: "Where Learning Is The Adventure, Not The Destination",
          description: "Your child receives their Optio Portfolio Diploma on day one - not as something to earn, but as a living document of their learning journey. They'll discover what they're capable of through real creation and exploration.",
          benefits: [
            "Your child discovers their true capabilities through actual creation",
            "They develop genuine confidence from mastering real skills",
            "Learning becomes joyful exploration, not stressful performance",
            "They grow at their perfect pace with celebration at every step"
          ],
          callToAction: "Experience how learning becomes an adventure"
        };
      case 'student':
        return {
          headline: "Your Optio Portfolio Diploma",
          subtitle: "Where Your Curiosity Leads The Way",
          description: "You receive your Optio Portfolio Diploma on day one - it's yours to fill with real creations, discoveries, and growth. This is about who you're becoming through the journey, not what you need to prove.",
          benefits: [
            "You're discovering what you're truly capable of creating",
            "Every quest is an adventure in becoming more yourself",
            "Your creativity flourishes when learning feels like play",
            "You're building skills and confidence that matter to YOU"
          ],
          callToAction: "Start your learning adventure"
        };
      default:
        return {
          headline: "The Optio Portfolio Diploma",
          subtitle: "Where The Process Is The Goal",
          description: "Students receive their Optio Portfolio Diploma on enrollment day - a living document that grows with their journey. Learning isn't about reaching a destination, but about who they become through discovery and creation.",
          benefits: [
            "Students explore at their own pace with joy, not pressure",
            "Every attempt and mistake is celebrated as growth",
            "Learning flows from genuine curiosity and interest",
            "Growth happens naturally when the process is valued"
          ],
          callToAction: "See how learning becomes an adventure"
        };
    }
  };

  const content = getPersonaContent();


  const handleContinue = () => {
    actions.trackInteraction('diploma_intro_completed', { persona });
    actions.nextStep();
  };

  return (
    <div className="space-y-8">
      {/* Main Header */}
      <div className={`text-center space-y-6 transition-all duration-1000 transform ${
        animatedElements.showMainContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}>
        <div className="relative">
          {/* Main content */}
          <div className="relative z-10">
            <div className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-[#ef597b]/20 to-[#6d469b]/20 rounded-full mb-4">
              <Sparkles className="w-5 h-5 text-[#ef597b]" />
              <span className="text-[#6d469b] font-semibold">Every Student Gets Their Diploma on Day One</span>
              <Sparkles className="w-5 h-5 text-[#6d469b]" />
            </div>
            
            <h2 className="text-4xl md:text-5xl font-bold text-[#003f5c] mb-4">
              {content.headline}
            </h2>
            
            <p className="text-xl text-[#6d469b] font-semibold mb-6">
              {content.subtitle}
            </p>
            
            <p className="text-lg text-gray-600 max-w-4xl mx-auto leading-relaxed">
              {content.description}
            </p>
          </div>
        </div>
      </div>

      {/* How Optio Works */}
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <h3 className="text-2xl font-bold text-[#003f5c] mb-4">
            How {persona === 'parent' ? 'Your Child' : 'You'} Learn{persona === 'parent' ? 's' : ''} with Optio
          </h3>
          <p className="text-gray-600">
            A journey where every step is celebrated
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all">
            <div className="w-12 h-12 bg-gradient-to-r from-[#ef597b] to-[#6d469b] rounded-full flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h4 className="text-lg font-bold text-[#003f5c] mb-2">Choose Your Adventure</h4>
            <p className="text-gray-600">
              Pick quests that spark {persona === 'parent' ? 'their' : 'your'} curiosity. No prerequisites, no restrictions - just pure exploration.
            </p>
          </div>
          
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all">
            <div className="w-12 h-12 bg-gradient-to-r from-[#ef597b] to-[#6d469b] rounded-full flex items-center justify-center mb-4">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <h4 className="text-lg font-bold text-[#003f5c] mb-2">Create & Document</h4>
            <p className="text-gray-600">
              Make real things, solve real problems. Every creation adds to {persona === 'parent' ? 'their' : 'your'} growing portfolio.
            </p>
          </div>
          
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all">
            <div className="w-12 h-12 bg-gradient-to-r from-[#ef597b] to-[#6d469b] rounded-full flex items-center justify-center mb-4">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <h4 className="text-lg font-bold text-[#003f5c] mb-2">Grow Naturally</h4>
            <p className="text-gray-600">
              Progress happens at {persona === 'parent' ? 'their' : 'your'} perfect pace. Every step forward is celebrated, never rushed.
            </p>
          </div>
        </div>
      </div>

      {/* Key Benefits Section */}
      <div className="bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5 rounded-2xl p-8">
        <div className="text-center mb-8">
          <h3 className="text-2xl font-bold text-[#003f5c] mb-4">
            Why This Matters for {persona === 'parent' ? 'Your Child' : 'You'}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {content.benefits.map((benefit, index) => (
            <div 
              key={index}
              className="flex items-start gap-4 p-6 bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
            >
              <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-r from-[#ef597b] to-[#6d469b] rounded-full flex items-center justify-center">
                <Star className="w-5 h-5 text-white" />
              </div>
              <p className="text-gray-700 font-medium">{benefit}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Responsibility Message */}
      <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
              <Lightbulb className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
          <div>
            <h4 className="text-lg font-bold text-yellow-800 mb-2">
              A Beautiful Responsibility
            </h4>
            <p className="text-yellow-700 mb-4">
              {persona === 'parent' 
                ? "Your child's diploma is theirs from day one. They'll fill it with real creations, discoveries, and growth - not to prove themselves to others, but to celebrate their journey of becoming."
                : "Your diploma is yours from day one. You'll fill it with real creations, discoveries, and growth - not to prove yourself to others, but to celebrate your journey of becoming."
              }
            </p>
            <p className="text-yellow-800 font-semibold">
              The diploma isn't the goal - it's the beautiful byproduct of a meaningful learning journey
            </p>
          </div>
        </div>
      </div>

      {/* Call to Action */}
      <div className="text-center">
        <p className="text-lg text-gray-600 mb-6">
          {content.callToAction}
        </p>
        
        <button
          onClick={handleContinue}
          className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white font-bold text-lg rounded-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300"
        >
          <span>Start Quest Now</span>
          <ArrowRight className="w-6 h-6" />
        </button>
      </div>

      {/* Bottom Trust Indicators */}
      <div className="flex items-center justify-center gap-8 pt-6 border-t border-gray-200">
        <div className="flex items-center gap-2 text-gray-600">
          <BookOpen className="w-5 h-5 text-[#6d469b]" />
          <span className="text-sm">Real Learning Validation</span>
        </div>
        <div className="flex items-center gap-2 text-gray-600">
          <Trophy className="w-5 h-5 text-[#FFCA3A]" />
          <span className="text-sm">Evidence-Based Achievement</span>
        </div>
        <div className="flex items-center gap-2 text-gray-600">
          <Users className="w-5 h-5 text-[#ef597b]" />
          <span className="text-sm">Meaningful Academic Credit</span>
        </div>
      </div>
    </div>
  );
};

export default DiplomaIntroduction;