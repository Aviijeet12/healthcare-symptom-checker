/**
 * Build script: bundles lambda/analyze.ts into a single index.js
 * and creates a deployment-ready ZIP file.
 *
 * Usage: node scripts/build-lambda.mjs
 * Output: lambda-deploy/function.zip
 */

import { execSync } from "child_process"
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")
const outDir = join(root, "lambda-deploy")

// 1. Clean output directory
console.log("[build-lambda] Cleaning output directory...")
mkdirSync(outDir, { recursive: true })

// 2. Bundle with esbuild → single index.js (CommonJS for Lambda runtime)
console.log("[build-lambda] Bundling lambda/analyze.ts → lambda-deploy/index.js ...")
execSync(
  [
    "npx esbuild",
    "lambda/analyze.ts",
    "--bundle",
    "--platform=node",
    "--target=node20",
    "--format=cjs",
    "--outfile=lambda-deploy/index.js",
    // redis is a native npm package — bundle it in (esbuild handles it fine)
    // crypto is a Node.js built-in — mark external
    "--external:crypto",
  ].join(" "),
  { cwd: root, stdio: "inherit" }
)

// Verify output exists
const indexPath = join(outDir, "index.js")
if (!existsSync(indexPath)) {
  console.error("[build-lambda] ERROR: index.js was not created!")
  process.exit(1)
}

const sizeKB = (readFileSync(indexPath).length / 1024).toFixed(1)
console.log(`[build-lambda] Bundle size: ${sizeKB} KB`)

// 3. Create ZIP using PowerShell (Windows) or zip (Linux/Mac)
console.log("[build-lambda] Creating function.zip ...")
const zipPath = join(outDir, "function.zip")

try {
  // Try PowerShell (Windows)
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${indexPath}' -DestinationPath '${zipPath}' -Force"`,
    { cwd: root, stdio: "inherit" }
  )
} catch {
  try {
    // Fallback: zip command (Linux/Mac)
    execSync(`cd "${outDir}" && zip -j function.zip index.js`, { stdio: "inherit" })
  } catch {
    console.error("[build-lambda] ERROR: Could not create ZIP. Install 'zip' or use PowerShell.")
    process.exit(1)
  }
}

if (!existsSync(zipPath)) {
  console.error("[build-lambda] ERROR: function.zip was not created!")
  process.exit(1)
}

const zipSizeKB = (readFileSync(zipPath).length / 1024).toFixed(1)
console.log(`\n[build-lambda] ✅ Done!`)
console.log(`  Bundle:  lambda-deploy/index.js  (${sizeKB} KB)`)
console.log(`  ZIP:     lambda-deploy/function.zip  (${zipSizeKB} KB)`)
console.log(`\n  Upload this ZIP to AWS Lambda.`)
console.log(`  Handler: index.handler`)
