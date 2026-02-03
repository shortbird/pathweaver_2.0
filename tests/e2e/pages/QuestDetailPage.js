import { BasePage } from './BasePage.js';

/**
 * QuestDetailPage - Page Object Model for /quests/:id
 *
 * Handles quest detail view, enrollment, task interactions,
 * and evidence submission.
 */
export class QuestDetailPage extends BasePage {
  constructor(page) {
    super(page);

    this.selectors = {
      // Quest header
      questTitle: 'h1, [class*="font-bold"]',
      questDescription: '.text-gray-600, .text-gray-700',

      // Enrollment
      pickUpQuestButton: 'button:has-text("Pick Up Quest")',
      enrollingButton: 'button:has-text("Picking Up")',

      // Personalization wizard
      personalizationWizard: '[class*="QuestPersonalizationWizard"], .bg-white.rounded-xl',
      wizardTitle: 'text=Personalize Your Quest',
      wizardCloseButton: 'button:has-text("Cancel"), button:has-text("Close")',
      generateTasksButton: 'button:has-text("Generate"), button:has-text("Create Tasks")',

      // Task workspace
      taskWorkspace: '[class*="TaskWorkspace"]',
      taskList: '.flex-shrink-0.border-r',
      taskItem: '.group.flex.items-start',
      selectedTask: '.bg-optio-purple\\/10',
      addTaskButton: 'button:has-text("Add Task")',

      // Task details
      taskTitle: 'h2.text-base, h2.text-xl',
      taskDescription: '.text-gray-600',
      taskPillarBadge: '.rounded-full.text-white',
      taskXpBadge: 'text=/\\d+ XP/',

      // Evidence section
      evidenceSection: 'h3:has-text("My Evidence")',
      addEvidenceButton: 'button:has-text("Add"), button[title="Add Evidence"]',
      saveButton: 'button:has-text("Save")',
      markCompleteButton: 'button:has-text("Done"), button:has-text("Complete")',
      completedBadge: 'text=Completed!',

      // Evidence modal
      evidenceModal: '[role="dialog"], .fixed.inset-0',
      textEvidenceTab: 'button:has-text("Text")',
      textEvidenceInput: 'textarea',
      saveEvidenceButton: 'button:has-text("Save"), button:has-text("Add")',

      // Completion celebration
      celebrationModal: '[class*="Celebration"]',
      finishQuestButton: 'button:has-text("Finish Quest")',
      addMoreTasksButton: 'button:has-text("Add More Tasks")',

      // Error and loading states
      loadingSpinner: '.animate-spin',
      errorMessage: '.text-red-600, .bg-red-50',

      // Navigation
      backToQuestsButton: 'button:has-text("Back to Quests")',
    };
  }

  /**
   * Navigate to a specific quest
   */
  async goto(questId) {
    await super.goto(`/quests/${questId}`);
    await this.waitForLoadingComplete();
  }

  /**
   * Check if page is loaded
   */
  async isLoaded() {
    await this.waitForLoadingComplete();
    return this.isVisible(this.selectors.questTitle, 5000);
  }

  /**
   * Get quest title
   */
  async getQuestTitle() {
    return this.getText(this.selectors.questTitle);
  }

  // === Enrollment ===

  /**
   * Check if "Pick Up Quest" button is visible
   */
  async hasPickUpButton() {
    return this.isVisible(this.selectors.pickUpQuestButton, 3000);
  }

  /**
   * Click "Pick Up Quest" button
   */
  async pickUpQuest() {
    await this.click(this.selectors.pickUpQuestButton);
    // Wait for either wizard to appear or direct enrollment
    await Promise.race([
      this.waitForElement(this.selectors.personalizationWizard, { timeout: 10000 }),
      this.waitForElement(this.selectors.taskWorkspace, { timeout: 10000 })
    ]).catch(() => {});
  }

  /**
   * Check if enrolling (loading state)
   */
  async isEnrolling() {
    return this.isVisible(this.selectors.enrollingButton, 1000);
  }

  // === Personalization Wizard ===

  /**
   * Check if personalization wizard is visible
   */
  async hasPersonalizationWizard() {
    return this.isVisible(this.selectors.personalizationWizard, 3000);
  }

  /**
   * Close personalization wizard
   */
  async closeWizard() {
    if (await this.hasPersonalizationWizard()) {
      await this.click(this.selectors.wizardCloseButton);
      await this.page.waitForTimeout(500);
    }
  }

  /**
   * Generate tasks using AI (within wizard)
   */
  async generateTasks() {
    await this.click(this.selectors.generateTasksButton);
    await this.waitForLoadingComplete();
  }

  // === Task Workspace ===

  /**
   * Check if task workspace is visible
   */
  async hasTaskWorkspace() {
    return this.isVisible(this.selectors.taskWorkspace, 3000);
  }

  /**
   * Get number of tasks
   */
  async getTaskCount() {
    const items = await this.page.$$(this.selectors.taskItem);
    return items.length;
  }

  /**
   * Select a task by index
   */
  async selectTaskByIndex(index = 0) {
    const tasks = await this.page.$$(this.selectors.taskItem);
    if (tasks.length > index) {
      await tasks[index].click();
      await this.page.waitForTimeout(300);
    }
  }

  /**
   * Select first incomplete task
   */
  async selectFirstIncompleteTask() {
    const tasks = await this.page.$$('.group.flex.items-start:not(.opacity-60)');
    if (tasks.length > 0) {
      await tasks[0].click();
      await this.page.waitForTimeout(300);
    }
  }

  /**
   * Get selected task title
   */
  async getSelectedTaskTitle() {
    return this.getText(this.selectors.taskTitle);
  }

  /**
   * Click "Add Task" button
   */
  async clickAddTask() {
    await this.click(this.selectors.addTaskButton);
    await this.waitForElement(this.selectors.personalizationWizard);
  }

  // === Evidence Submission ===

  /**
   * Check if evidence section is visible
   */
  async hasEvidenceSection() {
    return this.isVisible(this.selectors.evidenceSection, 3000);
  }

  /**
   * Click "Add Evidence" button
   */
  async clickAddEvidence() {
    await this.click(this.selectors.addEvidenceButton);
    await this.waitForElement(this.selectors.evidenceModal);
  }

  /**
   * Add text evidence
   */
  async addTextEvidence(text) {
    await this.clickAddEvidence();

    // Click text tab if available
    if (await this.isVisible(this.selectors.textEvidenceTab, 2000)) {
      await this.click(this.selectors.textEvidenceTab);
    }

    // Enter text
    await this.fill(this.selectors.textEvidenceInput, text);

    // Save evidence
    await this.click(this.selectors.saveEvidenceButton);
    await this.page.waitForTimeout(500);
  }

  /**
   * Click "Save" button
   */
  async saveEvidence() {
    await this.click(this.selectors.saveButton);
    await this.waitForLoadingComplete();
  }

  /**
   * Mark task as complete
   */
  async markTaskComplete() {
    await this.click(this.selectors.markCompleteButton);
    await this.waitForLoadingComplete();
  }

  /**
   * Check if task is marked as completed
   */
  async isTaskCompleted() {
    return this.isVisible(this.selectors.completedBadge, 3000);
  }

  /**
   * Check if celebration modal is visible
   */
  async hasCelebration() {
    return this.isVisible(this.selectors.celebrationModal, 3000);
  }

  /**
   * Finish quest from celebration modal
   */
  async finishQuest() {
    await this.click(this.selectors.finishQuestButton);
    await this.waitForNavigation();
  }

  // === Error Handling ===

  /**
   * Check if error is displayed
   */
  async hasError() {
    return this.isVisible(this.selectors.errorMessage, 2000);
  }

  /**
   * Get error message
   */
  async getErrorMessage() {
    if (await this.hasError()) {
      return this.getText(this.selectors.errorMessage);
    }
    return null;
  }

  // === Navigation ===

  /**
   * Go back to quests list
   */
  async goBackToQuests() {
    await this.click(this.selectors.backToQuestsButton);
    await this.waitForUrl('/quests');
  }

  /**
   * Wait for quest to fully load
   */
  async waitForQuestToLoad() {
    await this.waitForLoadingComplete();
    // Wait for either pick up button or task workspace
    await Promise.race([
      this.waitForElement(this.selectors.pickUpQuestButton, { timeout: 10000 }),
      this.waitForElement(this.selectors.taskWorkspace, { timeout: 10000 }),
      this.waitForElement('text=Ready to personalize', { timeout: 10000 })
    ]).catch(() => {});
  }
}
