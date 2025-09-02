import React, { useState } from 'react';
import { Play, Sparkles, GraduationCap, Globe, CheckCircle, Info } from 'lucide-react';
import InfoModal from './InfoModal';
import { useDemo } from '../../contexts/DemoContext';

const DemoHero = ({ onStart }) => {
  const { actions } = useDemo();
  const [hoveredCard, setHoveredCard] = useState(null);
  const [activeModal, setActiveModal] = useState(null);

  const features = [
    {
      icon: <GraduationCap className="w-8 h-8" />,
      title: "Diploma Day 1",
      subtitle: "You make it impressive",
      modalKey: 'diplomaDay1',
      color: "from-[#ef597b] to-[#ff7a9a]"
    },
    {
      icon: <Globe className="w-8 h-8" />,
      title: "Student Validation",
      subtitle: "Public accountability",
      modalKey: 'studentValidation',
      color: "from-[#6d469b] to-[#8a6bb8]"
    },
    {
      icon: <CheckCircle className="w-8 h-8" />,
      title: "Real Work",
      subtitle: "Not grades",
      modalKey: 'realWork',
      color: "from-[#ef597b] to-[#6d469b]"
    }
  ];

  const modalContent = {
    diplomaDay1: {
      title: "Get Your Diploma on Day 1",
      content: (
        <div className="space-y-4">
          <p className="text-lg font-medium text-gray-800">
            Start with your diploma, then make it impressive through real learning.
          </p>
          <div className="bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 rounded-lg p-4">
            <h4 className="font-semibold mb-2">How it works:</h4>
            <ul className="space-y-2 text-gray-700">
              <li className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                <span>Your diploma exists from the moment you join</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                <span>Complete quests to fill it with real achievements</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                <span>Share your public portfolio with colleges & employers</span>
              </li>
            </ul>
          </div>
        </div>
      )
    },
    studentValidation: {
      title: "Student Validation Through Public Accountability",
      content: (
        <div className="space-y-4">
          <p className="text-lg font-medium text-gray-800">
            Students validate their own learning by making work public.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="border-2 border-red-200 rounded-lg p-4 bg-red-50">
              <h4 className="font-semibold text-red-800 mb-2">Teacher Validation</h4>
              <ul className="space-y-1 text-sm text-gray-700">
                <li>• Work gets discarded</li>
                <li>• Abstract letter grades (A, B, C)</li>
                <li>• Trust the institution</li>
              </ul>
            </div>
            <div className="border-2 border-green-200 rounded-lg p-4 bg-green-50">
              <h4 className="font-semibold text-green-800 mb-2">Student Validation</h4>
              <ul className="space-y-1 text-sm text-gray-700">
                <li>• Publicly verifiable quality work</li>
                <li>• Pride in real creation</li>
                <li>• Trust the work</li>
              </ul>
            </div>
          </div>
          <p className="text-sm text-gray-600 italic">
            Quality naturally emerges when work is public. Students can choose to keep sensitive work confidential.
          </p>
        </div>
      )
    },
    realWork: {
      title: "Real Work Speaks Louder Than Grades",
      content: (
        <div className="space-y-4">
          <p className="text-lg font-medium text-gray-800">
            Show what you can actually do, not just a letter grade.
          </p>
          <div className="space-y-3">
            <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
              <span className="text-2xl font-bold text-gray-400">B+</span>
              <span className="text-gray-600">vs</span>
              <span className="text-lg font-medium text-[#6d469b]">25 Recipe Family Cookbook</span>
            </div>
            <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
              <span className="text-2xl font-bold text-gray-400">A-</span>
              <span className="text-gray-600">vs</span>
              <span className="text-lg font-medium text-[#ef597b]">Working Calculator App</span>
            </div>
            <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
              <span className="text-2xl font-bold text-gray-400">B</span>
              <span className="text-gray-600">vs</span>
              <span className="text-lg font-medium text-[#6d469b]">Community Documentary</span>
            </div>
          </div>
          <p className="text-sm text-gray-600 italic">
            Which tells you more about a student's abilities?
          </p>
        </div>
      )
    },
    howItWorks: {
      title: "The Process Is The Goal",
      content: (
        <div className="space-y-4">
          <p className="text-lg font-medium text-gray-800">
            Learning happens through the process, the diploma is just the record.
          </p>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] flex items-center justify-center text-white font-bold">1</div>
              <div>
                <h4 className="font-semibold">Choose from Hundreds of Quests</h4>
                <p className="text-sm text-gray-600">Pick projects that match your interests</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] flex items-center justify-center text-white font-bold">2</div>
              <div>
                <h4 className="font-semibold">Complete Tasks & Submit Work</h4>
                <p className="text-sm text-gray-600">Create real things, document your process</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] flex items-center justify-center text-white font-bold">3</div>
              <div>
                <h4 className="font-semibold">Build Your Public Portfolio</h4>
                <p className="text-sm text-gray-600">Your diploma fills with actual achievements</p>
              </div>
            </div>
          </div>
        </div>
      )
    }
  };

  return (
    <div className="relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-20 left-20 w-72 h-72 bg-[#6d469b]/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-[#ef597b]/10 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <div className="text-center space-y-8">
        {/* Main Headline - Minimal */}
        <div className="space-y-3">
          <h1 className="text-5xl md:text-6xl font-bold text-[#003f5c]">
            <span className="block mb-2">Get Your Diploma</span>
            <span className="block bg-gradient-to-r from-[#ef597b] to-[#6d469b] bg-clip-text text-transparent">
              Day 1
            </span>
          </h1>
          
          <p className="text-xl text-gray-700">
            You validate it through publicly-shared work
          </p>
          
          <button
            onClick={() => setActiveModal('howItWorks')}
            className="inline-flex items-center gap-1 text-sm text-[#6d469b] hover:underline"
          >
            <Info className="w-4 h-4" />
            Learn how it works
          </button>
        </div>

        {/* Feature Cards - Visual with Minimal Text */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {features.map((feature, index) => (
            <div
              key={index}
              className="relative group cursor-pointer"
              onMouseEnter={() => setHoveredCard(index)}
              onMouseLeave={() => setHoveredCard(null)}
              onClick={() => setActiveModal(feature.modalKey)}
            >
              <div className={`absolute inset-0 bg-gradient-to-r ${feature.color} rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-xl`} />
              <div className="relative bg-white/90 backdrop-blur rounded-xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105">
                <div className={`inline-flex p-3 rounded-lg bg-gradient-to-r ${feature.color} text-white mb-3`}>
                  {feature.icon}
                </div>
                <h3 className="font-bold text-[#003f5c] text-lg">{feature.title}</h3>
                <p className="text-sm text-gray-600 mt-1">{feature.subtitle}</p>
                <div className="mt-3 text-xs text-[#6d469b] font-medium flex items-center gap-1">
                  Learn more
                  <Info className="w-3 h-3" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA Button - Prominent */}
        <div className="relative">
          <button
            onClick={onStart}
            className="group relative px-12 py-6 bg-gradient-to-r from-[#ef597b] to-[#6d469b] 
                     text-white font-bold text-xl rounded-full shadow-xl 
                     hover:shadow-2xl transform hover:scale-105 transition-all duration-300"
          >
            <span className="flex items-center gap-3">
              <Play className="w-6 h-6 group-hover:animate-pulse" />
              Try Interactive Demo
              <Sparkles className="w-5 h-5 group-hover:animate-spin" />
            </span>
            
            <span className="absolute inset-0 rounded-full bg-white/20 animate-pulse" />
          </button>
          
          <p className="mt-3 text-sm text-gray-500">
            2-minute experience • No signup required
          </p>
        </div>
      </div>

      {/* Modals */}
      {Object.entries(modalContent).map(([key, modal]) => (
        <InfoModal
          key={key}
          isOpen={activeModal === key}
          onClose={() => setActiveModal(null)}
          title={modal.title}
        >
          {modal.content}
        </InfoModal>
      ))}
    </div>
  );
};

export default DemoHero;