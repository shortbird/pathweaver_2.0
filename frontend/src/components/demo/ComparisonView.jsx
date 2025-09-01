import React, { useState } from 'react';
import { useDemo } from '../../contexts/DemoContext';
import { 
  CheckCircle, XCircle, ArrowRight, Eye, EyeOff,
  FileText, Trophy, Users, Calendar, DollarSign
} from 'lucide-react';

const ComparisonView = () => {
  const { demoState, actions } = useDemo();
  const [showDetails, setShowDetails] = useState(false);
  const isParent = demoState.persona === 'parent';

  const comparisons = [
    {
      category: 'Learning Evidence',
      traditional: 'Letter grades (A, B, C)',
      optio: 'Portfolio with real projects',
      traditionalIcon: XCircle,
      optioIcon: CheckCircle
    },
    {
      category: 'Student Engagement',
      traditional: 'Passive listening in class',
      optio: 'Active creation and doing',
      traditionalIcon: XCircle,
      optioIcon: CheckCircle
    },
    {
      category: 'Personalization',
      traditional: 'One-size-fits-all curriculum',
      optio: 'Choose quests based on interests',
      traditionalIcon: XCircle,
      optioIcon: CheckCircle
    },
    {
      category: 'Real-World Skills',
      traditional: 'Theoretical knowledge only',
      optio: 'Practical application required',
      traditionalIcon: XCircle,
      optioIcon: CheckCircle
    },
    {
      category: 'College Applications',
      traditional: 'Generic transcript',
      optio: 'Unique portfolio that stands out',
      traditionalIcon: XCircle,
      optioIcon: CheckCircle
    }
  ];

  const costComparison = {
    traditional: {
      private: '$15,000-30,000/year',
      tutoring: '$50-150/hour additional',
      total: '$20,000+ annually'
    },
    optio: {
      explorer: 'Free (limited features)',
      creator: '$39.99/month',
      visionary: '$499.99/month (accredited)'
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <h2 className="text-3xl font-bold text-[#003f5c]">
          See the Optio Difference
        </h2>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          {isParent 
            ? "Compare how your child's education could transform with Optio"
            : "See why students are choosing Optio over traditional education"}
        </p>
      </div>

      {/* Side-by-Side Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Traditional Education */}
        <div className="space-y-4">
          <div className="bg-gray-100 rounded-xl p-6">
            <h3 className="text-xl font-bold text-gray-700 mb-4 flex items-center gap-2">
              <FileText className="w-6 h-6" />
              Traditional Education
            </h3>
            
            {/* Sample Transcript */}
            <div className="bg-white rounded-lg p-4 mb-4">
              <p className="text-sm font-semibold text-gray-600 mb-3">Typical Transcript:</p>
              <div className="space-y-2 font-mono text-sm">
                <div className="flex justify-between">
                  <span>English 10</span>
                  <span className="font-bold">B+</span>
                </div>
                <div className="flex justify-between">
                  <span>Algebra II</span>
                  <span className="font-bold">B</span>
                </div>
                <div className="flex justify-between">
                  <span>Biology</span>
                  <span className="font-bold">A-</span>
                </div>
                <div className="flex justify-between">
                  <span>History</span>
                  <span className="font-bold">B</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-3 italic">
                What does this really tell you about the student?
              </p>
            </div>

            {/* Limitations */}
            <div className="space-y-3">
              {comparisons.map((item, index) => (
                <div key={index} className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-700">{item.category}</p>
                    <p className="text-sm text-gray-600">{item.traditional}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Cost */}
            <div className="mt-6 p-4 bg-red-50 rounded-lg">
              <DollarSign className="w-6 h-6 text-red-600 mb-2" />
              <p className="font-semibold text-gray-700">Private School Cost:</p>
              <p className="text-2xl font-bold text-red-600">{costComparison.traditional.private}</p>
              <p className="text-sm text-gray-600 mt-1">Plus tutoring, activities, etc.</p>
            </div>
          </div>
        </div>

        {/* Optio Education */}
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-[#6d469b]/10 to-[#ef597b]/10 rounded-xl p-6">
            <h3 className="text-xl font-bold text-[#003f5c] mb-4 flex items-center gap-2">
              <Trophy className="w-6 h-6 text-[#6d469b]" />
              Optio Education
            </h3>
            
            {/* Sample Portfolio */}
            <div className="bg-white rounded-lg p-4 mb-4">
              <p className="text-sm font-semibold text-[#6d469b] mb-3">Living Portfolio:</p>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm">Built working app for local business</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm">Published research on renewable energy</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm">Organized community fundraiser ($5K raised)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm">Created documentary on local history</span>
                </div>
              </div>
              <p className="text-xs text-[#6d469b] mt-3 italic font-semibold">
                This shows WHO they are and WHAT they can do!
              </p>
            </div>

            {/* Benefits */}
            <div className="space-y-3">
              {comparisons.map((item, index) => (
                <div key={index} className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-[#003f5c]">{item.category}</p>
                    <p className="text-sm text-gray-600">{item.optio}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Pricing Tiers */}
            <div className="mt-6 p-4 bg-green-50 rounded-lg">
              <DollarSign className="w-6 h-6 text-green-600 mb-2" />
              <p className="font-semibold text-gray-700">Optio Pricing:</p>
              <div className="space-y-2 mt-2">
                <div className="flex justify-between text-sm">
                  <span>Explorer (Free)</span>
                  <span className="font-semibold">$0/month</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Creator</span>
                  <span className="font-semibold">$39.99/month</span>
                </div>
                <div className="flex justify-between text-sm bg-[#6d469b]/10 px-2 py-1 rounded">
                  <span className="font-semibold">Visionary (Accredited)</span>
                  <span className="font-bold text-[#6d469b]">$499.99/month</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Real Impact Stories - Only for Parents */}
      {isParent && (
        <div className="bg-white rounded-xl p-8 border-2 border-[#6d469b]/20">
          <h3 className="text-2xl font-bold text-[#003f5c] mb-6 text-center">
            The Optio Difference
          </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-[#6d469b] mb-2">Process-Focused</div>
            <p className="text-sm text-gray-600">Learning is valuable for its own sake</p>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-[#ef597b] mb-2">Growth Mindset</div>
            <p className="text-sm text-gray-600">Every step is celebrated</p>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-[#FFCA3A] mb-2">Internal Motivation</div>
            <p className="text-sm text-gray-600">Driven by curiosity, not grades</p>
          </div>
        </div>

        <div className="mt-6 p-4 bg-gradient-to-r from-[#6d469b]/5 to-[#ef597b]/5 rounded-lg">
          <h4 className="text-center font-bold text-[#003f5c] mb-3">The Process Is The Goal</h4>
          <p className="text-center text-gray-700">
            Learning is about who you become, not what you prove. 
            Every quest matters because of what it teaches you right now.
          </p>
          <p className="text-center text-sm text-[#6d469b] font-semibold mt-3">
            The diploma is the byproduct, not the goal.
          </p>
        </div>
      </div>
      )}

      {/* CTA */}
    </div>
  );
};

export default ComparisonView;