#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);
const outputDir = args[0] ? path.resolve(args[0]) : path.resolve('/Users/adrian-phan.team-mint.io/GMV_Max_Releases');

// Read manifest.json to get version
const manifestJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/manifest.json'), 'utf8'));
const version = manifestJson.version;

// Define paths
const distDir = path.join(__dirname, '../dist');
const tempDir = path.join(outputDir, `gmv-max-v${version}`);
const zipFile = path.join(outputDir, `gmv-max-v${version}.zip`);

console.log(`📦 Packaging extension v${version}...`);
console.log(`📁 Output directory: ${outputDir}`);

// Check if dist folder exists
if (!fs.existsSync(distDir)) {
  console.error('❌ Error: dist folder not found. Run "npm run build:extension" first.');
  process.exit(1);
}

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  console.log(`📁 Creating output directory: ${outputDir}`);
  try {
    fs.mkdirSync(outputDir, { recursive: true });
  } catch (error) {
    console.error('❌ Error creating output directory:', error.message);
    process.exit(1);
  }
}

// Remove temp directory if it exists
if (fs.existsSync(tempDir)) {
  console.log('🗑️  Removing existing temp directory...');
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// Remove existing zip file if it exists
if (fs.existsSync(zipFile)) {
  console.log('🗑️  Removing existing zip file...');
  fs.unlinkSync(zipFile);
}

// Copy dist folder to temp directory
console.log('📁 Copying dist folder...');
try {
  fs.cpSync(distDir, tempDir, { recursive: true });
} catch (error) {
  console.error('❌ Error copying dist folder:', error.message);
  process.exit(1);
}

// Create zip file (cross-platform)
console.log('🗜️  Creating zip archive...');
try {
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    // Windows: Use PowerShell Compress-Archive
    execSync(
      `powershell Compress-Archive -Path "${tempDir}" -DestinationPath "${zipFile}" -Force`,
      { stdio: 'inherit' }
    );
  } else {
    // Unix/Mac: Use zip command
    const folderName = `gmv-max-v${version}`;
    execSync(
      `cd "${path.dirname(tempDir)}" && zip -r "${path.basename(zipFile)}" "${folderName}"`,
      { stdio: 'inherit' }
    );
  }
} catch (error) {
  console.error('❌ Error creating zip file:', error.message);
  // Clean up temp directory
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  process.exit(1);
}

// Clean up temp directory
console.log('🧹 Cleaning up...');
if (fs.existsSync(tempDir)) {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log(`✅ Extension packaged successfully!`);
console.log(`📦 Output: ${path.basename(zipFile)}`);
console.log(`📍 Location: ${zipFile}`);

// // Show usage help if no arguments provided
// if (args.length === 0) {
//   console.log(`\n💡 Usage: node package-extension.js [output-directory]`);
//   console.log(`   Examples:`);
//   console.log(`   - node package-extension.js                    # Output to GMV_Max_Releases (default)`);
//   console.log(`   - node package-extension.js ~/Downloads        # Output to Downloads folder`);
//   console.log(`   - node package-extension.js /path/to/releases   # Output to custom directory`);
// }
