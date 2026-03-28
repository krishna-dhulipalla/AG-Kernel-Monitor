# Runtime Investigation Report — Phases 1–4

**Project**: AG-Kernel-Monitor  
**Date**: March 27, 2026  
**Scope**: Can conversation content be recovered via runtime/API paths instead of static .pb decryption?

---

## Executive Summary

After thorough investigation of the running Antigravity IDE (v1.107.0, Electron 39.2.3) — including process enumeration, port scanning, language server command-line extraction, API probing, log analysis, and state store discovery — here is the verdict:

> **The LanguageServer exposes a gRPC service at `127.0.0.1:51925` (HTTPS/gRPC) and an HTTP endpoint at `127.0.0.1:51926`. The extension server runs at `127.0.0.1:51924` with CSRF protection. All HTTP API test calls returned 403/404, indicating the extension server requires the internal Electron IPC channel, not raw HTTP.**

> **However, the `storage.json` and `state.vscdb` files in the Electron user data directory contain rich, readable metadata — including complete workspace mappings, state keys like `trajectorySummaries`, and per-workspace state databases. These are already sufficient for our tool's needs WITHOUT decrypting .pb files.**

---

## Phase 1: Local API / LanguageServer Investigation

### 1.1 Architecture Discovery

The Antigravity IDE runs as an **Electron** application (Chromium + Node.js) with this process tree:

```
Antigravity.exe (PID 9232) — Main Electron process
├── crashpad-handler (PID 29524)
├── gpu-process (PID 31920)
├── network.mojom.NetworkService (PID 16168)
├── renderer / window 1 (PID 13920)
├── renderer / window 2 (PID 28148)
├── renderer / window 3 (PID 34616)
├── video_capture.mojom (PID 27432)
├── audio.mojom (PID 23124)
├── node.mojom.NodeService (PID 30816)
├── node.mojom.NodeService — Extension Host (PID 25764) ← KEY PROCESS
│   ├── tsserver (partial semantic) (PID 31820)
│   ├── tsserver (full) (PID 22536)
│   │   └── typingsInstaller (PID 19328)
│   └── markdown-language-features (PID 18140)
├── node.mojom.NodeService (PID 26640)
└── node.mojom.NodeService (PID 6552)
```

**17 total Antigravity processes** spawned from the main process.

### 1.2 Language Server Binary

```
Path: C:\...\Antigravity\resources\app\extensions\antigravity\bin\language_server_windows_x64.exe
PID:  636
```

**Full Command Line:**
```
language_server_windows_x64.exe
  --enable_lsp
  --csrf_token b0147fd5-f5c5-44ec-97a3-0b2b09cd522b
  --extension_server_port 51924
  --extension_server_csrf_token 1db77265-403b-43e1-b8e7-5c3112623e55
  --workspace_id file_c_3A_Users_vamsi_OneDrive_Desktop_Gtihub_repos_AG_Kernel_Monitor
  --cloud_code_endpoint https://daily-cloudcode-pa.googleapis.com
  --app_data_dir antigravity
  --parent_pipe_path \\.\pipe\server_081075621147a7ce
```

> [!IMPORTANT]
> **Key findings from the command line:**
> - **Two CSRF tokens** — one for the LS itself, one for the extension server
> - **`workspace_id`** — the LS already knows which workspace it's serving (encoded path)
> - **`cloud_code_endpoint`** — all model calls go to `https://daily-cloudcode-pa.googleapis.com`
> - **`parent_pipe_path`** — IPC via Windows named pipe, not HTTP
> - **`app_data_dir: antigravity`** — confirms `~/.gemini/antigravity/` as the data root

### 1.3 Port Mapping

| Port | PID | Process | Protocol | Purpose |
|---|---|---|---|---|
| **57980** | 9232 | Antigravity (main) | HTTP | Browser onboarding server |
| **51924** | 25764 | Extension Host | HTTP | Extension server (CSRF-protected) |
| **51925** | 636 | language_server | **HTTPS/gRPC** | Language server gRPC |
| **51926** | 636 | language_server | HTTP | Language server HTTP |
| **56845** | 25764 | Extension Host | HTTP | TS Server / debug |
| **51953** | 25764 | Extension Host | HTTP | Internal |
| **49923** | 25764 | Extension Host | HTTP | Chrome DevTools MCP |

### 1.4 API Probing Results

All three language server ports were tested with GET and POST requests including both CSRF tokens:

| Port | Path | Method | Result |
|---|---|---|---|
| 51924 | all tested paths | GET/POST | **403 Forbidden** |
| 51925 | all tested paths | GET/POST | **400 Bad Request** |
| 51926 | all tested paths | GET/POST | **404 Not Found** |

**Port 51925 returns "client sent HTTP request to HTTPS server"** — it requires TLS. This is a **gRPC-over-TLS** endpoint, not a REST API. The `400 Bad Request` confirms this is an HTTPS endpoint receiving plain HTTP.

**Port 51924 (extension server)** — the 403 indicates the CSRF token alone is insufficient. The extension server likely validates requests through the Electron IPC channel (named pipe), not direct HTTP. This is standard VS Code extension architecture.

### 1.5 Language Server Log Analysis (Critical Finds)

From `Antigravity.log` (46 KB, 205 lines):

**a) The LS is written in Go:**
```
I0327 13:09:45.764   636 server.go:1235] Starting language server process with pid 636
I0327 13:09:45.770   636 server.go:288]  Setting GOMAXPROCS to 4
```

**b) It uses a "planner_generator" with message counting:**
```
planner_generator.go:283] Requesting planner with 6 chat messages
planner_generator.go:283] Requesting planner with 9 chat messages
planner_generator.go:283] Requesting planner with 13 chat messages
...
planner_generator.go:283] Requesting planner with 91 chat messages  ← CURRENT SESSION
planner_generator.go:283] Requesting planner with 103 chat messages
```

> [!IMPORTANT]
> **The planner_generator logs expose the EXACT chat message count per turn.** This is a direct, runtime-visible signal for token estimation — the message count grows with each model invocation and directly correlates with context window usage. At 91–129 messages for this session, we can see session bloat in real time.

**c) gRPC service name discovered:**
```
/exa.language_server_pb.LanguageServerService/StreamAgentStateUpdates
```
This confirms the **`exa.language_server_pb`** protobuf package name. The gRPC service is called `LanguageServerService` with at least one method: `StreamAgentStateUpdates`.

**d) Cascade conversation tracking:**
```
agent state for conversation e05cfacd-6066-42fa-80ef-4ab033457eb6 not found
```
The LS maintains an in-memory agent state per conversation UUID. When the UI requests state for a conversation the LS isn't tracking, it returns this error.

**e) Model API calls to Google Cloud:**
```
URL: https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse
URL: https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist
URL: https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels
URL: https://daily-cloudcode-pa.googleapis.com/v1internal:recordCodeAssistMetrics
```

**f) MCP manager and DevTools:**
```
mcp_manager.go:846] OAuth setup failed for stitch
system_mcps.go:78] Chrome DevTools MCP URL discovered at http://127.0.0.1:49923/mcp
```

**g) Deprecated API discovery:**
```
/exa.language_server_pb.LanguageServerService/GetUserMemories (unknown): deprecated
```
This means the LS exposes a `GetUserMemories` gRPC method, though it's deprecated. There may be other methods.

### 1.6 Phase 1 Verdict

| Approach | Viability | Notes |
|---|---|---|
| REST API to extension server | ❌ NOT VIABLE | Requires Electron IPC, not raw HTTP |
| gRPC to language server | ⚠️ POSSIBLE but complex | Need TLS cert + protobuf definitions |
| Log parsing for message counts | ✅ **VIABLE** | `planner_generator.go` logs exact message counts |
| Named pipe IPC interception | ⚠️ COMPLEX | `\\.\pipe\server_*` — would need to reverse protobuf schema |

---

## Phase 2: Non-.pb Local Data Sources

### 2.1 Electron Data Directory

**Location**: `C:\Users\vamsi\AppData\Roaming\Antigravity\`

| Directory/File | Content | Usefulness |
|---|---|---|
| `User/globalStorage/storage.json` | **Complete workspace list with URIs** | ✅ CRITICAL |
| `User/globalStorage/state.vscdb` | SQLite DB (1.4 MB) — global IDE state | ✅ HIGH |
| `User/workspaceStorage/<hash>/` | Per-workspace SQLite state DBs | ✅ HIGH |
| `logs/` | Timestamped log sessions | ✅ MODERATE |
| `Local Storage/` | Chromium localStorage | 🔍 UNEXAMINED |
| `Session Storage/` | Chromium sessionStorage | 🔍 UNEXAMINED |
| `shared_proto_db/` | Chromium protobuf store | 🔍 UNEXAMINED |
| `Crashpad/` | Crash dumps | LOW |
| `Cache/`, `Code Cache/` | V8 compiled code cache | LOW |

### 2.2 storage.json — Complete Workspace Registry (★ KEY DISCOVERY)

**This single file solves our workspace mapping problem with 100% coverage.**

All 28 workspace URIs ever opened in Antigravity, from `profileAssociations.workspaces`:

| # | Workspace Path |
|---|---|
| 1 | `Autonomous-Web-UI-Multi-Agent` |
| 2 | `VirginiaTech/Personal/personal website` |
| 3 | `Hiring-Trend-Tracker` |
| 4 | `playground/vector-cosmic` |
| 5 | `OutreachOps` |
| 6 | `Local_business` |
| 7 | `ChatBot` |
| 8 | `ucp` |
| 9 | `Resume_cloner` |
| 10 | `find_right_person` |
| 11 | `AgentTask Operator` |
| 12 | WSL: `agenttask-operator` |
| 13 | `playground/axial-spirit` |
| 14 | `Vision Incident Response Kit (VIRK)` |
| 15 | `cheating-daddy` |
| 16 | `blocker_app` |
| 17 | `playground/lunar-sagan` |
| 18 | `Gtihub_repos/blocker_app` |
| 19 | `Gtihub_repos/FHIR_RAG` |
| 20 | `Gtihub_repos/A2AWalkthrough` |
| 21 | `Gtihub_repos/Project-Pulse-Generalist-A2A-Reasoning-Engine` |
| 22 | `playground/primal-kepler` |
| 23 | `Gtihub_repos/officeqa_agentbeats` |
| 24 | `Gtihub_repos/agentbeats-tutorial` |
| 25 | `playground/thermal-interstellar` |
| 26 | `playground/perihelion-helix` |
| 27 | `playground/electric-flare` |
| 28 | `Gtihub_repos/AG-Kernel-Monitor` |

**Note**: 6 are playground workspaces created by Antigravity itself (scratch environments).

### 2.3 state.vscdb Files

**33 workspace-level `state.vscdb` files** found under `workspaceStorage/`, ranging from 20 KB to 258 KB.

**1 global `state.vscdb`** (1.4 MB) in `globalStorage/`.

These are standard VS Code SQLite databases containing key-value state. The `workspace.json` inside each `workspaceStorage/<hash>/` directory maps the hash to the workspace URI.

### 2.4 storage.json State Keys (Operational Intelligence)

Critical keys discovered:

```json
"unifiedStateSync.hasTrajectorySummariesMigrated": true
"antigravityUnifiedStateSync.agentPreferences.hasPlanningModeMigrated": true
"antigravityUnifiedStateSync.agentPreferences.hasArtifactReviewPolicyMigrated": true
"antigravityUnifiedStateSync.agentPreferences.hasTerminalAutoExecutionPolicyMigrated": true
"antigravityUnifiedStateSync.modelPreferences.hasLastSelectedCascadeModelMigrated": true
"antigravityUnifiedStateSync.modelPreferences.hasLastModelDefaultOverrideVersionIdMigrated": true
"antigravityUnifiedStateSync.oauthToken.hasLegacyMigrated": true
```

> [!NOTE]
> The key `unifiedStateSync.hasTrajectorySummariesMigrated` confirms that **trajectory summaries** (conversation step history) are synced and stored in the unified state system. The `state.vscdb` global database likely contains these summaries.

---

## Phase 3: Runtime Plaintext Existence

### 3.1 CountTokens Extension Impact (Confirmed Problem)

From the renderer log, the `akaitougarashi.antigravity-token-viz` extension is causing **severe performance degradation**:

```
UNRESPONSIVE extension host: 'akaitougarashi.antigravity-token-viz'
  took 95.45% of 4791.861ms
  took 94.75% of 4754.604ms
```

This extension makes the entire Antigravity IDE freeze for ~5 seconds by trying to tokenize encrypted binary data. This validates our project's premise — the CountTokens approach is fundamentally broken.

### 3.2 Browser Onboarding Server

The main process runs an HTTP server on `localhost:57980` described as "Browser onboarding server". This is likely the authentication/setup UI, not conversation data.

### 3.3 Chrome DevTools MCP

```
Chrome DevTools MCP URL discovered at http://127.0.0.1:49923/mcp
```

The Antigravity extension host provides an MCP server connected to Chrome DevTools. This could potentially be used to inspect the renderer's JavaScript state, but is complex and fragile.

### 3.4 Log-Based Signal (Highest-Value Runtime Data)

The `Antigravity.log` provides these runtime signals without any API access:

| Signal | Source | Example | Value |
|---|---|---|---|
| **Chat message count** | `planner_generator.go:283` | `91 chat messages` | ✅ Direct session size metric |
| **API call frequency** | `http_helpers.go:123` | `streamGenerateContent` traces | ✅ Activity tracking |
| **Model retry attempts** | `planner_generator.go:283` | `retry attempt 1` | ✅ Error detection |
| **Active conversation UUID** | `interceptor.go:74` | `e05cfacd-...` | ✅ Session identification |
| **gRPC method calls** | `interceptor.go` | `StreamAgentStateUpdates` | ✅ API surface discovery |

---

## Phase 4: Decision Matrix

### Go / No-Go Assessment

| Path | Payoff | Effort | Verdict |
|---|---|---|---|
| Parse `storage.json` for workspace mappings | **100% workspace coverage** | LOW | ✅ **GO — Use immediately** |
| Query `state.vscdb` for trajectory summaries | **Structured conversation metadata** | MODERATE | ✅ **GO — Next priority** |
| Parse `Antigravity.log` for message counts | **Real-time session bloat metric** | LOW | ✅ **GO — Implement in Sprint 5** |
| Parse `workspaceStorage/` workspace.json | **Hash→workspace URI mapping** | LOW | ✅ **GO — Use immediately** |
| gRPC call to `LanguageServerService` | **Full conversation steps** | HIGH | ⚠️ DEFER — needs proto defs |
| Extension server API | **N/A** | HIGH | ❌ **NO-GO — requires Electron IPC** |
| Named pipe interception | **Full data** | VERY HIGH | ❌ **NO-GO — not worth it** |
| .pb file decryption | **Full data** | IMPOSSIBLE | ❌ **CONFIRMED DEAD** |

### Critical Path Recommendation

**Priority 1 (Sprint 2 enhancement):** Add `storage.json` parsing to `workspace-mapper.ts`. This gives **100% workspace coverage** (up from 73% with brain artifact parsing).

**Priority 2 (Sprint 2):** Query `state.vscdb` global database for keys matching `trajectory*`, `conversation*`, `cascade*`, `agent*`. This may contain structured conversation summaries that bypass the .pb encryption entirely.

**Priority 3 (Sprint 5):** Implement log file watching on `Antigravity.log` to extract real-time chat message counts from `planner_generator.go` lines. This provides the most accurate session bloat metric without touching .pb files.

**Do NOT pursue:** Extension server API, named pipe interception, or further .pb decryption attempts.

---

## Appendix A: File Inventory

| Path | Size | Format | Contains |
|---|---|---|---|
| `%APPDATA%\Antigravity\User\globalStorage\storage.json` | 12.6 KB | JSON | Full workspace registry, state migration flags |
| `%APPDATA%\Antigravity\User\globalStorage\state.vscdb` | 1.4 MB | SQLite | Global IDE state, potentially trajectory summaries |
| `%APPDATA%\Antigravity\User\globalStorage\state.vscdb.backup` | 1.4 MB | SQLite | Backup of above |
| `%APPDATA%\Antigravity\User\workspaceStorage\<hash>\state.vscdb` | 20–258 KB | SQLite | Per-workspace state |
| `%APPDATA%\Antigravity\logs\<date>\window1\exthost\google.antigravity\Antigravity.log` | ~46 KB | Log | LS activity, message counts, API traces |
| `%APPDATA%\Antigravity\logs\<date>\cloudcode.log` | ~10 KB | Log | Cloud API call log |
| `%APPDATA%\Antigravity\logs\<date>\main.log` | ~4 KB | Log | Main process errors, performance profiling |
| `%APPDATA%\Antigravity\logs\<date>\window1\renderer.log` | ~9 KB | Log | Extension host perf, unresponsive events |
| `%LOCALAPPDATA%\Programs\Antigravity\resources\app\` | ~210 MB | Electron | App binary, extensions, LS binary |

## Appendix B: gRPC Service Discovery

**Package**: `exa.language_server_pb`  
**Service**: `LanguageServerService`  

**Known methods:**
| Method | Status | Notes |
|---|---|---|
| `StreamAgentStateUpdates` | Active | Streams agent state for conversations |
| `GetUserMemories` | **Deprecated** | Was used for memory/recall |
| `GetCascadeTrajectorySteps` | **Unconfirmed** | Forum report suggests verbosity:2 returns full history |

**Connection**: `127.0.0.1:51925` (HTTPS/gRPC with self-signed cert)
