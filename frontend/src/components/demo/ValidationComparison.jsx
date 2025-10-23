import React, { useState } from 'react';
import { 
  School, Users, Eye, EyeOff, Award, FileText, 
  CheckCircle, XCircle, ArrowRight, Info
} from 'lucide-react';
import InfoModal from './InfoModal';

const ValidationComparison = () => {
  const [hoveredSide, setHoveredSide] = useState(null);
  const [showPhilosophyModal, setShowPhilosophyModal] = useState(false);

  const comparisons = [
    {
      traditional: {
        title: "English Class",
        grade: "B+",
        details: [
          "5 essays written",
          "3 book reports",
          "2 presentations",
          "1 final exam"
        ],
        visibility: "Work not preserved",
        validation: "Single evaluator",
        evidence: "Grade on transcript"
      },
      optio: {
        title: "Family Recipe Book Quest",
        xp: "350 XP",
        details: [
          "25 recipes documented with photos",
          "5 family members interviewed on video",
          "Cultural history research paper",
          "Published digital cookbook"
        ],
        visibility: "Work publicly visible",
        validation: "Quality self-evident",
        evidence: "Actual cookbook online"
      }
    },
    {
      traditional: {
        title: "Math Class",
        grade: "A-",
        details: [
          "Homework sets",
          "Quiz scores",
          "Test results",
          "Class participation"
        ],
        visibility: "Work discarded",
        validation: "One perspective only",
        evidence: "Letter grade only"
      },
      optio: {
        title: "Calculator App Quest",
        xp: "400 XP",
        details: [
          "Working calculator app",
          "Clean, documented code",
          "User testing videos",
          "Live demo available"
        ],
        visibility: "App publicly usable",
        validation: "App works or doesn't",
        evidence: "Try it yourself"
      }
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-text-primary">
          Teacher Validation vs Student Validation
        </h2>
        <p className="text-gray-600">
          Why public work creates better learning outcomes
        </p>
        <button
          onClick={() => setShowPhilosophyModal(true)}
          className="inline-flex items-center gap-1 text-sm text-optio-purple hover:underline"
        >
          <Info className="w-4 h-4" />
          Learn about our philosophy
        </button>
      </div>

      {/* Comparison Cards */}
      <div className="space-y-8">
        {comparisons.map((comp, idx) => (
          <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Traditional Side */}
            <div 
              className="relative group"
              onMouseEnter={() => setHoveredSide(`traditional-${idx}`)}
              onMouseLeave={() => setHoveredSide(null)}
            >
              <div className={`absolute inset-0 bg-red-500 rounded-xl opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
              <div className="relative bg-white border-2 border-red-200 rounded-xl p-6 hover:border-red-400 transition-colors">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <School className="w-5 h-5 text-red-500" />
                      <span className="text-xs font-semibold text-red-500 uppercase">Teacher Validation</span>
                    </div>
                    <h3 className="font-bold text-xl text-text-primary">{comp.traditional.title}</h3>
                  </div>
                  <div className="text-3xl font-bold text-gray-400">{comp.traditional.grade}</div>
                </div>

                {/* What Was Done */}
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">What was done:</p>
                  <ul className="space-y-1">
                    {comp.traditional.details.map((detail, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                        {detail}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Validation Info */}
                <div className="space-y-3 pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-3">
                    <EyeOff className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-gray-700">{comp.traditional.visibility}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <XCircle className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-gray-700">{comp.traditional.validation}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-gray-700">{comp.traditional.evidence}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Optio Side */}
            <div 
              className="relative group"
              onMouseEnter={() => setHoveredSide(`optio-${idx}`)}
              onMouseLeave={() => setHoveredSide(null)}
            >
              <div className={`absolute inset-0 bg-green-500 rounded-xl opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
              <div className="relative bg-white border-2 border-green-200 rounded-xl p-6 hover:border-green-400 transition-colors">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-5 h-5 text-green-500" />
                      <span className="text-xs font-semibold text-green-500 uppercase">Student Validation</span>
                    </div>
                    <h3 className="font-bold text-xl text-text-primary">{comp.optio.title}</h3>
                  </div>
                  <div className="text-2xl font-bold bg-gradient-to-r bg-gradient-primary-reverse bg-clip-text text-transparent">
                    {comp.optio.xp}
                  </div>
                </div>

                {/* What Was Done */}
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">What was created:</p>
                  <ul className="space-y-1">
                    {comp.optio.details.map((detail, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        {detail}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Validation Info */}
                <div className="space-y-3 pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-3">
                    <Eye className="w-4 h-4 text-green-500" />
                    <span className="text-sm text-gray-700">{comp.optio.visibility}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-sm text-gray-700">{comp.optio.validation}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Award className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-medium text-gray-700">{comp.optio.evidence}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Key Insights */}
      <div className="bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 rounded-xl p-8">
        <h3 className="font-bold text-xl text-text-primary mb-4">Why Student Validation Works</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-3 bg-white rounded-full flex items-center justify-center shadow-lg">
              <Eye className="w-8 h-8 text-optio-purple" />
            </div>
            <h4 className="font-semibold text-text-primary mb-2">Public = Quality</h4>
            <p className="text-sm text-gray-600">
              When work is visible, students naturally produce higher quality
            </p>
          </div>
          
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-3 bg-white rounded-full flex items-center justify-center shadow-lg">
              <Award className="w-8 h-8 text-optio-pink" />
            </div>
            <h4 className="font-semibold text-text-primary mb-2">Real Evidence</h4>
            <p className="text-sm text-gray-600">
              Actual work products instead of abstract grades
            </p>
          </div>
          
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-3 bg-white rounded-full flex items-center justify-center shadow-lg">
              <Users className="w-8 h-8 text-optio-purple" />
            </div>
            <h4 className="font-semibold text-text-primary mb-2">Self-Accountability</h4>
            <p className="text-sm text-gray-600">
              Students own their reputation through their work
            </p>
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="text-center">
        <p className="text-lg font-medium text-gray-700 mb-4">
          Which diploma would you rather show an employer?
        </p>
        <div className="flex items-center justify-center gap-4">
          <span className="text-3xl font-bold text-gray-400">B+</span>
          <span className="text-gray-500">or</span>
          <span className="text-2xl font-bold bg-gradient-to-r bg-gradient-primary-reverse bg-clip-text text-transparent">
            A Published Cookbook
          </span>
        </div>
      </div>

      {/* Philosophy Modal */}
      <InfoModal
        isOpen={showPhilosophyModal}
        onClose={() => setShowPhilosophyModal(false)}
        title="The Process Is The Goal"
      >
        <div className="space-y-4">
          <p className="text-lg font-medium text-gray-800">
            At Optio, we believe learning is a journey, not a destination.
          </p>
          
          <div className="space-y-3">
            <div className="p-4 bg-optio-pink/10 rounded-lg">
              <h4 className="font-semibold text-text-primary mb-2">Traditional Education</h4>
              <p className="text-sm text-gray-700">
                Focus on grades → Students optimize for scores → Learning becomes secondary
              </p>
            </div>
            
            <div className="p-4 bg-optio-purple/10 rounded-lg">
              <h4 className="font-semibold text-text-primary mb-2">Optio Education</h4>
              <p className="text-sm text-gray-700">
                Focus on creation → Students build real things → Learning happens naturally
              </p>
            </div>
          </div>
          
          <p className="text-sm text-gray-600">
            The diploma becomes a byproduct of genuine learning, not the goal itself.
          </p>
        </div>
      </InfoModal>
    </div>
  );
};

export default ValidationComparison;