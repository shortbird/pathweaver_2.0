#!/bin/bash
# Comprehensive Color Migration Script
# Migrates all inline hex colors to Tailwind utility classes
# Author: Claude Code
# Date: 2025-01-22

echo "🎨 Starting comprehensive color migration..."

# Find all JSX/JS files in frontend/src
FILES=$(find frontend/src -type f \( -name "*.jsx" -o -name "*.js" \) ! -path "*/node_modules/*")

TOTAL_FILES=$(echo "$FILES" | wc -l)
echo "📁 Found $TOTAL_FILES files to process"

# Counter for changes
CHANGED_FILES=0

for file in $FILES; do
  # Check if file contains any hex colors
  if grep -q "#[0-9A-Fa-f]\{6\}" "$file"; then
    echo "  Processing: $file"

    # Create backup
    cp "$file" "$file.bak"

    # BRAND GRADIENTS - Primary gradient (purple → pink)
    sed -i 's/from-\[#6d469b\] to-\[#ef597b\]/bg-gradient-primary/g' "$file"
    sed -i 's/from-\[#6D469B\] to-\[#EF597B\]/bg-gradient-primary/g' "$file"
    sed -i 's/bg-gradient-to-r from-\[#6d469b\] to-\[#ef597b\]/bg-gradient-to-r bg-gradient-primary/g' "$file"
    sed -i 's/bg-gradient-to-br from-\[#6d469b\] to-\[#ef597b\]/bg-gradient-to-br bg-gradient-primary/g' "$file"

    # BRAND GRADIENTS - Reverse gradient (pink → purple)
    sed -i 's/from-\[#ef597b\] to-\[#6d469b\]/bg-gradient-primary-reverse/g' "$file"
    sed -i 's/from-\[#EF597B\] to-\[#6D469B\]/bg-gradient-primary-reverse/g' "$file"

    # BRAND GRADIENTS - With opacity
    sed -i 's/from-\[#ef597b\]\/5 to-\[#6d469b\]\/5/from-optio-pink\/5 to-optio-purple\/5/g' "$file"
    sed -i 's/from-\[#EF597B\]\/5 to-\[#6D469B\]\/5/from-optio-pink\/5 to-optio-purple\/5/g' "$file"
    sed -i 's/from-\[#6d469b\]\/5 to-\[#ef597b\]\/5/from-optio-purple\/5 to-optio-pink\/5/g' "$file"
    sed -i 's/from-\[#6D469B\]\/5 to-\[#EF597B\]\/5/from-optio-purple\/5 to-optio-pink\/5/g' "$file"

    # BRAND COLORS - Purple
    sed -i 's/text-\[#6d469b\]/text-optio-purple/g' "$file"
    sed -i 's/text-\[#6D469B\]/text-optio-purple/g' "$file"
    sed -i 's/bg-\[#6d469b\]/bg-optio-purple/g' "$file"
    sed -i 's/bg-\[#6D469B\]/bg-optio-purple/g' "$file"
    sed -i 's/border-\[#6d469b\]/border-optio-purple/g' "$file"
    sed -i 's/border-\[#6D469B\]/border-optio-purple/g' "$file"

    # BRAND COLORS - Pink
    sed -i 's/text-\[#ef597b\]/text-optio-pink/g' "$file"
    sed -i 's/text-\[#EF597B\]/text-optio-pink/g' "$file"
    sed -i 's/bg-\[#ef597b\]/bg-optio-pink/g' "$file"
    sed -i 's/bg-\[#EF597B\]/bg-optio-pink/g' "$file"
    sed -i 's/border-\[#ef597b\]/border-optio-pink/g' "$file"
    sed -i 's/border-\[#EF597B\]/border-optio-pink/g' "$file"

    # PILLAR COLORS - STEM
    sed -i 's/from-\[#2469D1\] to-\[#1B4FA3\]/bg-gradient-pillar-stem/g' "$file"
    sed -i 's/text-\[#2469D1\]/text-pillar-stem/g' "$file"
    sed -i 's/bg-\[#2469D1\]/bg-pillar-stem/g' "$file"
    sed -i 's/border-\[#2469D1\]/border-pillar-stem/g' "$file"

    # PILLAR COLORS - Art
    sed -i 's/from-\[#AF56E5\] to-\[#9945D1\]/bg-gradient-pillar-art/g' "$file"
    sed -i 's/text-\[#AF56E5\]/text-pillar-art/g' "$file"
    sed -i 's/bg-\[#AF56E5\]/bg-pillar-art/g' "$file"
    sed -i 's/border-\[#AF56E5\]/border-pillar-art/g' "$file"

    # PILLAR COLORS - Communication
    sed -i 's/from-\[#3DA24A\] to-\[#2E8A3A\]/bg-gradient-pillar-communication/g' "$file"
    sed -i 's/from-\[#3DA24A\] to-\[#2E8838\]/bg-gradient-pillar-communication/g' "$file"
    sed -i 's/text-\[#3DA24A\]/text-pillar-communication/g' "$file"
    sed -i 's/bg-\[#3DA24A\]/bg-pillar-communication/g' "$file"
    sed -i 's/border-\[#3DA24A\]/border-pillar-communication/g' "$file"

    # PILLAR COLORS - Wellness (ORANGE)
    sed -i 's/from-\[#FF9028\] to-\[#E67A1A\]/bg-gradient-pillar-wellness/g' "$file"
    sed -i 's/from-\[#FF9028\] to-\[#E67A15\]/bg-gradient-pillar-wellness/g' "$file"
    sed -i 's/text-\[#FF9028\]/text-pillar-wellness/g' "$file"
    sed -i 's/bg-\[#FF9028\]/bg-pillar-wellness/g' "$file"
    sed -i 's/border-\[#FF9028\]/border-pillar-wellness/g' "$file"

    # PILLAR COLORS - Civics (RED)
    sed -i 's/from-\[#E65C5C\] to-\[#D43F3F\]/bg-gradient-pillar-civics/g' "$file"
    sed -i 's/from-\[#E65C5C\] to-\[#D14545\]/bg-gradient-pillar-civics/g' "$file"
    sed -i 's/text-\[#E65C5C\]/text-pillar-civics/g' "$file"
    sed -i 's/bg-\[#E65C5C\]/bg-pillar-civics/g' "$file"
    sed -i 's/border-\[#E65C5C\]/border-pillar-civics/g' "$file"

    # NEUTRAL COLORS
    sed -i 's/text-\[#003f5c\]/text-text-primary/g' "$file"
    sed -i 's/text-\[#3B383C\]/text-neutral-700/g' "$file"
    sed -i 's/bg-\[#F3EFF4\]/bg-neutral-50/g' "$file"
    sed -i 's/bg-\[#EEEBEF\]/bg-neutral-100/g' "$file"

    # Check if file actually changed
    if ! diff -q "$file" "$file.bak" > /dev/null 2>&1; then
      CHANGED_FILES=$((CHANGED_FILES + 1))
      rm "$file.bak"
    else
      # No changes, restore backup
      mv "$file.bak" "$file"
    fi
  fi
done

echo ""
echo "✅ Migration complete!"
echo "📊 Changed $CHANGED_FILES out of $TOTAL_FILES files"
echo ""
echo "🔍 Remaining hex colors:"
find frontend/src -type f \( -name "*.jsx" -o -name "*.js" \) ! -path "*/node_modules/*" -exec grep -l "#[0-9A-Fa-f]\{6\}" {} \; | wc -l
echo ""
echo "💡 Run 'git diff' to review changes before committing"
