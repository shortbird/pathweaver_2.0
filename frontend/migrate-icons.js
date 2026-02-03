#!/usr/bin/env node

/**
 * Icon Migration Script: lucide-react → @heroicons/react
 *
 * Replaces all lucide-react imports and usage with heroicons equivalents
 * across the frontend codebase.
 */

const fs = require('fs');
const path = require('path');

// Icon name mapping: lucide-react → heroicons/24/outline
const ICON_MAP = {
  // Common icons
  'X': 'XMarkIcon',
  'Check': 'CheckIcon',
  'ChevronDown': 'ChevronDownIcon',
  'ChevronUp': 'ChevronUpIcon',
  'ChevronLeft': 'ChevronLeftIcon',
  'ChevronRight': 'ChevronRightIcon',
  'Search': 'MagnifyingGlassIcon',
  'Plus': 'PlusIcon',
  'Minus': 'MinusIcon',
  'Edit': 'PencilIcon',
  'Edit2': 'PencilSquareIcon',
  'Trash': 'TrashIcon',
  'Trash2': 'TrashIcon',
  'Settings': 'Cog6ToothIcon',
  'User': 'UserIcon',
  'Users': 'UsersIcon',
  'UserCircle': 'UserCircleIcon',
  'UserPlus': 'UserPlusIcon',
  'Home': 'HomeIcon',
  'Menu': 'Bars3Icon',
  'MoreVertical': 'EllipsisVerticalIcon',
  'MoreHorizontal': 'EllipsisHorizontalIcon',
  'ExternalLink': 'ArrowTopRightOnSquareIcon',
  'Download': 'ArrowDownTrayIcon',
  'Save': 'ArrowDownTrayIcon',
  'Upload': 'ArrowUpTrayIcon',
  'Copy': 'DocumentDuplicateIcon',
  'Eye': 'EyeIcon',
  'EyeOff': 'EyeSlashIcon',
  'Calendar': 'CalendarIcon',
  'CalendarDays': 'CalendarDaysIcon',
  'Clock': 'ClockIcon',
  'History': 'ClockIcon',
  'Mail': 'EnvelopeIcon',
  'Phone': 'PhoneIcon',
  'MapPin': 'MapPinIcon',
  'Pin': 'MapPinIcon',
  'Filter': 'FunnelIcon',
  'Star': 'StarIcon',
  'Heart': 'HeartIcon',
  'Bookmark': 'BookmarkIcon',
  'Share': 'ShareIcon',
  'Share2': 'ShareIcon',
  'Link': 'LinkIcon',
  'Link2': 'LinkIcon',
  'AlertCircle': 'ExclamationCircleIcon',
  'AlertTriangle': 'ExclamationTriangleIcon',
  'Info': 'InformationCircleIcon',
  'HelpCircle': 'QuestionMarkCircleIcon',
  'CheckCircle': 'CheckCircleIcon',
  'CheckCircle2': 'CheckCircleIcon',
  'XCircle': 'XCircleIcon',
  'Circle': 'EllipsisHorizontalCircleIcon',
  'Bell': 'BellIcon',
  'BellOff': 'BellSlashIcon',
  'MessageCircle': 'ChatBubbleLeftIcon',
  'MessageSquare': 'ChatBubbleLeftRightIcon',
  'Bot': 'ChatBubbleLeftEllipsisIcon',
  'Send': 'PaperAirplaneIcon',
  'File': 'DocumentIcon',
  'FileText': 'DocumentTextIcon',
  'Type': 'DocumentTextIcon',
  'Folder': 'FolderIcon',
  'FolderOpen': 'FolderOpenIcon',
  'Image': 'PhotoIcon',
  'Video': 'VideoCameraIcon',
  'Music': 'MusicalNoteIcon',
  'Paperclip': 'PaperClipIcon',
  'Archive': 'ArchiveBoxIcon',
  'Lock': 'LockClosedIcon',
  'Unlock': 'LockOpenIcon',
  'Key': 'KeyIcon',
  'Shield': 'ShieldCheckIcon',
  'LogIn': 'ArrowRightOnRectangleIcon',
  'LogOut': 'ArrowLeftOnRectangleIcon',
  'RefreshCw': 'ArrowPathIcon',
  'RotateCw': 'ArrowPathIcon',
  'RotateCcw': 'ArrowPathIcon',
  'Loader': 'ArrowPathIcon',
  'Loader2': 'ArrowPathIcon',
  'Activity': 'ChartBarIcon',
  'BarChart': 'ChartBarIcon',
  'BarChart2': 'ChartBarSquareIcon',
  'PieChart': 'ChartPieIcon',
  'TrendingUp': 'ArrowTrendingUpIcon',
  'TrendingDown': 'ArrowTrendingDownIcon',
  'Award': 'TrophyIcon',
  'Trophy': 'TrophyIcon',
  'Target': 'FireIcon',
  'Zap': 'BoltIcon',
  'Flag': 'FlagIcon',
  'Gift': 'GiftIcon',
  'Tag': 'TagIcon',
  'Layers': 'Squares2X2Icon',
  'Layout': 'ViewColumnsIcon',
  'Grid': 'Squares2X2Icon',
  'List': 'ListBulletIcon',
  'Grid3x3': 'Squares2X2Icon',
  'GripVertical': 'Bars3Icon',
  'Maximize': 'ArrowsPointingOutIcon',
  'Maximize2': 'ArrowsPointingOutIcon',
  'Minimize': 'ArrowsPointingInIcon',
  'Minimize2': 'ArrowsPointingInIcon',
  'Move': 'ArrowsUpDownIcon',
  'ArrowDownUp': 'ArrowsUpDownIcon',
  'Play': 'PlayIcon',
  'Pause': 'PauseIcon',
  'SkipBack': 'BackwardIcon',
  'SkipForward': 'ForwardIcon',
  'Volume': 'SpeakerWaveIcon',
  'Volume2': 'SpeakerWaveIcon',
  'VolumeX': 'SpeakerXMarkIcon',
  'Wifi': 'WifiIcon',
  'WifiOff': 'NoSymbolIcon',
  'Sun': 'SunIcon',
  'Moon': 'MoonIcon',
  'Cloud': 'CloudIcon',
  'CloudOff': 'CloudIcon',
  'Droplet': 'BeakerIcon',
  'Thermometer': 'FireIcon',
  'Wind': 'CloudIcon',
  'Globe': 'GlobeAltIcon',
  'Navigation': 'MapIcon',
  'Compass': 'MapIcon',
  'Package': 'CubeIcon',
  'ShoppingCart': 'ShoppingCartIcon',
  'ShoppingBag': 'ShoppingBagIcon',
  'CreditCard': 'CreditCardIcon',
  'DollarSign': 'CurrencyDollarIcon',
  'Percent': 'ReceiptPercentIcon',
  'Code': 'CodeBracketIcon',
  'Terminal': 'CommandLineIcon',
  'Database': 'CircleStackIcon',
  'Server': 'ServerIcon',
  'Smartphone': 'DevicePhoneMobileIcon',
  'Tablet': 'DeviceTabletIcon',
  'Laptop': 'ComputerDesktopIcon',
  'Monitor': 'ComputerDesktopIcon',
  'Printer': 'PrinterIcon',
  'Camera': 'CameraIcon',
  'Mic': 'MicrophoneIcon',
  'MicOff': 'MicrophoneIcon',
  'Power': 'PowerIcon',
  'Battery': 'BoltIcon',
  'BatteryCharging': 'BoltIcon',
  'Bluetooth': 'SignalIcon',
  'Cast': 'TvIcon',
  'Airplay': 'TvIcon',
  'Book': 'BookOpenIcon',
  'BookOpen': 'BookOpenIcon',
  'Bookmark': 'BookmarkIcon',
  'Briefcase': 'BriefcaseIcon',
  'Building': 'BuildingOfficeIcon',
  'Building2': 'BuildingOffice2Icon',
  'School': 'AcademicCapIcon',
  'GraduationCap': 'AcademicCapIcon',
  'Calculator': 'CalculatorIcon',
  'ChefHat': 'SparklesIcon',
  'Cpu': 'CpuChipIcon',
  'Feather': 'PencilIcon',
  'Film': 'FilmIcon',
  'Hash': 'HashtagIcon',
  'Headphones': 'MusicalNoteIcon',
  'Inbox': 'InboxIcon',
  'Lightbulb': 'LightBulbIcon',
  'Map': 'MapIcon',
  'Megaphone': 'SpeakerWaveIcon',
  'Newspaper': 'NewspaperIcon',
  'Palette': 'PaintBrushIcon',
  'PenTool': 'PencilIcon',
  'Puzzle': 'PuzzlePieceIcon',
  'Radio': 'RadioIcon',
  'Rocket': 'RocketLaunchIcon',
  'Scissors': 'ScissorsIcon',
  'Sparkles': 'SparklesIcon',
  'Atom': 'SparklesIcon',
  'Tool': 'WrenchIcon',
  'Wrench': 'WrenchScrewdriverIcon',
  'Umbrella': 'CloudIcon',
  'Watch': 'ClockIcon',
  'Gem': 'SparklesIcon',
  'Crown': 'TrophyIcon',

  // Arrows
  'ArrowUp': 'ArrowUpIcon',
  'ArrowDown': 'ArrowDownIcon',
  'ArrowLeft': 'ArrowLeftIcon',
  'ArrowRight': 'ArrowRightIcon',
  'ArrowUpRight': 'ArrowUpRightIcon',
  'ArrowUpLeft': 'ArrowUpLeftIcon',
  'ArrowDownRight': 'ArrowDownRightIcon',
  'ArrowDownLeft': 'ArrowDownLeftIcon',
  'MoveUp': 'ArrowUpIcon',
  'MoveDown': 'ArrowDownIcon',
  'MoveLeft': 'ArrowLeftIcon',
  'MoveRight': 'ArrowRightIcon',
};

// Files to skip (documentation)
const SKIP_FILES = [
  'README.md',
  'MIGRATION_GUIDE.md',
];

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

function shouldSkipFile(filePath) {
  return SKIP_FILES.some(skip => filePath.includes(skip));
}

function migrateFile(filePath) {
  if (shouldSkipFile(filePath)) {
    return { migrated: false, icons: [] };
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  let migratedIcons = [];

  // Check if file imports from lucide-react
  if (!content.includes("from 'lucide-react'") && !content.includes('from "lucide-react"')) {
    return { migrated: false, icons: [] };
  }

  // Extract lucide imports
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]lucide-react['"]/g;
  const matches = [...content.matchAll(importRegex)];

  if (matches.length === 0) {
    return { migrated: false, icons: [] };
  }

  // Process each import statement
  matches.forEach(match => {
    const importedIcons = match[1]
      .split(',')
      .map(icon => icon.trim())
      .filter(icon => icon.length > 0);

    const mappedIcons = [];
    const unmappedIcons = [];

    importedIcons.forEach(icon => {
      if (ICON_MAP[icon]) {
        mappedIcons.push(ICON_MAP[icon]);
        migratedIcons.push({ from: icon, to: ICON_MAP[icon] });

        // Replace icon usage in JSX (case-sensitive)
        const jsxRegex = new RegExp(`<${icon}(\\s|>|/)`, 'g');
        content = content.replace(jsxRegex, `<${ICON_MAP[icon]}$1`);
      } else {
        unmappedIcons.push(icon);
      }
    });

    if (unmappedIcons.length > 0) {
      console.warn(`⚠️  Unmapped icons in ${path.basename(filePath)}: ${unmappedIcons.join(', ')}`);
    }

    // Replace import statement
    if (mappedIcons.length > 0) {
      const newImport = `import { ${mappedIcons.join(', ')} } from '@heroicons/react/24/outline'`;
      content = content.replace(match[0], newImport);
    } else {
      // Remove import if no icons were mapped
      content = content.replace(match[0], '');
    }
  });

  // Write updated content if changes were made
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    return { migrated: true, icons: migratedIcons };
  }

  return { migrated: false, icons: [] };
}

// Main execution
console.log('🔄 Starting icon migration: lucide-react → @heroicons/react\n');

const srcDir = path.join(__dirname, 'src');
const files = getAllFiles(srcDir);
let totalMigrated = 0;
let totalIcons = 0;

files.forEach(file => {
  const result = migrateFile(file);

  if (result.migrated) {
    totalMigrated++;
    totalIcons += result.icons.length;
    const relativePath = path.relative(process.cwd(), file);
    console.log(`✅ ${relativePath} (${result.icons.length} icons)`);
  }
});

console.log(`\n📊 Migration Summary:`);
console.log(`   Files migrated: ${totalMigrated}`);
console.log(`   Icons replaced: ${totalIcons}`);
console.log(`   Total files scanned: ${files.length}`);

console.log('\n✨ Migration complete!');
console.log('Next steps:');
console.log('1. Review changes with: git diff');
console.log('2. Commit changes: git add -A && git commit');
console.log('3. Test build: npm run build');
