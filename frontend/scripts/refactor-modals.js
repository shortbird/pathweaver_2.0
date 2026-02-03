#!/usr/bin/env node

/**
 * Automated Modal Refactoring Script
 *
 * This script automatically refactors modal components to use the shared Modal component
 * from frontend/src/components/ui/Modal.jsx
 *
 * Usage: node frontend/scripts/refactor-modals.js
 */

const fs = require('fs');
const path = require('path');

// Files that still need refactoring
const MODAL_FILES = [
  'frontend/src/components/diploma/AccreditedDiplomaModal.jsx',
  'frontend/src/components/diploma/evidence/EvidenceViewerModal.jsx',
  'frontend/src/components/learning-events/LearningEventModal.jsx',
  'frontend/src/components/quest/TaskDetailModal.jsx',
  'frontend/src/components/services/ServiceInquiryModal.jsx',
  'frontend/src/components/tutor/OptioBotModal.jsx',
  'frontend/src/components/ReflectionModal.jsx',
  'frontend/src/components/admin/AIQuestReviewModal.jsx',
  'frontend/src/components/admin/QuestSelectionModal.jsx',
  'frontend/src/components/admin/ServiceFormModal.jsx',
  'frontend/src/components/admin/UserDetailsModal.jsx',
  'frontend/src/components/advisor/AdvisorNotesModal.jsx',
  'frontend/src/components/advisor/AddEvidenceModal.jsx',
  'frontend/src/components/advisor/CheckinHistoryModal.jsx',
  'frontend/src/components/advisor/StudentDetailModal.jsx',
  'frontend/src/components/learning-events/LearningEventDetailModal.jsx',
  'frontend/src/components/parent/AddChildrenModal.jsx',
  'frontend/src/components/quest/TaskCompletionModal.jsx',
  'frontend/src/components/quest/RestartQuestModal.jsx',
  'frontend/src/components/parent/RequestStudentConnectionModal.jsx',
  'frontend/src/components/quest/TaskEvidenceModal.jsx',
];

// Patterns to detect and replace
const PATTERNS = {
  // Modal wrapper pattern
  modalWrapper: /(<div\s+className="fixed inset-0[^"]*bg-black[^"]*bg-opacity-50[^>]*>[\s\S]*?<div\s+className="[^"]*bg-white[^"]*rounded[^>]*>)/,

  // Alert patterns
  infoAlert: /(<div\s+className="[^"]*bg-blue-50[^"]*border[^"]*blue-200[^>]*>)/,
  warningAlert: /(<div\s+className="[^"]*bg-yellow-50[^"]*border[^"]*yellow-200[^>]*>)/,
  errorAlert: /(<div\s+className="[^"]*bg-red-50[^"]*border[^"]*red-200[^>]*>)/,
  successAlert: /(<div\s+className="[^"]*bg-green-50[^"]*border[^"]*green-200[^>]*>)/,
  purpleAlert: /(<div\s+className="[^"]*bg-purple-50[^"]*border[^"]*purple-200[^>]*>)/,

  // X import pattern
  xImport: /import\s+{\s*[^}]*X[^}]*}\s+from\s+['"]lucide-react['"]/,
};

function refactorModalFile(filePath) {
  console.log(`\nRefactoring: ${filePath}`);

  const fullPath = path.resolve(__dirname, '../..', filePath);

  if (!fs.existsSync(fullPath)) {
    console.error(`  ❌ File not found: ${fullPath}`);
    return false;
  }

  let content = fs.readFileSync(fullPath, 'utf-8');
  const originalContent = content;

  // Step 1: Check if already refactored
  if (content.includes("from '../ui'") || content.includes("from '../../ui'") || content.includes("from '../../../ui'")) {
    console.log(`  ⏭️  Already refactored`);
    return true;
  }

  // Step 2: Add Modal import
  const importDepth = (filePath.match(/\//g) || []).length - 2; // Calculate relative path depth
  const uiImportPath = '../'.repeat(Math.max(1, importDepth)) + 'ui';

  if (!content.includes(`from '${uiImportPath}'`)) {
    // Find first import statement
    const firstImportMatch = content.match(/^import\s/m);
    if (firstImportMatch) {
      const insertIndex = firstImportMatch.index;
      content = content.slice(0, insertIndex) +
                `import { Modal, Alert, FormField, FormFooter } from '${uiImportPath}';\n` +
                content.slice(insertIndex);
      console.log(`  ✓ Added Modal imports`);
    }
  }

  // Step 3: Remove X icon from lucide-react imports (now handled by Modal)
  const xImportMatch = content.match(PATTERNS.xImport);
  if (xImportMatch) {
    const originalImport = xImportMatch[0];
    const withoutX = originalImport.replace(/,?\s*X\s*,?/, '').replace(/{\s*,/, '{').replace(/,\s*}/, '}');
    content = content.replace(originalImport, withoutX);
    console.log(`  ✓ Removed X icon import`);
  }

  // Step 4: Detect modal wrapper pattern
  const hasModalWrapper = content.includes('fixed inset-0') &&
                         content.includes('bg-black') &&
                         content.includes('bg-opacity-50');

  if (hasModalWrapper) {
    console.log(`  ⚠️  Manual refactoring needed - Complex modal structure detected`);
    console.log(`     Run: Apply pattern from AddDependentModal.jsx or BadgeInfoModal.jsx`);
  }

  // Step 5: Save changes (only imports so far - full refactoring requires manual review)
  if (content !== originalContent) {
    fs.writeFileSync(fullPath, content, 'utf-8');
    console.log(`  ✓ File updated with Modal imports`);
    return false; // Not fully refactored, just imports added
  }

  return false;
}

function main() {
  console.log('='.repeat(60));
  console.log('Modal Refactoring Script');
  console.log('='.repeat(60));
  console.log(`\nTotal files to refactor: ${MODAL_FILES.length}`);

  let completed = 0;
  let needsManual = 0;

  for (const file of MODAL_FILES) {
    const result = refactorModalFile(file);
    if (result) {
      completed++;
    } else {
      needsManual++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Summary:');
  console.log(`  ✅ Already refactored: ${completed}`);
  console.log(`  🔧 Needs manual refactoring: ${needsManual}`);
  console.log('='.repeat(60));
  console.log('\nNext steps:');
  console.log('1. Review each file marked for manual refactoring');
  console.log('2. Follow the pattern from AddDependentModal.jsx');
  console.log('3. Replace modal wrapper with <Modal> component');
  console.log('4. Replace alert boxes with <Alert> component');
  console.log('5. Test each refactored modal');
}

main();
