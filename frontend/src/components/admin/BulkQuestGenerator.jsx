import React, { useState } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'

const BulkQuestGenerator = ({ onClose, onSuccess }) => {
  const [questCount, setQuestCount] = useState(200)
  const [similarityThreshold, setSimilarityThreshold] = useState(0.7)
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState(null)
  const [results, setResults] = useState(null)

  // Estimate cost based on quest count
  const estimatedCost = (questCount * 0.0001).toFixed(4) // $0.0001 per quest

  const handleStartGeneration = async () => {
    if (questCount < 1 || questCount > 200) {
      toast.error('Quest count must be between 1 and 200')
      return
    }

    setIsGenerating(true)
    setProgress({ current: 0, total: questCount, status: 'Starting generation...' })
    setResults(null)

    try {
      const response = await api.post('/api/admin/batch-generation/start', {
        count: questCount
      })

      if (response.data.success) {
        setResults(response.data)
        setProgress({
          current: response.data.submitted_to_review,
          total: questCount,
          status: 'Completed'
        })
        toast.success(`Successfully generated ${response.data.submitted_to_review} quests!`)

        if (onSuccess) {
          onSuccess()
        }
      } else {
        toast.error(response.data.error || 'Failed to generate quests')
      }
    } catch (error) {
      console.error('Generation error:', error)
      toast.error(error.response?.data?.error || 'Failed to generate quests')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-optio-purple to-optio-pink p-6 rounded-t-2xl">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-white">Bulk Quest Generator</h2>
            <button
              onClick={onClose}
              className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Settings */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Number of Quests to Generate
              </label>
              <input
                type="number"
                min="1"
                max="200"
                value={questCount}
                onChange={(e) => setQuestCount(parseInt(e.target.value))}
                disabled={isGenerating}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Recommended: 200 quests (~20-30 minutes)</span>
                <span className="font-semibold text-green-600">Est. cost: ${estimatedCost}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Similarity Threshold: {similarityThreshold.toFixed(1)}
              </label>
              <input
                type="range"
                min="0.5"
                max="0.9"
                step="0.1"
                value={similarityThreshold}
                onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
                disabled={isGenerating}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>More Similar (0.5)</span>
                <span>More Unique (0.9)</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Higher values require quests to be more unique
              </p>
            </div>
          </div>

          {/* Duplicate Prevention Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">Enhanced Duplicate Prevention</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>✓ Checks against ALL active quests</li>
              <li>✓ Checks against quests in review queue</li>
              <li>✓ Compares concepts, not just titles</li>
              <li>✓ Detects clustering and adjusts</li>
              <li>✓ Samples titles from entire quest history</li>
            </ul>
          </div>

          {/* Progress Display */}
          {progress && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex justify-between text-sm font-medium text-gray-700 mb-2">
                <span>Progress</span>
                <span>{progress.current} / {progress.total}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                <div
                  className="bg-gradient-to-r from-optio-purple to-optio-pink h-3 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
              <p className="text-xs text-gray-600">{progress.status}</p>
            </div>
          )}

          {/* Results Summary */}
          {results && (
            <div className="space-y-4">
              {/* Cost Display */}
              {results.estimated_cost_usd && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <div className="text-sm text-green-800 mb-1">Total API Cost</div>
                  <div className="text-2xl font-bold text-green-600">
                    ${results.estimated_cost_usd.toFixed(4)}
                  </div>
                  <div className="text-xs text-green-700 mt-1">
                    ~${(results.estimated_cost_usd / results.submitted_to_review).toFixed(6)} per quest
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-green-600">
                    {results.submitted_to_review}
                  </div>
                  <div className="text-sm text-green-800 mt-1">Generated</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-red-600">
                    {results.failed?.length || 0}
                  </div>
                  <div className="text-sm text-red-800 mt-1">Failed</div>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-yellow-600">
                    {results.clustering_warnings?.length || 0}
                  </div>
                  <div className="text-sm text-yellow-800 mt-1">Warnings</div>
                </div>
              </div>

              {/* Clustering Warnings */}
              {results.clustering_warnings && results.clustering_warnings.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h4 className="font-semibold text-yellow-900 mb-2">Clustering Detected</h4>
                  <div className="text-sm text-yellow-800 space-y-1">
                    {results.clustering_warnings.map((warning, idx) => (
                      <div key={idx}>
                        <span className="font-medium">Quest {warning.at_quest}:</span> {warning.recommendation}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recently Generated */}
              {results.generated && results.generated.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Recently Generated (Last 5)</h4>
                  <div className="space-y-2">
                    {results.generated.slice(-5).reverse().map((quest, idx) => (
                      <div key={idx} className="bg-white border border-gray-200 rounded-lg p-3">
                        <div className="flex justify-between items-start">
                          <span className="font-medium text-gray-900">{quest.quest_title}</span>
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                            Score: {quest.quality_score?.toFixed(1) || 'N/A'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* High Similarity Warnings */}
              {results.similarity_metrics && results.similarity_metrics.filter(m => m.similarity_score > 0.6).length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <h4 className="font-semibold text-orange-900 mb-2">High Similarity Warnings</h4>
                  <div className="text-sm text-orange-800 space-y-1 max-h-40 overflow-y-auto">
                    {results.similarity_metrics
                      .filter(m => m.similarity_score > 0.6)
                      .map((metric, idx) => (
                        <div key={idx}>
                          <span className="font-medium">"{metric.quest_title}"</span>
                          {' '}{(metric.similarity_score * 100).toFixed(0)}% similar to{' '}
                          <span className="font-medium">"{metric.most_similar_to}"</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            {!isGenerating ? (
              <>
                <button
                  onClick={handleStartGeneration}
                  className="flex-1 bg-gradient-to-r from-optio-purple to-optio-pink text-white py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity"
                >
                  Start Generation
                </button>
                <button
                  onClick={onClose}
                  className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                >
                  Close
                </button>
              </>
            ) : (
              <div className="flex-1 bg-gray-100 text-gray-500 py-3 rounded-lg font-semibold text-center cursor-not-allowed">
                Generating... Please Wait
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default BulkQuestGenerator
