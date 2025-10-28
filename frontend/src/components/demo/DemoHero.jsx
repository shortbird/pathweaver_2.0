import React from 'react';
import { Play, Sparkles } from 'lucide-react';

const DemoHero = ({ onStart }) => {
  return (
    <div className="relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-20 left-20 w-72 h-72 bg-optio-purple/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-optio-pink/10 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <div className="text-center space-y-8 py-8">
        {/* Main Headline - Process-Focused */}
        <div className="space-y-4">
          <h1 className="text-5xl md:text-6xl font-bold text-text-primary">
            <span className="block mb-2">Your Learning Story</span>
            <span className="block bg-gradient-primary bg-clip-text text-transparent">
              Starts Here
            </span>
          </h1>

          <p className="text-xl md:text-2xl text-gray-700 max-w-2xl mx-auto">
            What will you discover today?
          </p>
        </div>

        {/* Preview Cards - Three Journey Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border-2 border-purple-100">
            <div className="w-12 h-12 mx-auto mb-3 bg-gradient-primary rounded-lg flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-bold text-lg text-text-primary mb-2">Choose Quests</h3>
            <p className="text-sm text-gray-600">
              Pick what sparks your curiosity
            </p>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border-2 border-purple-100">
            <div className="w-12 h-12 mx-auto mb-3 bg-gradient-primary rounded-lg flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-bold text-lg text-text-primary mb-2">Create Evidence</h3>
            <p className="text-sm text-gray-600">
              Make real things that matter
            </p>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border-2 border-purple-100">
            <div className="w-12 h-12 mx-auto mb-3 bg-gradient-primary rounded-lg flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-bold text-lg text-text-primary mb-2">Celebrate Growth</h3>
            <p className="text-sm text-gray-600">
              Watch your skills take shape
            </p>
          </div>
        </div>

        {/* CTA Button - Prominent */}
        <div className="relative pt-4">
          <button
            onClick={onStart}
            className="group relative px-12 py-6 bg-gradient-primary
                     text-white font-bold text-xl rounded-full shadow-xl
                     hover:shadow-2xl transform hover:scale-105 transition-all duration-300"
          >
            <span className="flex items-center gap-3">
              <Play className="w-6 h-6 group-hover:animate-pulse" />
              Start Your 2-Minute Adventure
            </span>

            <span className="absolute inset-0 rounded-full bg-white/20 animate-pulse" />
          </button>

          <p className="mt-4 text-sm text-gray-500">
            No signup • Experience it yourself
          </p>
        </div>

      </div>
    </div>
  );
};

export default DemoHero;
