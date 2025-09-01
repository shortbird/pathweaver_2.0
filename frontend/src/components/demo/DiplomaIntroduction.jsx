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
          subtitle: "A Revolutionary Approach to Academic Achievement",
          description: "Unlike traditional diplomas that reduce your child's learning to letter grades, the Optio Portfolio Diploma validates their real achievements through documented evidence of academic and real-world accomplishments.",
          benefits: [
            "Shows colleges who your child really is beyond test scores",
            "Fosters healthy development through meaningful choice and responsibility",
            "Documents real-world skills and practical experience",
            "Validates learning that happens outside traditional classrooms"
          ],
          callToAction: "See how your child's achievements become academic credit"
        };
      case 'student':
        return {
          headline: "Your Optio Portfolio Diploma",
          subtitle: "Make Your Real Learning Count",
          description: "Your Optio Portfolio Diploma isn't just another certificate - it's a living document that validates your actual achievements. Unlike traditional diplomas with letter grades, yours tells the meaningful story of your learning journey.",
          benefits: [
            "Turn your passions and projects into academic credit",
            "Develop independence through meaningful educational choices",
            "Document real skills and meaningful experiences",
            "Show your authentic learning story, not just test scores"
          ],
          callToAction: "Experience how your achievements become your diploma"
        };
      default:
        return {
          headline: "The Optio Portfolio Diploma",
          subtitle: "Education That Validates Real Achievement",
          description: "The Optio Portfolio Diploma represents a paradigm shift from traditional letter-grade diplomas to evidence-based validation of real learning and achievement.",
          benefits: [
            "Documents authentic learning experiences",
            "Builds healthy responsibility and educational ownership",
            "Validates practical skills and real-world applications",
            "Tells a meaningful story beyond standardized assessments"
          ],
          callToAction: "Discover how real achievements become academic credit"
        };
    }
  };

  const content = getPersonaContent();

  const comparisonCards = [
    {
      icon: FileText,
      title: "Traditional Diploma",
      subtitle: "Letter grades and test scores",
      features: [
        "Shows grades: A, B, C, D, F",
        "Standardized test scores",
        "Course completion records",
        "No evidence of actual work"
      ],
      color: "from-gray-400 to-gray-500"
    },
    {
      icon: Award,
      title: "Optio Portfolio Diploma",
      subtitle: "Evidence-based validation",
      features: [
        "Documents actual achievements",
        "Shows evidence of real work",
        "Validates practical skills",
        "Tells your learning story"
      ],
      color: "from-[#ef597b] to-[#6d469b]"
    },
    {
      icon: Trophy,
      title: "The Result",
      subtitle: "Meaningful achievement recognition",
      features: [
        "Impresses colleges & employers",
        "Shows real-world readiness",
        "Validates unique talents",
        "Creates lasting portfolios"
      ],
      color: "from-[#f8b3c5] to-[#b794d6]"
    }
  ];

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

      {/* Comparison Cards - Static Grid */}
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h3 className="text-2xl font-bold text-[#003f5c] mb-4">
            See the Difference
          </h3>
          <p className="text-gray-600">
            Discover how Optio transforms traditional education validation
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {comparisonCards.map((card, index) => {
            const Icon = card.icon;
            const isResult = card.title === "The Result";
            
            return (
              <div
                key={index}
                className="relative group hover:scale-105 transition-all duration-300"
              >
                <div className={`h-full bg-gradient-to-br ${card.color} p-6 rounded-2xl shadow-xl hover:shadow-2xl transition-all`}>
                  <div className="flex flex-col items-center text-white">
                    <Icon className="w-14 h-14 mb-4 opacity-90" />
                    
                    <h4 className="text-2xl font-bold mb-2 text-center">{card.title}</h4>
                    <p className="text-sm opacity-90 mb-6 text-center">{card.subtitle}</p>
                    
                    <div className="space-y-2 w-full">
                      {card.features.map((feature, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 mt-0.5 opacity-80 flex-shrink-0" />
                          <span className={`text-sm ${isResult ? 'text-gray-700' : 'text-white/90'}`}>{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
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
              With Great Recognition Comes Great Responsibility
            </h4>
            <p className="text-yellow-700 mb-4">
              {persona === 'parent' 
                ? "Your child's Optio Portfolio Diploma comes with the responsibility to self-validate their learning. They'll document real achievements and provide evidence of their work - creating authentic academic validation."
                : "Your Optio Portfolio Diploma comes with the responsibility to self-validate your learning. You'll document real achievements and provide evidence of your work - creating authentic academic validation."
              }
            </p>
            <p className="text-yellow-800 font-semibold">
              This builds character, integrity, and real-world accountability
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