class DemoDataManager {
  constructor() {
    this.storageKey = 'optio_demo_state';
    this.version = '1.0';
    this.isStorageAvailable = this.checkStorageAvailability();
    this.fallbackStorage = {};
  }

  checkStorageAvailability() {
    try {
      const test = '__optio_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      console.warn('localStorage not available, using in-memory storage');
      return false;
    }
  }

  getStorage() {
    if (this.isStorageAvailable) {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : null;
    }
    return this.fallbackStorage[this.storageKey] || null;
  }

  setStorage(data) {
    if (this.isStorageAvailable) {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } else {
      this.fallbackStorage[this.storageKey] = data;
    }
  }

  initializeDemoState() {
    let state = this.getStorage();
    
    // Check if we need to migrate or initialize
    if (!state || state.version !== this.version) {
      state = this.createInitialState();
      this.setStorage(state);
    } else {
      // Update last visit
      state.lastVisit = new Date().toISOString();
      this.setStorage(state);
    }
    
    return state;
  }

  createInitialState() {
    const now = new Date().toISOString();
    
    return {
      version: this.version,
      firstVisit: now,
      lastVisit: now,
      progress: {
        sectionsViewed: [],
        questsInteracted: [],
        tasksCompleted: [],
        totalTimeSpent: 0,
        ctaClicks: 0,
        demoCompleted: false
      },
      abTestVariant: Math.random() > 0.5 ? 'A' : 'B',
      demoUser: {
        id: 'demo-user-001',
        name: 'Alex Chen',
        totalXP: 1450,
        questsCompleted: 12,
        joinDate: '2024-09-01',
        grade: '10th Grade',
        location: 'San Francisco, CA',
        currentStreak: 15,
        hoursLearning: 67,
        pillars: {
          creativity: 380,
          critical_thinking: 420,
          practical_skills: 280,
          communication: 220,
          cultural_literacy: 150
        }
      },
      completedQuests: [
        {
          id: 'demo-quest-1',
          title: 'Build a Weather Station',
          pillar: 'practical_skills',
          completedAt: '2024-10-15',
          xpEarned: 150,
          tasks: [
            {
              title: 'Research weather monitoring',
              evidence: {
                type: 'text',
                content: 'Researched different weather parameters including temperature, humidity, barometric pressure. Learned about various sensor types and their applications in meteorology.'
              }
            },
            {
              title: 'Build the hardware',
              evidence: {
                type: 'image',
                content: '/demo/weather-station.jpg',
                caption: 'My completed weather station with Arduino, DHT22 sensor, and LCD display'
              }
            },
            {
              title: 'Create data visualization',
              evidence: {
                type: 'link',
                content: 'https://github.com/demo/weather-dashboard',
                caption: 'Web dashboard showing real-time weather data'
              }
            }
          ]
        },
        {
          id: 'demo-quest-2',
          title: 'Compose Original Music',
          pillar: 'creativity',
          completedAt: '2024-11-20',
          xpEarned: 180,
          tasks: [
            {
              title: 'Learn music theory basics',
              evidence: {
                type: 'text',
                content: 'Studied major and minor scales, chord progressions (I-IV-V-I), time signatures, and basic harmony. Completed exercises on interval recognition.'
              }
            },
            {
              title: 'Compose a 2-minute piece',
              evidence: {
                type: 'video',
                content: '/demo/composition-performance.mp4',
                thumbnail: '/demo/composition-thumb.jpg',
                caption: 'Performance of my original composition "Autumn Leaves"'
              }
            },
            {
              title: 'Get feedback from musicians',
              evidence: {
                type: 'document',
                content: '/demo/feedback-notes.pdf',
                caption: 'Feedback from local music teacher and online community'
              }
            }
          ]
        },
        {
          id: 'demo-quest-3',
          title: 'Write a Short Story',
          pillar: 'communication',
          completedAt: '2024-12-05',
          xpEarned: 120,
          tasks: [
            {
              title: 'Develop plot and characters',
              evidence: {
                type: 'text',
                content: 'Created detailed character profiles for 3 main characters. Outlined a three-act structure with rising action, climax, and resolution.'
              }
            },
            {
              title: 'Write first draft',
              evidence: {
                type: 'document',
                content: '/demo/short-story.pdf',
                caption: '3,500 word science fiction story "The Last Algorithm"'
              }
            },
            {
              title: 'Revise based on feedback',
              evidence: {
                type: 'text',
                content: 'Incorporated feedback from writing group. Strengthened dialogue, added sensory details, and refined the ending.'
              }
            }
          ]
        },
        {
          id: 'demo-quest-4',
          title: 'Master Khan Academy Algebra',
          pillar: 'critical_thinking',
          completedAt: '2024-11-01',
          xpEarned: 200,
          source: 'khan_academy',
          tasks: [
            {
              title: 'Complete Linear Equations unit',
              evidence: {
                type: 'image',
                content: '/demo/khan-linear-complete.png',
                caption: '100% mastery on Linear Equations unit'
              }
            },
            {
              title: 'Solve 50 word problems',
              evidence: {
                type: 'text',
                content: 'Completed 50 real-world algebra problems with 92% accuracy. Focused on rate problems, mixture problems, and distance-rate-time scenarios.'
              }
            },
            {
              title: 'Teach concept to peer',
              evidence: {
                type: 'video',
                content: '/demo/peer-tutoring.mp4',
                caption: 'Tutoring session where I explained systems of equations'
              }
            }
          ]
        },
        {
          id: 'demo-quest-5',
          title: 'Study World Cultures',
          pillar: 'cultural_literacy',
          completedAt: '2024-10-20',
          xpEarned: 150,
          tasks: [
            {
              title: 'Research 3 different cultures',
              evidence: {
                type: 'document',
                content: '/demo/culture-research.pdf',
                caption: 'Comparative study of Japanese, Maori, and Senegalese cultures'
              }
            },
            {
              title: 'Cook traditional dish',
              evidence: {
                type: 'image',
                content: '/demo/japanese-bento.jpg',
                caption: 'Homemade Japanese bento box with traditional components'
              }
            },
            {
              title: 'Interview community member',
              evidence: {
                type: 'video',
                content: '/demo/cultural-interview.mp4',
                caption: 'Interview with local Japanese cultural center director'
              }
            }
          ]
        }
      ]
    };
  }

  getDemoState() {
    return this.getStorage();
  }

  updateProgress(section, action, data = {}) {
    const state = this.getStorage();
    if (!state) return;

    switch(action) {
      case 'viewed':
        if (!state.progress.sectionsViewed.includes(section)) {
          state.progress.sectionsViewed.push(section);
        }
        break;
      
      case 'interacted':
        if (data.questId && !state.progress.questsInteracted.includes(data.questId)) {
          state.progress.questsInteracted.push(data.questId);
        }
        break;
      
      case 'task_completed':
        const taskId = `${data.questId}-${data.taskId}`;
        if (!state.progress.tasksCompleted.includes(taskId)) {
          state.progress.tasksCompleted.push(taskId);
        }
        break;
      
      case 'cta_clicked':
        state.progress.ctaClicks++;
        break;
      
      case 'time_spent':
        state.progress.totalTimeSpent += data.seconds || 0;
        break;
    }

    // Check if demo is completed
    if (state.progress.sectionsViewed.length >= 4 && 
        state.progress.questsInteracted.length >= 2) {
      state.progress.demoCompleted = true;
    }

    this.setStorage(state);
    return state;
  }

  completeTask(questId, taskId, evidence) {
    const state = this.getStorage();
    if (!state) return;

    // Add to completed tasks
    this.updateProgress('task', 'task_completed', { questId, taskId });

    // Store the evidence (in a real app, this would go to the backend)
    const taskKey = `${questId}-${taskId}`;
    if (!state.userEvidence) {
      state.userEvidence = {};
    }
    state.userEvidence[taskKey] = {
      completedAt: new Date().toISOString(),
      evidence
    };

    this.setStorage(state);
    return state;
  }

  resetDemo() {
    if (this.isStorageAvailable) {
      localStorage.removeItem(this.storageKey);
    } else {
      delete this.fallbackStorage[this.storageKey];
    }
    return this.initializeDemoState();
  }

  migrateLegacyData(oldState) {
    // Handle any future version migrations
    console.log('Migrating demo data from version', oldState.version, 'to', this.version);
    
    // For now, just create fresh state
    return this.createInitialState();
  }
}

export default DemoDataManager;