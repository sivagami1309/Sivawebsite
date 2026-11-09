// "npm run build": this project has no compile step, so this just checks every file for syntax errors.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function javascriptFiles(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(folder, entry.name);
    if (entry.isDirectory()) return javascriptFiles(fullPath);
    return entry.name.endsWith(".js") ? [fullPath] : [];
  });
}

const root = path.join(__dirname, "..");
const files = [...javascriptFiles(path.join(root, "backend")), ...javascriptFiles(path.join(root, "frontend"))];
for (const file of files) execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
console.log(`Checked ${files.length} files: no syntax errors.`);
