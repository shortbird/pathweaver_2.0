import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  XMarkIcon,
  SparklesIcon,
  CheckIcon,
  UserIcon,
  ClockIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  RocketLaunchIcon,
} from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import { parentAPI } from '../../services/api';

const ACTIVITY_TYPES = [
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'indoor', label: 'Indoor' },
  { value: 'creative', label: 'Creative' },
  { value: 'educational', label: 'Educational' },
  { value: 'physical', label: 'Physical' },
  { value: 'cooking', label: 'Cooking' },
  { value: 'community_service', label: 'Community Service' },
];

const TIME_OPTIONS = [
  { value: 'quick', label: 'Quick', desc: '1-2 hours' },
  { value: 'afternoon', label: 'Afternoon', desc: '3-4 hours' },
  { value: 'weekend', label: 'Weekend', desc: 'Full day' },
  { value: 'multi_day', label: 'Multi-day', desc: '2-3 days' },
];

const PILLAR_OPTIONS = [
  { value: 'stem', label: 'STEM', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { value: 'wellness', label: 'Wellness', color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'communication', label: 'Communication', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'civics', label: 'Civics', color: 'bg-orange-100 text-orange-700 border-orange-300' },
  { value: 'art', label: 'Art', color: 'bg-pink-100 text-pink-700 border-pink-300' },
];

const PILLAR_DOT_COLORS = {
  stem: 'bg-blue-500',
  wellness: 'bg-green-500',
  communication: 'bg-yellow-500',
  civics: 'bg-orange-500',
  art: 'bg-pink-500',
};

const FamilyQuestIdeaGenerator = ({
  isOpen,
  onClose,
  children = [],
  dependents = [],
  onFallbackToManual,
  onComplete,
}) => {
  const [step, setStep] = useState(1);

  // Step 1: Preferences
  const [activityTypes, setActivityTypes] = useState([]);
  const [timeCommitment, setTimeCommitment] = useState('afternoon');
  const [themePreference, setThemePreference] = useState('');
  const [focusAreas, setFocusAreas] = useState([]);
  const [constraints, setConstraints] = useState('');

  // Step 2: Generated ideas
  const [questIdeas, setQuestIdeas] = useState([]);
  const [familySummary, setFamilySummary] = useState(null);
  const [childrenData, setChildrenData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedIdea, setExpandedIdea] = useState(null);

  // Step 3: Review & Refine
  const [selectedIdea, setSelectedIdea] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [refining, setRefining] = useState(false);

  // Step 4: Child selection
  const allChildren = [
    ...children.map(c => ({
      id: c.student_id,
      name: c.student_first_name + (c.student_last_name ? ` ${c.student_last_name}` : ''),
      type: 'linked',
    })),
    ...dependents.map(d => ({
      id: d.id,
      name: d.display_name,
      type: 'dependent',
    })),
  ];
  const [selectedChildIds, setSelectedChildIds] = useState(new Set(allChildren.map(c => c.id)));

  // Step 5: Creating
  const [creating, setCreating] = useState(false);
  const [createdQuest, setCreatedQuest] = useState(null);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const response = await parentAPI.generateFamilyQuestIdeas({
        activity_types: activityTypes.length > 0 ? activityTypes : ['any'],
        time_commitment: timeCommitment,
        theme_preference: themePreference,
        focus_areas: focusAreas,
        constraints: constraints,
      });

      if (response.data.success) {
        setQuestIdeas(response.data.quest_ideas || []);
        setFamilySummary(response.data.family_summary || null);
        setChildrenData(response.data.children || []);
        setStep(2);
      } else {
        toast.error(response.data.error || 'Failed to generate ideas');
      }
    } catch (error) {
      console.error('Error generating quest ideas:', error);
      toast.error(error.response?.data?.error || 'Failed to generate quest ideas');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectIdea = (idea) => {
    setSelectedIdea(idea);
    setFeedback('');
    setStep(3);
  };

  const handleRefine = async () => {
    if (!feedback.trim()) return;
    setRefining(true);
    try {
      const response = await parentAPI.refineFamilyQuestIdea({
        quest_idea: selectedIdea,
        feedback: feedback.trim(),
        preferences: {
          activity_types: activityTypes.length > 0 ? activityTypes : ['any'],
          time_commitment: timeCommitment,
          theme_preference: themePreference,
          focus_areas: focusAreas,
          constraints: constraints,
        },
      });

      if (response.data.success) {
        setSelectedIdea(response.data.refined_idea);
        setFeedback('');
        toast.success('Quest idea refined');
      } else {
        toast.error(response.data.error || 'Failed to refine idea');
      }
    } catch (error) {
      console.error('Error refining quest idea:', error);
      toast.error(error.response?.data?.error || 'Failed to refine idea');
    } finally {
      setRefining(false);
    }
  };

  const handleAccept = async () => {
    if (selectedChildIds.size === 0) {
      toast.error('Please select at least one child');
      return;
    }
    setCreating(true);
    try {
      const response = await parentAPI.acceptFamilyQuestIdea({
        quest_idea: selectedIdea,
        selected_children: Array.from(selectedChildIds),
      });

      if (response.data.success) {
        setCreatedQuest({
          id: response.data.quest_id,
          title: response.data.quest_title,
          enrolled: response.data.enrolled,
        });
        setStep(5);
      } else {
        toast.error(response.data.error || 'Failed to create quest');
      }
    } catch (error) {
      console.error('Error creating quest:', error);
      toast.error(error.response?.data?.error || 'Failed to create quest');
    } finally {
      setCreating(false);
    }
  };

  const handleTryAgain = () => {
    setQuestIdeas([]);
    setExpandedIdea(null);
    setStep(1);
  };

  const toggleFocusArea = (value) => {
    setFocusAreas(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    );
  };

  const toggleChild = (id) => {
    setSelectedChildIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleClose = () => {
    // Reset state
    setStep(1);
    setQuestIdeas([]);
    setSelectedIdea(null);
    setFeedback('');
    setCreatedQuest(null);
    setExpandedIdea(null);
    onClose();
  };

  // Render step indicator
  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-2 py-3">
      {[1, 2, 3, 4, 5].map(s => (
        <div
          key={s}
          className={`w-2 h-2 rounded-full transition-colors ${
            s === step ? 'bg-optio-purple w-6' : s < step ? 'bg-optio-pink' : 'bg-gray-200'
          }`}
        />
      ))}
    </div>
  );

  // Step 1: Preferences Form
  const renderPreferences = () => (
    <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
      {/* Activity Type */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Activity Type</label>
        <div className="flex flex-wrap gap-2">
          {ACTIVITY_TYPES.map(type => (
            <button
              key={type.value}
              onClick={() => setActivityTypes(prev =>
                prev.includes(type.value) ? prev.filter(v => v !== type.value) : [...prev, type.value]
              )}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                activityTypes.includes(type.value)
                  ? 'bg-optio-purple text-white border-optio-purple'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-optio-purple hover:text-optio-purple'
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* Time Commitment */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Time Commitment</label>
        <div className="grid grid-cols-2 gap-2">
          {TIME_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setTimeCommitment(opt.value)}
              className={`px-3 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                timeCommitment === opt.value
                  ? 'border-optio-purple bg-optio-purple/5 text-optio-purple'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <div>{opt.label}</div>
              <div className="text-xs text-gray-400">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Theme */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Theme <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={themePreference}
          onChange={e => setThemePreference(e.target.value)}
          placeholder="What sounds fun to your family?"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent"
          maxLength={200}
        />
      </div>

      {/* Focus Areas */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Focus Areas <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {PILLAR_OPTIONS.map(pillar => (
            <button
              key={pillar.value}
              onClick={() => toggleFocusArea(pillar.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                focusAreas.includes(pillar.value)
                  ? pillar.color + ' border-current'
                  : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
              }`}
            >
              {pillar.label}
            </button>
          ))}
        </div>
      </div>

      {/* Constraints */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Constraints <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={constraints}
          onChange={e => setConstraints(e.target.value)}
          placeholder="Any limitations? (allergies, budget, etc.)"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent"
          maxLength={200}
        />
      </div>

      {/* Fallback link */}
      <div className="text-center pt-2">
        <button
          onClick={() => {
            handleClose();
            onFallbackToManual && onFallbackToManual();
          }}
          className="text-sm text-gray-400 hover:text-gray-600 underline"
        >
          or create manually
        </button>
      </div>
    </div>
  );

  // Step 2: Quest Ideas
  const renderIdeas = () => (
    <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
      {familySummary && (
        <div className="text-xs text-gray-400 text-center mb-2">
          {familySummary.child_count} {familySummary.child_count === 1 ? 'child' : 'children'} | Ages {familySummary.age_range} | {familySummary.season}
        </div>
      )}

      {questIdeas.map((idea, idx) => {
        const isExpanded = expandedIdea === idx;
        return (
          <div
            key={idx}
            className="border-2 border-gray-200 rounded-xl overflow-hidden hover:border-optio-purple/30 transition-colors"
          >
            {/* Card header */}
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900 text-base" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    {idea.title}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">{idea.description}</p>
                </div>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-2 mt-3">
                {idea.estimated_time && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                    <ClockIcon className="w-3 h-3" />
                    {idea.estimated_time}
                  </span>
                )}
                {idea.activity_type && (
                  <span className="text-xs px-2 py-0.5 bg-optio-purple/10 text-optio-purple rounded-full capitalize">
                    {idea.activity_type.replace('_', ' ')}
                  </span>
                )}
                {(idea.pillar_coverage || []).map(p => (
                  <span key={p} className={`w-3 h-3 rounded-full ${PILLAR_DOT_COLORS[p] || 'bg-gray-300'}`} title={p} />
                ))}
              </div>

              {/* Interest bridge */}
              {idea.interest_bridge && (
                <p className="text-xs text-optio-pink mt-2 italic">
                  {idea.interest_bridge}
                </p>
              )}

              {/* Expand/collapse tasks */}
              <button
                onClick={() => setExpandedIdea(isExpanded ? null : idx)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mt-2"
              >
                {isExpanded ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
                {isExpanded ? 'Hide tasks' : 'Preview tasks'}
              </button>

              {/* Expanded task preview */}
              {isExpanded && (
                <div className="mt-3 space-y-3">
                  {/* Shared tasks */}
                  {(idea.shared_tasks || []).length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                        Shared Tasks (whole family)
                      </div>
                      {idea.shared_tasks.map((task, ti) => (
                        <div key={ti} className="text-sm text-gray-700 pl-3 border-l-2 border-optio-purple/30 mb-2">
                          <div className="font-medium">{task.title}</div>
                          <div className="text-xs text-gray-400">{task.description}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Individual tasks */}
                  {idea.individual_tasks && Object.entries(idea.individual_tasks).map(([childName, tasks]) => (
                    <div key={childName}>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                        {childName}'s Tasks
                      </div>
                      {(tasks || []).map((task, ti) => (
                        <div key={ti} className="text-sm text-gray-700 pl-3 border-l-2 border-optio-pink/30 mb-2">
                          <div className="font-medium">{task.title}</div>
                          <div className="text-xs text-gray-400">{task.description}</div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Card footer */}
            <div className="px-4 py-3 bg-gray-50 flex justify-end">
              <button
                onClick={() => handleSelectIdea(idea)}
                className="px-4 py-1.5 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg text-sm font-semibold hover:shadow-md transition-shadow"
              >
                Choose This One
              </button>
            </div>
          </div>
        );
      })}

      {questIdeas.length === 0 && !loading && (
        <p className="text-center text-gray-400 py-8">No ideas were generated. Try different preferences.</p>
      )}
    </div>
  );

  // Step 3: Review & Refine
  const renderReview = () => {
    if (!selectedIdea) return null;
    return (
      <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
        <h3 className="font-bold text-lg text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          {selectedIdea.title}
        </h3>
        <p className="text-sm text-gray-600">{selectedIdea.description}</p>

        <div className="flex flex-wrap gap-2">
          {selectedIdea.estimated_time && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
              <ClockIcon className="w-3 h-3" />
              {selectedIdea.estimated_time}
            </span>
          )}
          {(selectedIdea.pillar_coverage || []).map(p => (
            <span key={p} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full capitalize">{p}</span>
          ))}
        </div>

        {selectedIdea.interest_bridge && (
          <p className="text-xs text-optio-pink italic">{selectedIdea.interest_bridge}</p>
        )}

        {/* Shared tasks */}
        {(selectedIdea.shared_tasks || []).length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Shared Tasks (whole family)</h4>
            {selectedIdea.shared_tasks.map((task, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-lg p-3 mb-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm text-gray-900">{task.title}</span>
                  <span className="text-xs text-gray-400">{task.xp_value} XP</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{task.description}</p>
                <span className={`inline-block mt-1 w-2 h-2 rounded-full ${PILLAR_DOT_COLORS[task.pillar] || 'bg-gray-300'}`} />
              </div>
            ))}
          </div>
        )}

        {/* Individual tasks */}
        {selectedIdea.individual_tasks && Object.entries(selectedIdea.individual_tasks).map(([childName, tasks]) => (
          <div key={childName}>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">{childName}'s Tasks</h4>
            {(tasks || []).map((task, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-lg p-3 mb-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm text-gray-900">{task.title}</span>
                  <span className="text-xs text-gray-400">{task.xp_value} XP</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{task.description}</p>
                <span className={`inline-block mt-1 w-2 h-2 rounded-full ${PILLAR_DOT_COLORS[task.pillar] || 'bg-gray-300'}`} />
              </div>
            ))}
          </div>
        ))}

        {/* Refine section */}
        <div className="border-t pt-4 mt-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Want to adjust anything?
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              placeholder="e.g. make it more hands-on, add cooking..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              maxLength={300}
              onKeyDown={e => { if (e.key === 'Enter' && feedback.trim()) handleRefine(); }}
            />
            <button
              onClick={handleRefine}
              disabled={refining || !feedback.trim()}
              className="px-3 py-2 border border-optio-purple text-optio-purple rounded-lg text-sm font-medium hover:bg-optio-purple/5 disabled:opacity-50 flex items-center gap-1 whitespace-nowrap"
            >
              {refining ? (
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
              ) : (
                <SparklesIcon className="w-4 h-4" />
              )}
              Refine
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Step 4: Child Selection
  const renderChildSelection = () => (
    <div className="p-6">
      <p className="text-sm text-gray-500 mb-4">Select which children should receive this quest.</p>

      {allChildren.length === 0 ? (
        <p className="text-gray-400 text-center py-4">No children found</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {/* Select All */}
          <button
            onClick={() => {
              if (selectedChildIds.size === allChildren.length) {
                setSelectedChildIds(new Set());
              } else {
                setSelectedChildIds(new Set(allChildren.map(c => c.id)));
              }
            }}
            className="w-full flex items-center gap-3 px-3 py-2 mb-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              selectedChildIds.size === allChildren.length ? 'bg-optio-purple border-optio-purple' : 'border-gray-300'
            }`}>
              {selectedChildIds.size === allChildren.length && <CheckIcon className="w-3 h-3 text-white" />}
            </div>
            <span className="text-sm font-semibold text-gray-700">Select All</span>
          </button>

          {allChildren.map(child => {
            const isSelected = selectedChildIds.has(child.id);
            return (
              <button
                key={child.id}
                onClick={() => toggleChild(child.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg border-2 transition-colors ${
                  isSelected
                    ? 'border-optio-purple bg-optio-purple/5'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                  isSelected ? 'bg-optio-purple border-optio-purple' : 'border-gray-300'
                }`}>
                  {isSelected && <CheckIcon className="w-3 h-3 text-white" />}
                </div>
                <UserIcon className="w-5 h-5 text-gray-400" />
                <span className="flex-1 text-left font-medium text-gray-900">{child.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  child.type === 'dependent'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {child.type === 'dependent' ? 'Under 13' : '13+'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  // Step 5: Success
  const renderSuccess = () => (
    <div className="p-8 text-center">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <CheckIcon className="w-8 h-8 text-green-600" />
      </div>
      <h3 className="text-lg font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
        Quest Created
      </h3>
      {createdQuest && (
        <>
          <p className="text-gray-600 mb-1">{createdQuest.title}</p>
          <p className="text-sm text-gray-400 mb-6">
            Assigned to {createdQuest.enrolled?.length || 0} {(createdQuest.enrolled?.length || 0) === 1 ? 'child' : 'children'}
          </p>
        </>
      )}
      <button
        onClick={() => {
          handleClose();
          onComplete && onComplete();
        }}
        className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:shadow-lg transition-shadow min-h-[44px]"
      >
        Done
      </button>
    </div>
  );

  // Step titles
  const stepTitles = {
    1: 'What sounds fun?',
    2: 'Pick a Quest Idea',
    3: 'Review & Refine',
    4: 'Assign to Children',
    5: 'All Set',
  };

  // Footer buttons per step
  const renderFooter = () => {
    if (step === 5) return null;

    return (
      <div className="border-t px-6 py-4 flex justify-between items-center">
        <button
          onClick={step === 1 ? handleClose : step === 2 ? handleTryAgain : () => setStep(step - 1)}
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-sm min-h-[44px]"
          disabled={loading || creating}
        >
          {step === 1 ? 'Cancel' : step === 2 ? 'Start Over' : 'Back'}
        </button>

        {step === 1 && (
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:shadow-lg transition-shadow disabled:opacity-50 flex items-center gap-2 min-h-[44px]"
          >
            {loading ? (
              <>
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
                Crafting ideas...
              </>
            ) : (
              <>
                <SparklesIcon className="w-4 h-4" />
                Generate Ideas
              </>
            )}
          </button>
        )}

        {step === 3 && (
          <button
            onClick={() => {
              setSelectedChildIds(new Set(allChildren.map(c => c.id)));
              setStep(4);
            }}
            disabled={refining}
            className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:shadow-lg transition-shadow disabled:opacity-50 min-h-[44px]"
          >
            Looks Good, Create It
          </button>
        )}

        {step === 4 && (
          <button
            onClick={handleAccept}
            disabled={creating || selectedChildIds.size === 0}
            className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:shadow-lg transition-shadow disabled:opacity-50 flex items-center gap-2 min-h-[44px]"
          >
            {creating ? (
              <>
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <RocketLaunchIcon className="w-4 h-4" />
                Create Quest ({selectedChildIds.size})
              </>
            )}
          </button>
        )}
      </div>
    );
  };

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="border-b px-6 py-4 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <SparklesIcon className="w-5 h-5 text-optio-purple" />
            <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
              {stepTitles[step]}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-full"
            disabled={loading || creating}
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <StepIndicator />

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {step === 1 && renderPreferences()}
          {step === 2 && renderIdeas()}
          {step === 3 && renderReview()}
          {step === 4 && renderChildSelection()}
          {step === 5 && renderSuccess()}
        </div>

        {/* Footer */}
        {renderFooter()}
      </div>
    </div>,
    document.body
  );
};

export default FamilyQuestIdeaGenerator;
