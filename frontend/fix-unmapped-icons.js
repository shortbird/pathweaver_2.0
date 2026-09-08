#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Map of unmapped icons that need fixing
const ICON_FIXES = {
  'UserPlus': 'UserPlusIcon',
  'Bot': 'ChatBubbleLeftEllipsisIcon',
  'GripVertical': 'Bars3Icon',
  'Save': 'ArrowDownTrayIcon',
  'Circle': 'EllipsisHorizontalCircleIcon',
  'Trophy': 'TrophyIcon',
  'Atom': 'SparklesIcon',
  'Pin': 'MapPinIcon',
  'GraduationCap': 'AcademicCapIcon',
  'RotateCcw': 'ArrowPathIcon',
  'Calculator': 'CalculatorIcon',
  'ChefHat': 'SparklesIcon',
  'School': 'AcademicCapIcon',
  'ArrowDownUp': 'ArrowsUpDownIcon',
  'Grid3x3': 'Squares2X2Icon',
  'Type': 'DocumentTextIcon',
  'CheckCircle2': 'CheckCircleIcon',
  'History': 'ClockIcon',
};

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);
  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
      }
    } else if (file.match(/\.(js|jsx|tsx)$/)) {
      arrayOfFiles.push(filePath);
    }
  });
  return arrayOfFiles;
}

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  let fixed = [];

  // Check if file imports from heroicons
  if (!content.includes("from '@heroicons/react/24/outline'")) {
    return { fixed: false, icons: [] };
  }

  // Find all unmapped icons used in JSX
  Object.entries(ICON_FIXES).forEach(([oldIcon, newIcon]) => {
    const jsxRegex = new RegExp(`<${oldIcon}(\\s|>|/)`, 'g');
    if (jsxRegex.test(content)) {
      // Replace JSX usage
      content = content.replace(jsxRegex, `<${newIcon}$1`);

      // Add to imports if not already there
      const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]@heroicons\/react\/24\/outline['"]/;
      const match = content.match(importRegex);

      if (match && !match[1].includes(newIcon)) {
        const icons = match[1].trim().split(',').map(i => i.trim());
        icons.push(newIcon);
        icons.sort();
        const newImport = `import { ${icons.join(', ')} } from '@heroicons/react/24/outline'`;
        content = content.replace(match[0], newImport);
      }

      fixed.push({ from: oldIcon, to: newIcon });
    }
  });

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    return { fixed: true, icons: fixed };
  }

  return { fixed: false, icons: [] };
}

console.log('🔧 Fixing unmapped icons...\n');

const srcDir = path.join(__dirname, 'src');
const files = getAllFiles(srcDir);
let totalFixed = 0;
let totalIcons = 0;

files.forEach(file => {
  const result = fixFile(file);
  if (result.fixed) {
    totalFixed++;
    totalIcons += result.icons.length;
    const relativePath = path.relative(process.cwd(), file);
    console.log(`✅ ${path.basename(file)} (${result.icons.length} icons)`);
    result.icons.forEach(({ from, to }) => {
      console.log(`   ${from} → ${to}`);
    });
  }
});

console.log(`\n📊 Summary:`);
console.log(`   Files fixed: ${totalFixed}`);
console.log(`   Icons fixed: ${totalIcons}`);
console.log('\n✨ Done!');
