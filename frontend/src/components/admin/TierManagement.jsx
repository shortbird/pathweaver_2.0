import React, { useState } from 'react'
// import { useAdminSubscriptionTiers, useUpdateTier, formatPrice, calculateYearlySavings } from '../../hooks/useSubscriptionTiers' // REMOVED - Phase 3 refactoring (January 2025)
import { Edit2, Save, X, Plus, Trash2, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'

const TierManagement = () => {
  // Tier management neutered - Phase 3 refactoring (January 2025)
  const tiers = []
  const isLoading = false
  const error = null
  // const { data: tiers, isLoading, error } = useAdminSubscriptionTiers()
  // const updateTier = useUpdateTier()
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({})

  const handleEdit = (tier) => {
    setEditingId(tier.id)
    setEditData({
      display_name: tier.display_name,
      price_monthly: tier.price_monthly,
      price_yearly: tier.price_yearly,
      description: tier.description,
      features: tier.features || [],
      limitations: tier.limitations || [],
      badge_text: tier.badge_text || '',
      badge_color: tier.badge_color || '',
      is_active: tier.is_active
    })
  }

  const handleCancel = () => {
    setEditingId(null)
    setEditData({})
  }

  const handleSave = async (tierId) => {
    try {
      await updateTier.mutateAsync({
        tierId,
        data: editData
      })
      toast.success('Tier updated successfully')
      setEditingId(null)
      setEditData({})
    } catch (error) {
      console.error('Error updating tier:', error)
      toast.error(error.response?.data?.error || 'Failed to update tier')
    }
  }

  const handleFeatureAdd = () => {
    setEditData({
      ...editData,
      features: [...(editData.features || []), '']
    })
  }

  const handleFeatureUpdate = (index, value) => {
    const newFeatures = [...editData.features]
    newFeatures[index] = value
    setEditData({ ...editData, features: newFeatures })
  }

  const handleFeatureRemove = (index) => {
    const newFeatures = editData.features.filter((_, i) => i !== index)
    setEditData({ ...editData, features: newFeatures })
  }

  const handleLimitationAdd = () => {
    setEditData({
      ...editData,
      limitations: [...(editData.limitations || []), '']
    })
  }

  const handleLimitationUpdate = (index, value) => {
    const newLimitations = [...editData.limitations]
    newLimitations[index] = value
    setEditData({ ...editData, limitations: newLimitations })
  }

  const handleLimitationRemove = (index) => {
    const newLimitations = editData.limitations.filter((_, i) => i !== index)
    setEditData({ ...editData, limitations: newLimitations })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-center text-red-600">
        Error loading tiers: {error.message}
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Subscription Tier Management</h2>
        <p className="text-gray-600">
          Edit tier pricing, features, and display settings. Changes update across all pages automatically.
        </p>
      </div>

      <div className="space-y-6">
        {tiers?.map((tier) => {
          const isEditing = editingId === tier.id
          const displayData = isEditing ? editData : tier
          const savings = tier.price_yearly ? calculateYearlySavings(tier.price_monthly, tier.price_yearly) : null

          return (
            <div
              key={tier.id}
              className={`bg-white rounded-lg shadow-md p-6 border-2 ${
                !tier.is_active ? 'opacity-60 border-gray-300' : 'border-gray-200'
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-sm font-medium text-gray-500">{tier.tier_key}</span>
                    {displayData.badge_text && (
                      <span className={`px-3 py-1 rounded-full text-xs font-bold text-white ${
                        displayData.badge_color === 'gradient'
                          ? 'bg-gradient-primary'
                          : displayData.badge_color === 'green'
                          ? 'bg-green-500'
                          : 'bg-gray-500'
                      }`}>
                        {displayData.badge_text}
                      </span>
                    )}
                    {isEditing ? (
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={editData.is_active}
                          onChange={(e) => setEditData({ ...editData, is_active: e.target.checked })}
                          className="rounded"
                        />
                        Active
                      </label>
                    ) : (
                      !tier.is_active && <span className="text-xs text-gray-500">(Inactive)</span>
                    )}
                  </div>

                  {isEditing ? (
                    <input
                      type="text"
                      value={editData.display_name}
                      onChange={(e) => setEditData({ ...editData, display_name: e.target.value })}
                      className="text-2xl font-bold border-b-2 border-purple-300 focus:border-purple-600 outline-none"
                    />
                  ) : (
                    <h3 className="text-2xl font-bold">{tier.display_name}</h3>
                  )}
                </div>

                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => handleSave(tier.id)}
                        disabled={updateTier.isPending}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      >
                        <Save className="w-5 h-5" />
                      </button>
                      <button
                        onClick={handleCancel}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleEdit(tier)}
                      className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Pricing */}
              <div className="mb-4 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Price</label>
                  {isEditing ? (
                    <input
                      type="number"
                      step="0.01"
                      value={editData.price_monthly}
                      onChange={(e) => setEditData({ ...editData, price_monthly: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  ) : (
                    <p className="text-2xl font-bold">{formatPrice(tier.price_monthly)}/mo</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Yearly Price</label>
                  {isEditing ? (
                    <input
                      type="number"
                      step="0.01"
                      value={editData.price_yearly || ''}
                      onChange={(e) => setEditData({ ...editData, price_yearly: e.target.value ? parseFloat(e.target.value) : null })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  ) : (
                    <div>
                      <p className="text-2xl font-bold">
                        {tier.price_yearly ? `${formatPrice(tier.price_yearly)}/yr` : 'N/A'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editData.description}
                    onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                ) : (
                  <p className="text-gray-600">{tier.description}</p>
                )}
              </div>

              {/* Badge Settings */}
              {isEditing && (
                <div className="mb-4 grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Badge Text</label>
                    <input
                      type="text"
                      value={editData.badge_text}
                      onChange={(e) => setEditData({ ...editData, badge_text: e.target.value })}
                      placeholder="e.g., POPULAR"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Badge Color</label>
                    <select
                      value={editData.badge_color}
                      onChange={(e) => setEditData({ ...editData, badge_color: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value="">None</option>
                      <option value="gradient">Gradient (Pink/Purple)</option>
                      <option value="green">Green</option>
                      <option value="blue">Blue</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Features */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Features</label>
                  {isEditing && (
                    <button
                      onClick={handleFeatureAdd}
                      className="text-sm text-purple-600 hover:text-purple-800 flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      Add Feature
                    </button>
                  )}
                </div>
                <ul className="space-y-2">
                  {displayData.features?.map((feature, index) => (
                    <li key={index} className="flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <input
                            type="text"
                            value={feature}
                            onChange={(e) => handleFeatureUpdate(index, e.target.value)}
                            className="flex-1 px-3 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          />
                          <button
                            onClick={() => handleFeatureRemove(index)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-green-500">✓</span>
                          <span className="text-gray-700">{feature}</span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Limitations */}
              {(displayData.limitations?.length > 0 || isEditing) && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">Limitations</label>
                    {isEditing && (
                      <button
                        onClick={handleLimitationAdd}
                        className="text-sm text-purple-600 hover:text-purple-800 flex items-center gap-1"
                      >
                        <Plus className="w-4 h-4" />
                        Add Limitation
                      </button>
                    )}
                  </div>
                  <ul className="space-y-2">
                    {displayData.limitations?.map((limitation, index) => (
                      <li key={index} className="flex items-center gap-2">
                        {isEditing ? (
                          <>
                            <input
                              type="text"
                              value={limitation}
                              onChange={(e) => handleLimitationUpdate(index, e.target.value)}
                              className="flex-1 px-3 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            />
                            <button
                              onClick={() => handleLimitationRemove(index)}
                              className="text-red-600 hover:text-red-800"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <X className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-500 line-through text-sm">{limitation}</span>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default TierManagement
