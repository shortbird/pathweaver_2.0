import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { AlertCircle, Wand2, CheckCircle, XCircle, AlertTriangle, Sparkles, Copy, Save, Eye } from 'lucide-react';

const AIQuestGenerator = () => {
  const navigate = useNavigate();
  const [generationMode, setGenerationMode] = useState('topic');
  const [parameters, setParameters] = useState({});
  const [generatedQuest, setGeneratedQuest] = useState(null);
  const [validation, setValidation] = useState(null);
  const [similarity, setSimilarity] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [templates, setTemplates] = useState([
    {
      name: 'Research Project',
      description: 'Investigate a topic through research and documentation',
      mode: 'topic',
      base_params: {
        pillars: ['Language & Communication', 'Society & Culture'],
        difficulty: 'intermediate'
      }
    },
    {
      name: 'Creative Expression',
      description: 'Express ideas through various artistic mediums',
      mode: 'skill',
      base_params: {
        skills: ['creativity', 'expression', 'design'],
        pillars: ['Arts & Creativity'],
        difficulty: 'beginner'
      }
    }
  ]);
  const [modes, setModes] = useState([
    {
      id: 'topic',
      name: 'Topic-Based',
      description: 'Generate a quest about a specific topic',
      parameters: ['topic', 'age_group', 'pillars']
    },
    {
      id: 'skill',
      name: 'Skill-Focused',
      description: 'Generate a quest that develops specific skills',
      parameters: ['skills', 'pillars', 'difficulty']
    },
    {
      id: 'difficulty',
      name: 'Difficulty-Targeted',
      description: 'Generate a quest for a specific difficulty level',
      parameters: ['difficulty', 'subject']
    },
    {
      id: 'custom',
      name: 'Custom Requirements',
      description: 'Generate a quest with custom requirements',
      parameters: ['requirements']
    }
  ]);
  const [pillars, setPillars] = useState([
    "STEM & Logic",
    "Life & Wellness",
    "Language & Communication",
    "Society & Culture",
    "Arts & Creativity"
  ]);
  const [difficultyLevels, setDifficultyLevels] = useState(['beginner', 'intermediate', 'advanced']);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    fetchGenerationOptions();
  }, []);

  const fetchGenerationOptions = async () => {
    try {
      const response = await api.get('/ai/generation-options');
      // Only update if we got valid data
      if (response.data.templates) setTemplates(response.data.templates);
      if (response.data.modes) setModes(response.data.modes);
      if (response.data.pillars) setPillars(response.data.pillars);
      if (response.data.difficulty_levels) setDifficultyLevels(response.data.difficulty_levels);
    } catch (error) {
      console.error('Failed to fetch generation options:', error);
      setError('Using default options. API may be initializing...');
      // Clear error after 3 seconds
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError('');
    setGeneratedQuest(null);
    setValidation(null);
    setSimilarity(null);

    try {
      const response = await api.post('/ai/generate-quest', {
        mode: generationMode,
        parameters: parameters
      });

      if (response.data.success) {
        setGeneratedQuest(response.data.quest);
        setValidation(response.data.validation);
        setSimilarity(response.data.similarity);
      } else {
        setError(response.data.message || 'Failed to generate quest');
      }
    } catch (error) {
      setError(error.response?.data?.message || 'Error generating quest');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveQuest = async (publish = false) => {
    if (!generatedQuest) return;

    try {
      const response = await api.post('/ai/save-generated-quest', {
        quest: editMode ? generatedQuest : generatedQuest,
        publish: publish
      });

      if (response.data.success) {
        alert(`Quest ${publish ? 'published' : 'saved'} successfully!`);
        setGeneratedQuest(null);
        setValidation(null);
        setSimilarity(null);
        setEditMode(false);
      }
    } catch (error) {
      setError(error.response?.data?.message || 'Error saving quest');
    }
  };

  const handleEditQuest = () => {
    setEditMode(true);
  };

  const handleUpdateTask = (taskIndex, field, value) => {
    if (!editMode) return;

    const updatedQuest = { ...generatedQuest };
    updatedQuest.tasks[taskIndex][field] = value;
    setGeneratedQuest(updatedQuest);
  };

  const handleUpdateQuest = (field, value) => {
    if (!editMode) return;

    const updatedQuest = { ...generatedQuest };
    updatedQuest[field] = value;
    setGeneratedQuest(updatedQuest);
  };

  const applyTemplate = (template) => {
    setGenerationMode(template.mode);
    setParameters(template.base_params);
  };

  const renderParameterInputs = () => {
    const currentMode = modes.find(m => m.id === generationMode);
    if (!currentMode) return null;

    return (
      <div className="space-y-4">
        {currentMode.parameters.includes('topic') && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Topic
            </label>
            <input
              type="text"
              value={parameters.topic || ''}
              onChange={(e) => setParameters({ ...parameters, topic: e.target.value })}
              className="w-full p-2 border rounded-lg"
              placeholder="e.g., Renewable Energy, Ancient Civilizations, Creative Writing"
            />
          </div>
        )}

        {currentMode.parameters.includes('skills') && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Skills (comma-separated)
            </label>
            <input
              type="text"
              value={parameters.skills?.join(', ') || ''}
              onChange={(e) => setParameters({ 
                ...parameters, 
                skills: e.target.value.split(',').map(s => s.trim()) 
              })}
              className="w-full p-2 border rounded-lg"
              placeholder="e.g., critical thinking, problem solving, creativity"
            />
          </div>
        )}

        {currentMode.parameters.includes('pillars') && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Pillars
            </label>
            <div className="space-y-2">
              {pillars.map(pillar => (
                <label key={pillar} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={parameters.pillars?.includes(pillar) || false}
                    onChange={(e) => {
                      const currentPillars = parameters.pillars || [];
                      if (e.target.checked) {
                        setParameters({ 
                          ...parameters, 
                          pillars: [...currentPillars, pillar] 
                        });
                      } else {
                        setParameters({ 
                          ...parameters, 
                          pillars: currentPillars.filter(p => p !== pillar) 
                        });
                      }
                    }}
                    className="mr-2"
                  />
                  <span>{pillar}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {currentMode.parameters.includes('difficulty') && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Difficulty
            </label>
            <select
              value={parameters.difficulty || 'intermediate'}
              onChange={(e) => setParameters({ ...parameters, difficulty: e.target.value })}
              className="w-full p-2 border rounded-lg"
            >
              {difficultyLevels.map(level => (
                <option key={level} value={level}>
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </option>
              ))}
            </select>
          </div>
        )}

        {currentMode.parameters.includes('age_group') && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Age Group
            </label>
            <input
              type="text"
              value={parameters.age_group || ''}
              onChange={(e) => setParameters({ ...parameters, age_group: e.target.value })}
              className="w-full p-2 border rounded-lg"
              placeholder="e.g., 13-18, High School, Middle School"
            />
          </div>
        )}

        {currentMode.parameters.includes('subject') && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subject Area
            </label>
            <input
              type="text"
              value={parameters.subject || ''}
              onChange={(e) => setParameters({ ...parameters, subject: e.target.value })}
              className="w-full p-2 border rounded-lg"
              placeholder="e.g., Science, Mathematics, Literature"
            />
          </div>
        )}

        {currentMode.parameters.includes('requirements') && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Custom Requirements
            </label>
            <textarea
              value={parameters.requirements || ''}
              onChange={(e) => setParameters({ ...parameters, requirements: e.target.value })}
              className="w-full p-2 border rounded-lg"
              rows="4"
              placeholder="Describe your specific quest requirements..."
            />
          </div>
        )}
      </div>
    );
  };

  const renderValidationResults = () => {
    if (!validation) return null;

    const getScoreColor = (score) => {
      if (score >= 80) return 'text-green-600';
      if (score >= 60) return 'text-yellow-600';
      return 'text-red-600';
    };

    return (
      <div className="bg-white p-4 rounded-lg border">
        <h4 className="font-medium mb-3 flex items-center">
          {validation.is_valid ? (
            <CheckCircle className="w-5 h-5 mr-2 text-green-600" />
          ) : (
            <XCircle className="w-5 h-5 mr-2 text-red-600" />
          )}
          Validation Results
        </h4>

        {validation.scores && (
          <div className="mb-4 grid grid-cols-3 gap-4">
            <div>
              <span className="text-sm text-gray-600">Educational Value:</span>
              <span className={`ml-2 font-medium ${getScoreColor(validation.scores.educational_value)}`}>
                {validation.scores.educational_value?.toFixed(0)}%
              </span>
            </div>
            <div>
              <span className="text-sm text-gray-600">Task Quality:</span>
              <span className={`ml-2 font-medium ${getScoreColor(validation.scores.task_quality)}`}>
                {validation.scores.task_quality?.toFixed(0)}%
              </span>
            </div>
            <div>
              <span className="text-sm text-gray-600">Overall:</span>
              <span className={`ml-2 font-medium ${getScoreColor(validation.scores.overall)}`}>
                {validation.scores.overall?.toFixed(0)}%
              </span>
            </div>
          </div>
        )}

        {validation.errors && validation.errors.length > 0 && (
          <div className="mb-3">
            <h5 className="text-sm font-medium text-red-600 mb-1">Errors:</h5>
            <ul className="list-disc list-inside text-sm text-red-600">
              {validation.errors.map((error, idx) => (
                <li key={idx}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {validation.warnings && validation.warnings.length > 0 && (
          <div className="mb-3">
            <h5 className="text-sm font-medium text-yellow-600 mb-1">Warnings:</h5>
            <ul className="list-disc list-inside text-sm text-yellow-600">
              {validation.warnings.map((warning, idx) => (
                <li key={idx}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        {validation.suggestions && validation.suggestions.length > 0 && (
          <div>
            <h5 className="text-sm font-medium text-blue-600 mb-1">Suggestions:</h5>
            <ul className="list-disc list-inside text-sm text-blue-600">
              {validation.suggestions.map((suggestion, idx) => (
                <li key={idx}>{suggestion}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderSimilarityResults = () => {
    if (!similarity) return null;

    const scorePercent = (similarity.score * 100).toFixed(0);
    const scoreColor = similarity.exceeds_threshold ? 'text-red-600' : 'text-green-600';

    return (
      <div className="bg-white p-4 rounded-lg border">
        <h4 className="font-medium mb-3 flex items-center">
          <AlertTriangle className="w-5 h-5 mr-2 text-yellow-600" />
          Similarity Check
        </h4>

        <div className="mb-3">
          <span className="text-sm text-gray-600">Similarity Score:</span>
          <span className={`ml-2 font-medium ${scoreColor}`}>{scorePercent}%</span>
          <span className="ml-2 text-sm text-gray-500">
            ({similarity.recommendation})
          </span>
        </div>

        {similarity.top_matches && similarity.top_matches.length > 0 && (
          <div className="mb-3">
            <h5 className="text-sm font-medium mb-1">Similar Quests:</h5>
            <ul className="space-y-1">
              {similarity.top_matches.slice(0, 3).map((match, idx) => (
                <li key={idx} className="text-sm">
                  <span className="font-medium">{match.title}</span>
                  <span className="ml-2 text-gray-500">
                    ({(match.similarity * 100).toFixed(0)}% similar)
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {similarity.unique_aspects?.suggestions && (
          <div>
            <h5 className="text-sm font-medium text-blue-600 mb-1">
              To Make More Unique:
            </h5>
            <ul className="list-disc list-inside text-sm text-blue-600">
              {similarity.unique_aspects.suggestions.map((suggestion, idx) => (
                <li key={idx}>{suggestion}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderGeneratedQuest = () => {
    if (!generatedQuest) return null;

    return (
      <div className="bg-white p-6 rounded-lg border">
        <div className="mb-4 flex justify-between items-start">
          <h3 className="text-xl font-bold">Generated Quest</h3>
          <div className="flex gap-2">
            {!editMode && (
              <button
                onClick={handleEditQuest}
                className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"
              >
                <Wand2 className="w-4 h-4" />
                Edit
              </button>
            )}
            <button
              onClick={() => handleSaveQuest(false)}
              className="px-3 py-1 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-1"
            >
              <Save className="w-4 h-4" />
              Save Draft
            </button>
            <button
              onClick={() => handleSaveQuest(true)}
              className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1"
              disabled={!validation?.is_valid}
            >
              <CheckCircle className="w-4 h-4" />
              Publish
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            {editMode ? (
              <input
                type="text"
                value={generatedQuest.title}
                onChange={(e) => handleUpdateQuest('title', e.target.value)}
                className="w-full p-2 border rounded-lg"
              />
            ) : (
              <p className="text-lg">{generatedQuest.title}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            {editMode ? (
              <textarea
                value={generatedQuest.description}
                onChange={(e) => handleUpdateQuest('description', e.target.value)}
                className="w-full p-2 border rounded-lg"
                rows="3"
              />
            ) : (
              <p>{generatedQuest.description}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Big Idea</label>
            {editMode ? (
              <input
                type="text"
                value={generatedQuest.big_idea}
                onChange={(e) => handleUpdateQuest('big_idea', e.target.value)}
                className="w-full p-2 border rounded-lg"
              />
            ) : (
              <p className="italic">{generatedQuest.big_idea}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Difficulty: {generatedQuest.difficulty}
            </label>
          </div>

          <div>
            <h4 className="font-medium mb-2">Tasks ({generatedQuest.tasks?.length || 0})</h4>
            <div className="space-y-3">
              {generatedQuest.tasks?.map((task, idx) => (
                <div key={idx} className="p-4 bg-gray-50 rounded-lg">
                  <div className="mb-2">
                    <label className="text-sm font-medium">Task {idx + 1} Title:</label>
                    {editMode ? (
                      <input
                        type="text"
                        value={task.title}
                        onChange={(e) => handleUpdateTask(idx, 'title', e.target.value)}
                        className="w-full p-1 border rounded mt-1"
                      />
                    ) : (
                      <p className="font-medium">{task.title}</p>
                    )}
                  </div>

                  <div className="mb-2">
                    <label className="text-sm font-medium">Description:</label>
                    {editMode ? (
                      <textarea
                        value={task.description}
                        onChange={(e) => handleUpdateTask(idx, 'description', e.target.value)}
                        className="w-full p-1 border rounded mt-1"
                        rows="2"
                      />
                    ) : (
                      <p className="text-sm">{task.description}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <span className="font-medium">Pillar:</span>
                      {editMode ? (
                        <select
                          value={task.pillar}
                          onChange={(e) => handleUpdateTask(idx, 'pillar', e.target.value)}
                          className="ml-2 p-1 border rounded"
                        >
                          {pillars.map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="ml-2">{task.pillar}</span>
                      )}
                    </div>
                    <div>
                      <span className="font-medium">XP:</span>
                      {editMode ? (
                        <input
                          type="number"
                          value={task.xp_value}
                          onChange={(e) => handleUpdateTask(idx, 'xp_value', parseInt(e.target.value))}
                          className="ml-2 w-16 p-1 border rounded"
                        />
                      ) : (
                        <span className="ml-2">{task.xp_value}</span>
                      )}
                    </div>
                    <div>
                      <span className="font-medium">Evidence:</span>
                      <span className="ml-2">{task.evidence_type}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2 flex items-center">
          <Sparkles className="w-8 h-8 mr-2 text-purple-600" />
          AI Quest Generator
        </h2>
        <p className="text-gray-600">
          Use AI to generate educational quests with automatic validation and similarity checking
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Configuration */}
        <div className="lg:col-span-1 space-y-6">
          {/* Templates */}
          <div className="bg-white p-4 rounded-lg border">
            <h3 className="font-medium mb-3">Quick Templates</h3>
            <div className="space-y-2">
              {templates.map((template, idx) => (
                <button
                  key={idx}
                  onClick={() => applyTemplate(template)}
                  className="w-full text-left p-2 hover:bg-gray-50 rounded-lg border"
                >
                  <div className="font-medium">{template.name}</div>
                  <div className="text-sm text-gray-600">{template.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Generation Mode */}
          <div className="bg-white p-4 rounded-lg border">
            <h3 className="font-medium mb-3">Generation Mode</h3>
            <select
              value={generationMode}
              onChange={(e) => setGenerationMode(e.target.value)}
              className="w-full p-2 border rounded-lg"
            >
              {modes.map(mode => (
                <option key={mode.id} value={mode.id}>
                  {mode.name} - {mode.description}
                </option>
              ))}
            </select>
          </div>

          {/* Parameters */}
          <div className="bg-white p-4 rounded-lg border">
            <h3 className="font-medium mb-3">Parameters</h3>
            {renderParameterInputs()}
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>Generating...</>
            ) : (
              <>
                <Wand2 className="w-5 h-5" />
                Generate Quest
              </>
            )}
          </button>
        </div>

        {/* Right Panel - Results */}
        <div className="lg:col-span-2 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-start">
              <AlertCircle className="w-5 h-5 mr-2 mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          {generatedQuest && (
            <>
              {renderGeneratedQuest()}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderValidationResults()}
                {renderSimilarityResults()}
              </div>
            </>
          )}

          {!generatedQuest && !isGenerating && !error && (
            <div className="bg-gray-50 p-12 rounded-lg text-center text-gray-500">
              <Sparkles className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p>Configure your quest parameters and click Generate to create an AI-powered quest</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIQuestGenerator;