import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const backendCwd = path.join(repoRoot, "healthcare-backend");

const windowsPython = path.join(repoRoot, ".venv", "Scripts", "python.exe");
const posixPython = path.join(repoRoot, ".venv", "bin", "python");

const pythonExecutable = existsSync(windowsPython)
  ? windowsPython
  : existsSync(posixPython)
    ? posixPython
    : "python";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("No arguments provided. Example: node scripts/backend-python.mjs -m pip --version");
  process.exit(2);
}

const result = spawnSync(pythonExecutable, args, {
  cwd: backendCwd,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
