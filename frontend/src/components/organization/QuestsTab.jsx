import React, { useState } from 'react'
import api from '../../services/api'
import QuestVisibilityManager from '../admin/QuestVisibilityManager'

export default function QuestsTab({ orgId, orgData, onUpdate, siteSettings }) {
  const [policy, setPolicy] = useState(orgData?.organization?.quest_visibility_policy || 'all_optio')
  const [saving, setSaving] = useState(false)
  const [showPolicyOptions, setShowPolicyOptions] = useState(false)

  const policyOptions = [
    { value: 'all_optio', label: 'All Optio + Org Quests', short: 'All quests available' },
    { value: 'curated', label: 'Curated Library', short: 'You control availability' },
    { value: 'private_only', label: 'Org Quests Only', short: 'Only your quests' }
  ]

  const currentPolicy = policyOptions.find(p => p.value === policy)

  const handleSavePolicy = async (newPolicy) => {
    setSaving(true)
    try {
      await api.put(`/api/admin/organizations/${orgId}`, {
        quest_visibility_policy: newPolicy
      })
      setPolicy(newPolicy)
      setShowPolicyOptions(false)
      onUpdate()
    } catch (error) {
      console.error('Failed to update policy:', error)
      alert(error.response?.data?.error || 'Failed to update policy')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Quest Visibility Policy - Compact */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-gray-500">Visibility Policy:</span>
            <span className="ml-2 font-semibold text-gray-900">{currentPolicy?.label}</span>
            <span className="ml-2 text-sm text-gray-500">({currentPolicy?.short})</span>
          </div>
          <button
            onClick={() => setShowPolicyOptions(!showPolicyOptions)}
            className="text-sm text-optio-purple hover:underline font-medium"
          >
            {showPolicyOptions ? 'Cancel' : 'Change'}
          </button>
        </div>

        {showPolicyOptions && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex flex-wrap gap-2">
              {policyOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleSavePolicy(option.value)}
                  disabled={saving || option.value === orgData?.organization?.quest_visibility_policy}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    option.value === orgData?.organization?.quest_visibility_policy
                      ? 'bg-optio-purple text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  } disabled:opacity-50`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {policy === 'curated' ? 'Toggle availability for each quest below.' :
               policy === 'private_only' ? 'Only quests created by your organization will be visible.' :
               'All Optio quests are automatically available to students.'}
            </p>
          </div>
        )}
      </div>

      {/* Quest Visibility Manager */}
      <QuestVisibilityManager
        orgId={orgId}
        orgData={orgData}
        onUpdate={onUpdate}
        siteSettings={siteSettings}
      />
    </div>
  )
}
