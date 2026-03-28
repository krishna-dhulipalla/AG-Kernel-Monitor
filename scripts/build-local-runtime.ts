import { arch, platform } from "os";
import { buildRuntimeTargets } from "./build-platform-binaries";

function detectVsCodeTarget(): string {
  const currentPlatform = platform();
  const currentArch = arch();

  if (currentPlatform === "win32" && currentArch === "x64") return "win32-x64";
  if (currentPlatform === "win32" && currentArch === "arm64") return "win32-arm64";
  if (currentPlatform === "darwin" && currentArch === "x64") return "darwin-x64";
  if (currentPlatform === "darwin" && currentArch === "arm64") return "darwin-arm64";
  if (currentPlatform === "linux" && currentArch === "x64") return "linux-x64";
  if (currentPlatform === "linux" && currentArch === "arm64") return "linux-arm64";

  throw new Error(`Unsupported local packaging target: platform=${currentPlatform} arch=${currentArch}`);
}

await buildRuntimeTargets(detectVsCodeTarget());
