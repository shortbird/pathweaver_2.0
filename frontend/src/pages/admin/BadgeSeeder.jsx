import { useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';

export default function BadgeSeeder() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const seedBadges = async () => {
    if (!confirm('This will create 13 initial badges in the database. Continue?')) {
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await api.post('/api/admin/seed/initial-badges', {}, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      setResult({
        success: true,
        data: response.data
      });

      toast.success(`Successfully created ${response.data.count} badges!`);
    } catch (error) {
      console.error('Seed error:', error);

      setResult({
        success: false,
        error: error.response?.data?.error || error.message
      });

      toast.error(error.response?.data?.error || 'Failed to seed badges');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-md p-8">
        <h1 className="text-3xl font-bold mb-2">Badge System Setup</h1>
        <p className="text-gray-600 mb-6">
          Initialize the badge system with foundational badges across all 5 pillars.
        </p>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h2 className="font-semibold text-blue-900 mb-2">What This Does:</h2>
          <ul className="text-blue-800 text-sm space-y-1 list-disc list-inside">
            <li>Creates 13 foundational badges</li>
            <li>Covers all 5 skill pillars (STEM, Life & Wellness, Language, Society, Arts)</li>
            <li>Each badge has identity statement and requirements</li>
            <li>Prevents duplicate creation (safe to run once)</li>
          </ul>
        </div>

        <div className="space-y-4">
          <button
            onClick={seedBadges}
            disabled={loading}
            className={`w-full py-3 px-6 rounded-lg font-semibold text-white transition-all ${
              loading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r bg-gradient-primary-reverse hover:shadow-lg'
            }`}
          >
            {loading ? 'Creating Badges...' : 'Seed Initial Badges'}
          </button>

          {result && (
            <div className={`rounded-lg p-4 ${
              result.success
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}>
              {result.success ? (
                <>
                  <h3 className="font-semibold text-green-900 mb-2">Success!</h3>
                  <p className="text-green-800 text-sm mb-3">
                    Created {result.data.count} badges
                  </p>
                  {result.data.badges && (
                    <div className="bg-white rounded p-3 max-h-64 overflow-y-auto">
                      <h4 className="font-medium text-sm mb-2">Created Badges:</h4>
                      <ul className="text-xs space-y-1">
                        {result.data.badges.map(badge => (
                          <li key={badge.id} className="flex justify-between">
                            <span className="font-medium">{badge.name}</span>
                            <span className="text-gray-500">{badge.pillar_primary}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="mt-4 space-x-2">
                    <a
                      href="/badges"
                      className="inline-block px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium"
                    >
                      View Badges
                    </a>
                    <a
                      href="/admin"
                      className="inline-block px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm font-medium"
                    >
                      Back to Admin
                    </a>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="font-semibold text-red-900 mb-2">Error</h3>
                  <p className="text-red-800 text-sm">
                    {result.error}
                  </p>
                  {result.error.includes('already exist') && (
                    <p className="text-red-700 text-xs mt-2">
                      Badges have already been created. You can view them at /badges
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 bg-gray-50 rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 mb-2">Badges to be Created:</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <h4 className="font-medium text-purple-700 mb-1">STEM & Logic (3)</h4>
              <ul className="text-gray-700 text-xs space-y-0.5 ml-4 list-disc">
                <li>Systems Thinker</li>
                <li>Scientific Investigator</li>
                <li>Mathematical Reasoner</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-green-700 mb-1">Life & Wellness (2)</h4>
              <ul className="text-gray-700 text-xs space-y-0.5 ml-4 list-disc">
                <li>Mindful Practitioner</li>
                <li>Physical Wellness Explorer</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-blue-700 mb-1">Language & Communication (2)</h4>
              <ul className="text-gray-700 text-xs space-y-0.5 ml-4 list-disc">
                <li>Creative Storyteller</li>
                <li>Compelling Communicator</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-orange-700 mb-1">Society & Culture (3)</h4>
              <ul className="text-gray-700 text-xs space-y-0.5 ml-4 list-disc">
                <li>Community Builder</li>
                <li>Cultural Explorer</li>
                <li>Historical Investigator</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-pink-700 mb-1">Arts & Creativity (3)</h4>
              <ul className="text-gray-700 text-xs space-y-0.5 ml-4 list-disc">
                <li>Visual Artist</li>
                <li>Creative Problem Solver</li>
                <li>Design Thinker</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
