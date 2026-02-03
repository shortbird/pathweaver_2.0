#!/bin/bash
# Script to fix Tailwind color inconsistencies
# Replaces default purple-600/pink-600 with Optio brand colors (optio-purple/optio-pink)

echo "Fixing brand color inconsistencies in frontend..."

# Find all JSX files in frontend/src
find frontend/src -name "*.jsx" -type f | while read file; do
    # Check if file contains color issues
    if grep -q "purple-600\|pink-600" "$file"; then
        echo "Fixing: $file"

        # Create backup
        cp "$file" "$file.bak"

        # Replace color classes (preserving context)
        sed -i 's/from-purple-600/from-optio-purple/g' "$file"
        sed -i 's/to-pink-600/to-optio-pink/g' "$file"
        sed -i 's/bg-purple-600/bg-optio-purple/g' "$file"
        sed -i 's/bg-pink-600/bg-optio-pink/g' "$file"
        sed -i 's/text-purple-600/text-optio-purple/g' "$file"
        sed -i 's/text-pink-600/text-optio-pink/g' "$file"
        sed -i 's/border-purple-600/border-optio-purple/g' "$file"
        sed -i 's/border-pink-600/border-optio-pink/g' "$file"
        sed -i 's/hover:bg-purple-600/hover:bg-optio-purple/g' "$file"
        sed -i 's/hover:bg-pink-600/hover:bg-optio-pink/g' "$file"
        sed -i 's/hover:text-purple-600/hover:text-optio-purple/g' "$file"
        sed -i 's/hover:text-pink-600/hover:text-optio-pink/g' "$file"
        sed -i 's/focus:border-purple-600/focus:border-optio-purple/g' "$file"
        sed -i 's/focus:ring-purple-600/focus:ring-optio-purple/g' "$file"

        # Handle ring colors
        sed -i 's/ring-purple-600/ring-optio-purple/g' "$file"
        sed -i 's/ring-pink-600/ring-optio-pink/g' "$file"

        # Handle divide colors
        sed -i 's/divide-purple-600/divide-optio-purple/g' "$file"
        sed -i 's/divide-pink-600/divide-optio-pink/g' "$file"
    fi
done

# Clean up backups
find frontend/src -name "*.jsx.bak" -delete

echo "Brand color fixes complete!"
echo "Verify changes with: git diff frontend/src"
