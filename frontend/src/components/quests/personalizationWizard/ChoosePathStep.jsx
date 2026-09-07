// Step 5: the quest's curated paths, plus the flag-a-task modal and the footer
// that cancels out of the whole wizard. They share this block because the modal
// and the footer sit outside the step panels in the original layout.
import React from 'react';

const ChoosePathStep = ({
  ApproachExampleCard, creationMethod, embedded, flagReason, setFlagReason,
  handleFlagTask, handleSelectPath, hasPaths, loading, onCancel, paths,
  selectingPathIndex, setSelectingPathIndex, setCreationMethod, setError,
  setShowFlagModal, setStep, showFlagModal, step, sz, xpThreshold,
}) => (
  <>
  {step === 5 && creationMethod === 'path' && hasPaths && (
    <div>
      <h2 className={sz.heading}>
        Choose a Path
      </h2>
      <p className={sz.subheading}>
        Pick a ready-made set of tasks to get started. You can edit, add, or
        remove tasks afterward.
        {xpThreshold
          ? ` Each path's tasks add up to about ${xpThreshold} XP — enough to complete the quest.`
          : ''}
      </p>

      <div className={`grid grid-cols-1 sm:grid-cols-2 ${embedded ? 'gap-3 mb-4' : 'gap-4 mb-6'}`}>
        {paths.map((path, index) => (
          <ApproachExampleCard
            key={`${path.label}-${index}`}
            label={path.label}
            description={path.description}
            tasks={path.tasks || []}
            xpThreshold={xpThreshold || null}
            accentColor={['purple-50', 'pink-50', 'blue-50', 'teal-50'][index % 4]}
            isEnrolled={false}
            isSelecting={selectingPathIndex === index}
            onSelect={() => handleSelectPath(index)}
          />
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:justify-between">
        <button
          onClick={() => {
            setStep(1);
            setCreationMethod(null);
            setSelectingPathIndex(null);
            setError(null);
          }}
          disabled={selectingPathIndex !== null}
          className={sz.navBtn}
        >
          Back
        </button>
      </div>
    </div>
  )}

  {/* Flag Modal — in-flow card in embedded (LTI iframe) mode, where a
      fixed overlay would center against the full iframe height and clip */}
  {showFlagModal && (
    <div
      className={
        embedded
          ? 'my-4'
          : 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4'
      }
    >
      <div
        className={
          embedded
            ? 'bg-white rounded-2xl p-6 max-w-md w-full mx-auto border-2 border-yellow-300'
            : 'bg-white rounded-2xl p-8 max-w-md w-full'
        }
      >
        <h3 id="flag-modal-title" className={embedded ? 'text-lg font-bold mb-2' : 'text-2xl font-bold mb-4'}>
          Flag This Task
        </h3>
        <p id="flag-modal-description" className={embedded ? 'text-gray-600 text-sm mb-3' : 'text-gray-600 mb-4'}>
          Help us improve by reporting tasks that don't make sense or are inappropriate.
        </p>
        <textarea
          id="flag-reason"
          value={flagReason}
          onChange={(e) => setFlagReason(e.target.value)}
          placeholder="Why are you flagging this task? (optional)"
          className={`w-full border-2 border-gray-200 resize-none focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent mb-4 min-h-[44px] ${
            embedded ? 'p-2 rounded-lg text-sm' : 'p-4 rounded-xl'
          }`}
          rows={embedded ? 2 : 4}
          aria-labelledby="flag-modal-title"
          aria-describedby="flag-modal-description"
        />
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => {
              setShowFlagModal(false);
              setFlagReason('');
            }}
            className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 font-semibold transition-all min-h-[44px]"
          >
            Cancel
          </button>
          <button
            onClick={handleFlagTask}
            disabled={loading}
            className="flex-1 px-6 py-3 bg-yellow-500 text-white rounded-xl hover:bg-yellow-600 font-bold transition-all disabled:opacity-50 min-h-[44px]"
          >
            {loading ? 'Flagging...' : 'Submit Flag'}
          </button>
        </div>
      </div>
    </div>
  )}

  {/* Cancel button (always visible) */}
  <div className={embedded ? 'mt-4 text-center' : 'mt-8 text-center'}>
    <button
      onClick={onCancel}
      className="text-gray-500 hover:text-gray-700 text-sm min-h-[44px]"
    >
      Cancel Personalization
    </button>
  </div>
  </>
);

export default ChoosePathStep;
