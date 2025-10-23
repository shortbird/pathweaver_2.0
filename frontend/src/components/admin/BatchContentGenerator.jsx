import React, { useState, useEffect } from 'react'
import BatchQuestGenerator from './BatchQuestGenerator'
import BatchBadgeGenerator from './BatchBadgeGenerator'
import api from '../../services/api'

const BatchContentGenerator = () => {
  const [activeTab, setActiveTab] = useState('quests')
  const [apiUsage, setApiUsage] = useState({ used: 0, limit: 200, remaining: 200, resets_at: '' })

  useEffect(() => {
    fetchApiUsage()
  }, [])

  const fetchApiUsage = async () => {
    try {
      const response = await api.get('/api/admin/pexels/usage')
      if (response.data.success) {
        setApiUsage({
          used: response.data.used,
          limit: response.data.limit,
          remaining: response.data.remaining,
          resets_at: response.data.resets_at
        })
      }
    } catch (error) {
      console.error('Failed to fetch API usage')
    }
  }

  return (
    <div className="space-y-6">
      {/* Pexels API Usage Indicator - Shared */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Pexels API Usage (Shared)</h3>
            <p className="text-sm text-gray-600 mt-1">
              {apiUsage.used} / {apiUsage.limit} calls used • {apiUsage.remaining} remaining
            </p>
            <p className="text-xs text-gray-500 mt-1">Resets at {apiUsage.resets_at}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-600">{apiUsage.remaining}</div>
            <div className="text-xs text-gray-500">calls left</div>
          </div>
        </div>
        <div className="mt-3 bg-gray-200 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all"
            style={{ width: `${(apiUsage.used / apiUsage.limit) * 100}%` }}
          />
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('quests')}
            className={`flex-1 px-6 py-4 text-center font-semibold transition-colors ${
              activeTab === 'quests'
                ? 'bg-gradient-primary-reverse text-white'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Quest Generator
          </button>
          <button
            onClick={() => setActiveTab('badges')}
            className={`flex-1 px-6 py-4 text-center font-semibold transition-colors ${
              activeTab === 'badges'
                ? 'bg-gradient-primary-reverse text-white'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Badge Generator
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'quests' && <BatchQuestGenerator />}
          {activeTab === 'badges' && (
            <BatchBadgeGenerator
              apiUsage={apiUsage}
              fetchApiUsage={fetchApiUsage}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default BatchContentGenerator
