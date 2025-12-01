import React, { useState, useEffect } from 'react'
import { crmAPI } from '../../../services/crmAPI'
import toast from 'react-hot-toast'
import CampaignCreator from './CampaignCreator'

const CampaignList = () => {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreator, setShowCreator] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')

  useEffect(() => {
    fetchCampaigns()
  }, [filterStatus])

  const fetchCampaigns = async () => {
    try {
      setLoading(true)
      const params = filterStatus !== 'all' ? { status: filterStatus } : {}
      const response = await crmAPI.getCampaigns(params)
      setCampaigns(response.data)
    } catch (error) {
      toast.error('Failed to load campaigns')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleSendCampaign = async (campaign) => {
    const confirmed = window.confirm(
      `Send campaign "${campaign.name}" to ${campaign.estimated_recipients || 0} recipients?`
    )
    if (!confirmed) return

    try {
      await crmAPI.sendCampaign(campaign.id, false)
      toast.success('Campaign sent successfully!')
      fetchCampaigns()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to send campaign')
    }
  }

  const handleDuplicateCampaign = async (campaign) => {
    try {
      const duplicateData = {
        ...campaign,
        name: `${campaign.name} (Copy)`,
        status: 'draft'
      }
      delete duplicateData.id
      delete duplicateData.created_at
      delete duplicateData.updated_at
      delete duplicateData.sent_at

      await crmAPI.createCampaign(duplicateData)
      toast.success('Campaign duplicated!')
      fetchCampaigns()
    } catch (error) {
      toast.error('Failed to duplicate campaign')
    }
  }

  const handleDeleteCampaign = async (campaign) => {
    const confirmed = window.confirm(`Delete campaign "${campaign.name}"? This cannot be undone.`)
    if (!confirmed) return

    try {
      await crmAPI.deleteCampaign(campaign.id)
      toast.success('Campaign deleted')
      fetchCampaigns()
    } catch (error) {
      toast.error('Failed to delete campaign')
    }
  }

  const getStatusBadge = (status) => {
    const styles = {
      draft: 'bg-gray-100 text-gray-800',
      active: 'bg-green-100 text-green-800',
      scheduled: 'bg-blue-100 text-blue-800',
      sent: 'bg-purple-100 text-purple-800',
      paused: 'bg-yellow-100 text-yellow-800'
    }
    return (
      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${styles[status] || styles.draft}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  const getCampaignType = (type) => {
    const labels = {
      manual: 'One-Time',
      scheduled: 'Scheduled',
      triggered: 'Automated'
    }
    return labels[type] || type
  }

  if (showCreator) {
    return (
      <CampaignCreator
        campaign={editingCampaign}
        onClose={() => {
          setShowCreator(false)
          setEditingCampaign(null)
        }}
        onSave={() => {
          setShowCreator(false)
          setEditingCampaign(null)
          fetchCampaigns()
        }}
      />
    )
  }

  return (
    <div>
      {/* Header with filters and create button */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-2">
          {['all', 'draft', 'active', 'scheduled', 'sent', 'paused'].map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                filterStatus === status
                  ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowCreator(true)}
          className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:opacity-90"
        >
          Create Campaign
        </button>
      </div>

      {/* Campaigns table */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500">No campaigns found. Create your first campaign to get started!</p>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Campaign Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Recipients
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Sent At
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {campaigns.map(campaign => (
                <tr key={campaign.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-semibold text-gray-900">{campaign.name}</div>
                    <div className="text-sm text-gray-500">{campaign.template_key}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {getCampaignType(campaign.campaign_type)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(campaign.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {campaign.estimated_recipients || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {campaign.sent_at ? new Date(campaign.sent_at).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => {
                        setEditingCampaign(campaign)
                        setShowCreator(true)
                      }}
                      className="text-optio-purple hover:text-optio-purple-dark mr-3"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDuplicateCampaign(campaign)}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      Duplicate
                    </button>
                    {campaign.status === 'draft' && (
                      <button
                        onClick={() => handleSendCampaign(campaign)}
                        className="text-green-600 hover:text-green-900 mr-3"
                      >
                        Send Now
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteCampaign(campaign)}
                      className="text-red-600 hover:text-red-900"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default CampaignList
