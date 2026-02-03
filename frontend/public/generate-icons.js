/**
 * Generate favicon and app icons from SVG using sharp library
 * Run with: node generate-icons.js
 * Requires: npm install sharp
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Icon sizes to generate
const ICON_SIZES = [
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'favicon-192x192.png', size: 192 },
  { name: 'favicon-512x512.png', size: 512 },
];

async function generateIcons() {
  const svgPath = path.join(__dirname, 'optio-logo.svg');
  const svgBuffer = fs.readFileSync(svgPath);

  console.log(`Source SVG: ${svgPath}`);
  console.log(`Output directory: ${__dirname}\n`);

  // Generate all PNG sizes
  for (const icon of ICON_SIZES) {
    const outputPath = path.join(__dirname, icon.name);
    console.log(`Generating ${icon.name} (${icon.size}x${icon.size})...`);

    await sharp(svgBuffer)
      .resize(icon.size, icon.size, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 } // Transparent background
      })
      .png()
      .toFile(outputPath);

    console.log(`  ✓ Created ${icon.name}`);
  }

  // Generate ICO file from 32x32 PNG
  console.log('\nGenerating favicon.ico...');
  const png32Path = path.join(__dirname, 'favicon-32x32.png');
  const icoPath = path.join(__dirname, 'favicon.ico');

  // For ICO, we'll just copy the 32x32 PNG and rename
  // Sharp doesn't support ICO output, but modern browsers accept PNG as ICO
  await sharp(svgBuffer)
    .resize(32, 32, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 }
    })
    .toFormat('png')
    .toFile(icoPath);

  console.log('  ✓ Created favicon.ico');

  console.log('\n✓ All icons generated successfully!');
  console.log('\nGenerated files:');
  ICON_SIZES.forEach(icon => console.log(`  - ${icon.name}`));
  console.log('  - favicon.ico');
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
