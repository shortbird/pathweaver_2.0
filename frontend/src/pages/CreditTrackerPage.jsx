import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import CreditTracker from '../components/credits/CreditTracker';

const CreditTrackerPage = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-transparent bg-clip-text">
            Academic Credits
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            Track your credit accumulation across all learning pillars. Credits represent
            measurable academic progress and contribute to your diploma requirements.
          </p>
        </div>

        {/* Credit Tracker Component */}
        <div className="max-w-4xl mx-auto">
          <CreditTracker userId={user?.id} />
        </div>

        {/* Additional Info */}
        <div className="mt-8 max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-bold text-gray-900 mb-3">Earning Credits</h3>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span>Complete quests to earn credits in various pillars</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span>Each badge earned awards additional credits</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span>Credits are weighted by quest difficulty and complexity</span>
                </li>
              </ul>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-bold text-gray-900 mb-3">Using Credits</h3>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">→</span>
                  <span>Credits appear on your academic transcript</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">→</span>
                  <span>Showcase them on your diploma portfolio</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">→</span>
                  <span>Demonstrate expertise to colleges and employers</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-8 max-w-4xl mx-auto bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg p-6 text-center">
          <h3 className="text-xl font-bold mb-2">View Your Complete Transcript</h3>
          <p className="mb-4">See all your achievements, credits, and badges in one comprehensive view</p>
          <a
            href="/transcript"
            className="inline-block bg-white text-gray-900 font-medium px-6 py-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            View Transcript
          </a>
        </div>
      </div>
    </div>
  );
};

export default CreditTrackerPage;
