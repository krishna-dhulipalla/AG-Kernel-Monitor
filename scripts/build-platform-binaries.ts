import { chmodSync, mkdirSync, rmSync } from "fs";
import { dirname } from "path";

type BuildSpec = {
  vscodeTarget: string;
  bunTarget: Bun.Build.Target;
  outputFile: string;
};

const ALL_TARGETS: BuildSpec[] = [
  { vscodeTarget: "win32-x64", bunTarget: "bun-windows-x64", outputFile: "vscode/runtime/bin/win32-x64/agk-monitor.exe" },
  { vscodeTarget: "win32-arm64", bunTarget: "bun-windows-arm64", outputFile: "vscode/runtime/bin/win32-arm64/agk-monitor.exe" },
  { vscodeTarget: "darwin-x64", bunTarget: "bun-darwin-x64", outputFile: "vscode/runtime/bin/darwin-x64/agk-monitor" },
  { vscodeTarget: "darwin-arm64", bunTarget: "bun-darwin-arm64", outputFile: "vscode/runtime/bin/darwin-arm64/agk-monitor" },
  { vscodeTarget: "linux-x64", bunTarget: "bun-linux-x64", outputFile: "vscode/runtime/bin/linux-x64/agk-monitor" },
  { vscodeTarget: "linux-arm64", bunTarget: "bun-linux-arm64", outputFile: "vscode/runtime/bin/linux-arm64/agk-monitor" },
];

function selectTargets(argvTarget?: string): BuildSpec[] {
  if (!argvTarget) {
    return ALL_TARGETS;
  }

  const match = ALL_TARGETS.find((target) => target.vscodeTarget === argvTarget);
  if (!match) {
    throw new Error(`Unsupported target "${argvTarget}". Supported targets: ${ALL_TARGETS.map((target) => target.vscodeTarget).join(", ")}`);
  }

  return [match];
}

async function buildTarget(target: BuildSpec): Promise<void> {
  mkdirSync(dirname(target.outputFile), { recursive: true });

  const result = await Bun.build({
    entrypoints: ["./src/cli/index.ts"],
    compile: {
      target: target.bunTarget,
      outfile: target.outputFile,
      autoloadDotenv: false,
      autoloadPackageJson: false,
      autoloadTsconfig: false,
    },
    minify: true,
    sourcemap: "none",
    bytecode: true,
    target: "bun",
  });

  if (!result.success) {
    const logs = result.logs.map((log) => log.message).join("\n");
    throw new Error(`Failed to build ${target.vscodeTarget}\n${logs}`);
  }

  if (!target.vscodeTarget.startsWith("win32-")) {
    chmodSync(target.outputFile, 0o755);
  }

  console.log(`Built ${target.vscodeTarget} -> ${target.outputFile}`);
}

export async function buildRuntimeTargets(onlyTarget?: string): Promise<void> {
  const targets = selectTargets(onlyTarget);

  rmSync("vscode/runtime/bin", { recursive: true, force: true });

  for (const target of targets) {
    await buildTarget(target);
  }
}

if (import.meta.main) {
  await buildRuntimeTargets(process.argv[2]);
}
