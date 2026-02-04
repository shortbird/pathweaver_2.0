import React from 'react'
import {
  StatusBadge,
  UploadProgressView,
  UploadHistoryTable,
  UploadDetailModal,
} from '../../components/admin/curriculum-upload'
import useCurriculumUploadState from '../../hooks/useCurriculumUploadState'

const CurriculumUploadPage = () => {
  const state = useCurriculumUploadState()

  // Show progress/success state after upload started
  if (state.uploadStarted) {
    return (
      <UploadProgressView
        progress={state.progress}
        onResume={state.handleResume}
        onReset={state.handleReset}
      />
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">AI Curriculum Upload</h2>
        <p className="text-gray-600 mt-1">
          Upload curriculum from various formats. AI will create a draft course with lessons that you can edit in the Course Builder.
        </p>
      </div>

      {/* Input Method Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-4">
          <button
            onClick={() => state.setActiveTab('file')}
            className={`pb-3 px-1 font-medium ${
              state.activeTab === 'file'
                ? 'border-b-2 border-optio-purple text-optio-purple'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            File Upload
          </button>
          <button
            onClick={() => state.setActiveTab('text')}
            className={`pb-3 px-1 font-medium ${
              state.activeTab === 'text'
                ? 'border-b-2 border-optio-purple text-optio-purple'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Paste Text
          </button>
          <button
            onClick={() => state.setActiveTab('generate')}
            className={`pb-3 px-1 font-medium ${
              state.activeTab === 'generate'
                ? 'border-b-2 border-optio-purple text-optio-purple'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Generate from Prompt
          </button>
        </div>
      </div>

      {/* File Upload Tab */}
      {state.activeTab === 'file' && (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            state.dragActive
              ? 'border-optio-purple bg-purple-50'
              : state.file
              ? 'border-green-400 bg-green-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragEnter={state.handleDrag}
          onDragLeave={state.handleDrag}
          onDragOver={state.handleDrag}
          onDrop={state.handleDrop}
        >
          {state.file ? (
            <div>
              <div className="text-green-600 mb-2">
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="font-medium text-gray-900">{state.file.name}</p>
              <p className="text-sm text-gray-500">{(state.file.size / 1024 / 1024).toFixed(2)} MB</p>
              <div className="mt-3 flex justify-center gap-3">
                {state.isImsccFile && (
                  <button
                    onClick={state.handleDiagnose}
                    disabled={state.diagnosing}
                    className="px-4 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 disabled:opacity-50 flex items-center gap-2"
                  >
                    {state.diagnosing ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-700 border-t-transparent"></div>
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                        Diagnose File
                      </>
                    )}
                  </button>
                )}
                <button
                  onClick={() => { state.setFile(null); state.setDiagnosticResults(null); }}
                  className="px-4 py-1.5 text-sm text-red-600 hover:text-red-800"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div>
              <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-gray-600 mb-2">
                Drag and drop your curriculum file here, or{' '}
                <label className="text-optio-purple hover:underline cursor-pointer">
                  browse
                  <input
                    type="file"
                    className="hidden"
                    accept=".imscc,.zip,.pdf,.docx,.doc"
                    onChange={state.handleFileInputChange}
                  />
                </label>
              </p>
              <p className="text-sm text-gray-500">
                Supported formats: Canvas (.imscc), PDF, Word (.docx)
              </p>
            </div>
          )}
        </div>
      )}

      {/* Text Paste Tab */}
      {state.activeTab === 'text' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title (optional)
            </label>
            <input
              type="text"
              value={state.textTitle}
              onChange={(e) => state.setTextTitle(e.target.value)}
              placeholder="e.g., Introduction to Biology"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Curriculum Content
            </label>
            <textarea
              value={state.textContent}
              onChange={(e) => state.setTextContent(e.target.value)}
              placeholder="Paste your syllabus, lesson plan, or curriculum outline here..."
              rows={12}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent font-mono text-sm"
            />
            <p className="text-sm text-gray-500 mt-1">
              {state.textContent.length.toLocaleString()} characters
            </p>
          </div>
        </div>
      )}

      {/* Generate from Prompt Tab */}
      {state.activeTab === 'generate' && (
        <div className="space-y-6">
          <div className="p-6 bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 border border-optio-purple/20 rounded-lg text-center">
            <svg className="w-16 h-16 mx-auto text-optio-purple mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Course Plan Mode</h3>
            <p className="text-gray-600 mb-6 max-w-lg mx-auto">
              Design courses through conversation with AI. Describe what you want to create,
              refine the outline through natural dialogue, then generate the full course.
            </p>
            <a
              href="/course-plan"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Start Plan Mode
            </a>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 bg-white border border-gray-200 rounded-lg">
              <div className="w-10 h-10 mx-auto mb-2 bg-purple-100 text-optio-purple rounded-full flex items-center justify-center">
                <span className="font-bold">1</span>
              </div>
              <h4 className="font-medium text-gray-900 text-sm">Describe Your Course</h4>
              <p className="text-xs text-gray-500 mt-1">Tell AI about the student and what they want to learn</p>
            </div>
            <div className="p-4 bg-white border border-gray-200 rounded-lg">
              <div className="w-10 h-10 mx-auto mb-2 bg-purple-100 text-optio-purple rounded-full flex items-center justify-center">
                <span className="font-bold">2</span>
              </div>
              <h4 className="font-medium text-gray-900 text-sm">Refine Through Chat</h4>
              <p className="text-xs text-gray-500 mt-1">Iterate on the outline until it is perfect</p>
            </div>
            <div className="p-4 bg-white border border-gray-200 rounded-lg">
              <div className="w-10 h-10 mx-auto mb-2 bg-purple-100 text-optio-purple rounded-full flex items-center justify-center">
                <span className="font-bold">3</span>
              </div>
              <h4 className="font-medium text-gray-900 text-sm">Approve & Generate</h4>
              <p className="text-xs text-gray-500 mt-1">Create the full course with lessons and tasks</p>
            </div>
          </div>

          <div className="text-center border-t border-gray-200 pt-6">
            <p className="text-sm text-gray-500 mb-2">Or use the classic wizard:</p>
            <div className="flex items-center justify-center gap-4">
              <a
                href="/admin/generate-course"
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Course Wizard
              </a>
              <a
                href="/admin/course-generation-queue"
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                View Queue
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Diagnostic Results */}
      {state.diagnosticResults && (
        <DiagnosticResultsSection
          diagnosticResults={state.diagnosticResults}
          selectedContentTypes={state.selectedContentTypes}
          setSelectedContentTypes={state.setSelectedContentTypes}
          onClose={() => state.setDiagnosticResults(null)}
        />
      )}

      {/* Learning Objectives (shown for file/text uploads) */}
      {(state.activeTab === 'file' || state.activeTab === 'text') && (
        <div className="mt-8 p-6 bg-gray-50 rounded-lg">
          <h3 className="font-medium text-gray-900 mb-4">Learning Objectives (Optional)</h3>
          <p className="text-sm text-gray-500 mb-3">
            Enter course learning objectives, one per line. Each objective will become a Project/Quest.
            If left blank, projects will be created from the content structure.
          </p>
          <textarea
            value={state.learningObjectives}
            onChange={(e) => state.setLearningObjectives(e.target.value)}
            placeholder="Example:&#10;Understand the fundamentals of web development&#10;Build responsive layouts using CSS&#10;Create interactive web pages with JavaScript"
            rows={5}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple resize-y"
          />
          {state.learningObjectives.trim() && (
            <p className="text-sm text-gray-500 mt-2">
              {state.learningObjectives.trim().split('\n').filter(line => line.trim()).length} objective(s) will create {state.learningObjectives.trim().split('\n').filter(line => line.trim()).length} project(s)
            </p>
          )}
        </div>
      )}

      {/* Info Box */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">How it works</p>
            <p>
              AI will analyze your curriculum and create a draft course with lessons.
              You'll receive a notification when it's ready, then you can edit everything
              in the Course Builder before publishing.
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={state.handleReset}
          className="px-4 py-2 text-gray-700 hover:text-gray-900"
        >
          Reset
        </button>
        <button
          onClick={state.handleUpload}
          disabled={state.uploading || (state.activeTab === 'file' && !state.file) || (state.activeTab === 'text' && !state.textContent.trim()) || (state.activeTab === 'generate' && !state.courseTopic.trim())}
          className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {state.uploading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              Starting...
            </>
          ) : state.activeTab === 'generate' ? (
            'Generate Course'
          ) : (
            'Process Curriculum'
          )}
        </button>
      </div>

      {/* Recent Uploads Table */}
      <div className="mt-10 pt-8 border-t border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Recent Uploads</h3>
          <button
            onClick={state.fetchHistory}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        <UploadHistoryTable
          uploadHistory={state.uploadHistory}
          historyLoading={state.historyLoading}
          currentUploadId={state.uploadId}
          onRefresh={state.fetchHistory}
          onSelectUpload={state.setSelectedUpload}
          onCancelUpload={state.handleCancelUpload}
        />
      </div>

      {/* Upload Detail Modal */}
      <UploadDetailModal
        upload={state.selectedUpload}
        onClose={() => state.setSelectedUpload(null)}
        onRefresh={state.fetchHistory}
      />
    </div>
  )
}

/**
 * Diagnostic results section - inline component for IMSCC file analysis.
 */
function DiagnosticResultsSection({ diagnosticResults, selectedContentTypes, setSelectedContentTypes, onClose }) {
  return (
    <div className="mt-6 p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          IMSCC File Diagnostic Report
        </h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Course Info */}
      <div className="mb-4 pb-4 border-b border-gray-100">
        <p className="text-sm text-gray-600">
          <span className="font-medium">Course:</span> {diagnosticResults.course_title || 'Unknown'}
        </p>
        <p className="text-sm text-gray-600">
          <span className="font-medium">Total Files:</span> {diagnosticResults.total_files?.toLocaleString()}
        </p>
      </div>

      {/* Coverage Estimate */}
      <div className="mb-4 p-4 bg-blue-50 rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-blue-900">Extraction Coverage</span>
          <span className="text-2xl font-bold text-blue-700">{diagnosticResults.coverage_estimate}</span>
        </div>
        <p className="text-xs text-blue-700 mt-1">
          Percentage of content that will be available to AI
        </p>
      </div>

      {/* Content Type Selection */}
      <div className="mb-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Select Content to Include</h4>
        <p className="text-xs text-gray-500 mb-3">Check the content types you want the AI to process</p>
        <div className="grid grid-cols-2 gap-2">
          {diagnosticResults.resources && Object.entries(diagnosticResults.resources)
            .filter(([type]) => ['assignments', 'pages', 'discussions', 'quizzes'].includes(type))
            .map(([type, data]) => {
              const isSelectable = data.extracted || data.found > 0
              const isSelected = selectedContentTypes[type]
              const canExtract = data.extracted

              return (
                <label
                  key={type}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    !isSelectable
                      ? 'bg-gray-50 border-gray-200 opacity-50 cursor-not-allowed'
                      : isSelected
                      ? 'bg-optio-purple/10 border-optio-purple'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected && isSelectable}
                      disabled={!isSelectable}
                      onChange={(e) => {
                        setSelectedContentTypes(prev => ({
                          ...prev,
                          [type]: e.target.checked
                        }))
                      }}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple disabled:opacity-50"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium capitalize">{type}</span>
                        <span className={`text-lg font-semibold ${
                          data.found > 0 ? 'text-gray-900' : 'text-gray-400'
                        }`}>
                          {data.found}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        {!isSelectable ? (
                          <span className="text-xs text-gray-400">None found</span>
                        ) : canExtract ? (
                          <span className="text-xs text-green-600">Ready to extract</span>
                        ) : (
                          <span className="text-xs text-yellow-600">Coming soon</span>
                        )}
                      </div>
                    </div>
                  </div>
                </label>
              )
            })}
        </div>
        <div className="mt-3 text-xs text-gray-500">
          {Object.entries(selectedContentTypes).filter(([type, selected]) =>
            selected && diagnosticResults.resources?.[type]?.found > 0
          ).length} content type(s) selected for processing
        </div>
      </div>

      {/* Module/Refs Summary */}
      <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
        <div className="text-center">
          <div className="text-xl font-semibold text-gray-900">{diagnosticResults.modules_found || 0}</div>
          <div className="text-xs text-gray-500">Modules</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-semibold text-gray-900">{diagnosticResults.assignment_refs_found || 0}</div>
          <div className="text-xs text-gray-500">Assignments</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-semibold text-gray-900">{diagnosticResults.page_refs_found || 0}</div>
          <div className="text-xs text-gray-500">Pages</div>
        </div>
      </div>

      {/* Sample Files */}
      {diagnosticResults.file_sample && diagnosticResults.file_sample.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-gray-600 hover:text-gray-900 font-medium">
            View sample files ({diagnosticResults.file_sample.length} of {diagnosticResults.total_files})
          </summary>
          <div className="mt-2 max-h-40 overflow-y-auto bg-gray-50 rounded p-2">
            {diagnosticResults.file_sample.map((file, i) => (
              <div key={i} className="text-xs text-gray-600 font-mono truncate py-0.5">
                {file}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

export default CurriculumUploadPage
