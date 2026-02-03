import React, { useState, useEffect } from 'react'
import api from '../../../services/api'
import toast from 'react-hot-toast'
import PromptEditorModal from './PromptEditorModal'

const PromptEditorTab = () => {
  const [components, setComponents] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedComponent, setSelectedComponent] = useState(null)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    fetchComponents()
  }, [])

  const fetchComponents = async () => {
    try {
      const response = await api.get('/api/admin/ai/prompts/components')
      setComponents(response.data.components || [])
    } catch (error) {
      toast.error('Failed to load prompt components')
    } finally {
      setLoading(false)
    }
  }

  const handleComponentClick = async (componentName) => {
    try {
      const response = await api.get(`/api/admin/ai/prompts/components/${componentName}`)
      setSelectedComponent(response.data)
      setShowModal(true)
    } catch (error) {
      toast.error('Failed to load component details')
    }
  }

  const handleModalClose = () => {
    setShowModal(false)
    setSelectedComponent(null)
    fetchComponents()
  }

  const groupedComponents = components.reduce((acc, component) => {
    const category = component.category || 'other'
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(component)
    return acc
  }, {})

  const categoryOrder = ['core', 'tutor', 'lesson', 'other']
  const categoryLabels = {
    core: 'Core System',
    tutor: 'AI Tutor',
    lesson: 'Lesson Generation',
    other: 'Other'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading prompt components...</div>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Left Sidebar - Component List */}
      <div className="w-80 border-r border-gray-200 overflow-y-auto">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-lg font-semibold text-gray-900">Prompt Components</h3>
          <p className="text-sm text-gray-600 mt-1">
            {components.length} components
          </p>
        </div>

        <div className="p-4 space-y-6">
          {categoryOrder.map(category => {
            const categoryComponents = groupedComponents[category]
            if (!categoryComponents || categoryComponents.length === 0) return null

            return (
              <div key={category}>
                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                  {categoryLabels[category]}
                </h4>
                <div className="space-y-1">
                  {categoryComponents.map(component => (
                    <button
                      key={component.name}
                      onClick={() => handleComponentClick(component.name)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">
                          {component.display_name || component.name}
                        </span>
                        {component.is_modified && (
                          <span className="w-2 h-2 bg-optio-purple rounded-full"></span>
                        )}
                      </div>
                      {component.description && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                          {component.description}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Right Panel - Instructions */}
      <div className="flex-1 p-8">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">AI Prompt Management</h2>
          <div className="prose prose-sm text-gray-600">
            <p className="mb-4">
              Manage AI prompt components used throughout the Optio platform. These prompts control
              how AI features behave and respond to users.
            </p>

            <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-2">Getting Started</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>Select a component from the left sidebar to view and edit</li>
              <li>Modified components are marked with a purple dot</li>
              <li>Components are organized by category (Core, Tutor, Lesson)</li>
              <li>Click "Reset to Default" in the editor to restore original prompts</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-2">Categories</h3>
            <dl className="space-y-3">
              <div>
                <dt className="font-medium text-gray-900">Core System</dt>
                <dd className="text-gray-600">Base prompts used across all AI features</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-900">AI Tutor</dt>
                <dd className="text-gray-600">Prompts for the Optio AI tutor chat system</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-900">Lesson Generation</dt>
                <dd className="text-gray-600">Prompts for curriculum and lesson content creation</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && selectedComponent && (
        <PromptEditorModal
          isOpen={showModal}
          onClose={handleModalClose}
          component={selectedComponent}
        />
      )}
    </div>
  )
}

export default PromptEditorTab
