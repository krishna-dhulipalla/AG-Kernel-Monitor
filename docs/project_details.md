# Project Details

Google Antigravity is a powerful agent-based IDE, but it suffers from significant "Context Bloating." As a session progresses, the IDE injects hidden system rules, workspace context, and an "Inner Monologue" (reasoning tokens) that can quickly exceed 500k tokens, leading to latency and model hallucinations.

Currently I lack a low-level "telemetry" tool to tell them exactly why a session is heavy. We are building this tool to provide:

Granular Transparency: Distinguishing between raw prompt, conversation history, reasoning, and tool-operation tokens.

Session Hygiene: Identifying exactly when a session has reached its peak utility so it can be reset before performance degrades.

Data Integrity: Maintaining a persistent historical record of token usage that survives IDE restarts and tool crashes.

Cache Alignment: Linking the conversation logs (.pb files) directly to the "Brain Task" artifacts (/brain/ folder) to ensure that when a chat is deleted, the "ghost" context in the workspace is also purged.

Reference Projects & Limitations
This project is born out of the technical gaps found in existing community tools:

Antigravity Token Visualizer: While helpful for real-time graphs, it is "stateless." It fails to track tokens from previous chats, lacks a breakdown of reasoning vs. prompt, and often reports unstable counts due to background process delays.
https://github.com/akaitougarashi/CountTokens

Antigravity Panel: Aimed at cache management, but currently suffers from UI glitches and unreliable credit tracking. It manages files at a high level without providing the low-level token data needed to make informed "session reset" decisions.
https://github.com/n2ns/antigravity-panel

The Solution: A Bun.js powered terminal utility that prioritizes raw data and local SQLite persistence over "fancy" dashboards, focusing strictly on Workspace vs. Conversation metrics.
