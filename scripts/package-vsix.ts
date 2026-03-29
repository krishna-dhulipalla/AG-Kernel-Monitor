import { spawn } from "child_process";
import { join } from "path";

const vsceEntry = join(process.cwd(), "node_modules", "@vscode", "vsce", "vsce");
const nodeCommand = process.platform === "win32" ? "node.exe" : "node";
const child = spawn(nodeCommand, [vsceEntry, "package"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
  windowsHide: true,
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
