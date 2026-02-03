import React from 'react';
import { useDemo } from '../../contexts/DemoContext';
import {
  PlayIcon,
  ArrowRightIcon,
  ArrowDownIcon
} from '@heroicons/react/24/outline';

const DemoHero = () => {
  const { actions } = useDemo();

  return (
    <div className="relative overflow-hidden rounded-xl sm:rounded-2xl">
      {/* Subtle Background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-10 left-10 w-64 h-64 bg-optio-purple/5 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-10 w-80 h-80 bg-optio-pink/5 rounded-full blur-3xl" />
      </div>

      <div className="text-center space-y-8 py-8 sm:py-12 px-4 sm:px-8">
        {/* Main Headline */}
        <div className="space-y-4">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900">
            <span className="block mb-2">Turn Your Interests</span>
            <span className="block bg-gradient-primary bg-clip-text text-transparent">
              Into School Credit
            </span>
          </h1>

          <p className="text-lg sm:text-xl md:text-2xl text-gray-700 sm:whitespace-nowrap">
            See how Optio personalizes learning around what you love
          </p>
        </div>

        {/* Visual Flow Steps */}
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-8 sm:gap-3 items-stretch">
            {/* Step 1: Pick a Quest */}
            <div className="relative">
              <div className="bg-white rounded-xl border border-gray-200 p-5 h-full shadow-sm hover:shadow-md transition-shadow flex flex-col">
                {/* Mini quest cards visual */}
                <div className="flex-1 flex flex-col justify-center gap-2 mb-4">
                  <div className="flex items-center gap-3 px-3 py-2 bg-blue-50 rounded-lg border border-blue-100">
                    <div className="w-4 h-4 rounded bg-blue-400"></div>
                    <span className="text-xs text-gray-700">Build a Robot</span>
                  </div>
                  <div className="flex items-center gap-3 px-3 py-2 bg-pink-50 rounded-lg border border-pink-100">
                    <div className="w-4 h-4 rounded bg-pink-400"></div>
                    <span className="text-xs text-gray-700">Compose Music</span>
                  </div>
                  <div className="flex items-center gap-3 px-3 py-2 bg-green-50 rounded-lg border border-green-100">
                    <div className="w-4 h-4 rounded bg-green-400"></div>
                    <span className="text-xs text-gray-700">Start a Business</span>
                  </div>
                </div>
                <p className="text-base font-semibold text-gray-800 text-center">Pick a Quest</p>
              </div>
              {/* Arrow - horizontal on desktop, vertical on mobile */}
              <ArrowRightIcon className="hidden sm:block absolute -right-4 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400 z-10" />
              <div className="sm:hidden absolute -bottom-6 left-1/2 -translate-x-1/2 z-20">
                <ArrowDownIcon className="w-5 h-5 text-gray-400" />
              </div>
            </div>

            {/* Step 2: Add Interests */}
            <div className="relative">
              <div className="bg-white rounded-xl border border-gray-200 p-5 h-full shadow-sm hover:shadow-md transition-shadow flex flex-col">
                {/* Interest chips visual */}
                <div className="flex-1 flex flex-wrap justify-center items-center gap-2 mb-4">
                  <span className="px-3 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">Gaming</span>
                  <span className="px-3 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">Music</span>
                  <span className="px-3 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">Sports</span>
                  <span className="px-3 py-1 text-xs font-medium bg-orange-100 text-orange-700 rounded-full">Art</span>
                  <span className="px-3 py-1 text-xs font-medium bg-cyan-100 text-cyan-700 rounded-full">Tech</span>
                  <span className="px-3 py-1 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">Outdoors</span>
                </div>
                <p className="text-base font-semibold text-gray-800 text-center">Add Your Interests</p>
              </div>
              <ArrowRightIcon className="hidden sm:block absolute -right-4 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400 z-10" />
              <div className="sm:hidden absolute -bottom-6 left-1/2 -translate-x-1/2 z-20">
                <ArrowDownIcon className="w-5 h-5 text-gray-400" />
              </div>
            </div>

            {/* Step 3: Submit Evidence */}
            <div className="relative">
              <div className="bg-white rounded-xl border border-gray-200 p-5 h-full shadow-sm hover:shadow-md transition-shadow flex flex-col">
                {/* Evidence visual with labels */}
                <div className="flex-1 flex flex-col justify-center gap-2 mb-4">
                  <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="w-5 h-4 bg-blue-300 rounded"></div>
                    <span className="text-xs text-gray-700">Photo</span>
                  </div>
                  <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="w-5 h-4 bg-green-300 rounded"></div>
                    <span className="text-xs text-gray-700">Link</span>
                  </div>
                  <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="w-5 h-4 bg-amber-300 rounded"></div>
                    <span className="text-xs text-gray-700">Reflection</span>
                  </div>
                </div>
                <p className="text-base font-semibold text-gray-800 text-center">Submit Evidence</p>
              </div>
              <ArrowRightIcon className="hidden sm:block absolute -right-4 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400 z-10" />
              <div className="sm:hidden absolute -bottom-6 left-1/2 -translate-x-1/2 z-20">
                <ArrowDownIcon className="w-5 h-5 text-gray-400" />
              </div>
            </div>

            {/* Step 4: Earn Credit */}
            <div className="relative">
              <div className="bg-gradient-to-br from-optio-purple/5 to-optio-pink/5 rounded-xl border-2 border-optio-purple/20 p-5 h-full shadow-sm hover:shadow-md transition-shadow flex flex-col">
                {/* Credit/XP visual */}
                <div className="flex-1 flex flex-col items-center justify-center gap-2 mb-4">
                  <div className="flex items-end gap-1 h-12">
                    <div className="w-5 bg-optio-purple/60 rounded-t" style={{ height: '40%' }}></div>
                    <div className="w-5 bg-optio-purple/70 rounded-t" style={{ height: '70%' }}></div>
                    <div className="w-5 bg-optio-purple/80 rounded-t" style={{ height: '100%' }}></div>
                  </div>
                  <span className="text-sm font-bold text-optio-purple">+150 XP</span>
                </div>
                <p className="text-base font-semibold text-optio-purple text-center">Earn Credit</p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <div className="relative pt-4">
          <button
            onClick={actions.startDemo}
            className="group relative px-10 sm:px-12 py-5 sm:py-6 bg-gradient-primary
                     text-white font-bold text-lg sm:text-xl rounded-full shadow-xl
                     hover:shadow-2xl transform hover:scale-105 transition-all duration-300
                     min-h-[64px] touch-manipulation"
          >
            <span className="flex items-center gap-3">
              <PlayIcon className="w-6 h-6" />
              Try It Now - 90 Seconds
            </span>
          </button>

          <p className="mt-4 text-sm text-gray-500">
            No signup required
          </p>
        </div>
      </div>
    </div>
  );
};

export default DemoHero;
