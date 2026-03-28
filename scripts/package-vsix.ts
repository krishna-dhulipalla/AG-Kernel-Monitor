import { spawn } from "child_process";

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const args = ["@vscode/vsce", "package"];

const child = spawn(command, args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
  windowsHide: true,
  shell: process.platform === "win32",
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
