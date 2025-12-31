import React, { useState, useEffect } from 'react'
import { crmAPI } from '../services/crmAPI'
import toast from 'react-hot-toast'
import CampaignList from '../components/admin/crm/CampaignList'
import TemplateLibrary from '../components/admin/crm/TemplateLibrary'
import SegmentBuilder from '../components/admin/crm/SegmentBuilder'
import SequenceBuilder from '../components/admin/crm/SequenceBuilder'

const CRMPage = () => {
  const [activeTab, setActiveTab] = useState('campaigns')
  const [overview, setOverview] = useState(null)
  const [sequences, setSequences] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchOverview()
    fetchSequences()
  }, [])

  const fetchOverview = async () => {
    try {
      const response = await crmAPI.getOverview()
      setOverview(response.data.stats || {})
    } catch (error) {
      console.error('Failed to load CRM overview:', error)
      setOverview({})
    } finally {
      setLoading(false)
    }
  }

  const fetchSequences = async () => {
    try {
      const response = await crmAPI.getSequences()
      setSequences(response.data.sequences || [])
    } catch (error) {
      console.error('Failed to load sequences:', error)
      setSequences([])
    }
  }

  const activeSequences = sequences.filter(s => s.is_active)
  const hasNoActiveSequences = activeSequences.length === 0

  const tabs = [
    { id: 'campaigns', label: 'Campaigns' },
    { id: 'templates', label: 'Templates' },
    { id: 'segments', label: 'Segments' },
    { id: 'sequences', label: 'Sequences' }
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4 bg-gradient-to-r from-optio-purple to-optio-pink bg-clip-text text-transparent">
          CRM & Email Automation
        </h1>

        {/* Warning banner for no active sequences */}
        {hasNoActiveSequences && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  <span className="font-semibold">No active automation sequences.</span> Go to the Sequences tab to activate automated email campaigns.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Overview stats */}
        {!loading && overview && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg shadow">
              <p className="text-sm text-gray-600">Total Campaigns</p>
              <p className="text-2xl font-bold text-gray-900">{overview.total_campaigns || 0}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <p className="text-sm text-gray-600">Active Sequences</p>
              <p className="text-2xl font-bold text-green-600">{activeSequences.length}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <p className="text-sm text-gray-600">Emails Sent Today</p>
              <p className="text-2xl font-bold text-blue-600">{overview.emails_sent_today || 0}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <p className="text-sm text-gray-600">Active Templates</p>
              <p className="text-2xl font-bold text-purple-600">{overview.total_templates || 0}</p>
            </div>
          </div>
        )}
      </div>

      {/* Tab navigation */}
      <div className="border-b border-gray-200 mb-6 overflow-x-auto">
        <nav className="-mb-px flex space-x-8">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                py-4 px-1 border-b-2 font-semibold text-sm whitespace-nowrap min-h-[44px]
                ${activeTab === tab.id
                  ? 'border-optio-purple text-optio-purple'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="mt-6">
        {activeTab === 'campaigns' && <CampaignList />}
        {activeTab === 'templates' && <TemplateLibrary />}
        {activeTab === 'segments' && <SegmentBuilder />}
        {activeTab === 'sequences' && <SequenceBuilder onUpdate={fetchSequences} />}
      </div>
    </div>
  )
}

export default CRMPage
