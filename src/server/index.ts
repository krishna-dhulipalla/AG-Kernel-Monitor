/**
 * `agk serve` — JSON API server using Bun.serve().
 *
 * Endpoints:
 *   GET /api/workspaces                  → workspace summary JSON
 *   GET /api/conversations?workspace=X   → conversation details
 *   GET /api/conversation/:uuid          → single conversation with snapshots
 *   GET /api/health                      → overall system health + ingestion stats
 */

import { Command } from "commander";
import chalk from "chalk";
import type { MonitorDB } from "../db/schema";
import type { AgKernelConfig } from "../config";
import { reconcile } from "../ingest/reconciler";
import { assessHealth, assessWorkspaceHealth } from "../metrics/health";
import { formatBytes, formatTokens } from "../metrics/estimator";

export function registerServeCommand(program: Command, db: MonitorDB, config: AgKernelConfig): void {
  program
    .command("serve")
    .description("Start a JSON API server on localhost")
    .option("-p, --port <number>", "Port to listen on", "3000")
    .action(async (options) => {
      const port = parseInt(options.port, 10);

      // Run initial ingestion
      console.log(chalk.dim("🔍 Running initial scan..."));
      const stats = await reconcile(db, config);
      console.log(chalk.dim(`   Scanned ${stats.conversationsTotal} conversations`));
      console.log();

      const server = Bun.serve({
        port,
        fetch(req) {
          const url = new URL(req.url);
          const path = url.pathname;

          // CORS headers
          const headers = {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          };

          if (req.method === "OPTIONS") {
            return new Response(null, { headers });
          }

          try {
            // ── GET /api/workspaces ──
            if (path === "/api/workspaces") {
              const workspaces = db.getAllWorkspaces();
              const data = workspaces
                .filter((ws) => ws.conversation_count > 0)
                .map((ws) => {
                  const conversations = db.getConversationsByWorkspace(ws.id);
                  const totalTokens = conversations.reduce((sum, c) => sum + c.estimated_tokens, 0);
                  const totalMessages = conversations.reduce((sum, c) => sum + (c.message_count || 0), 0);
                  const health = assessWorkspaceHealth(
                    conversations.map((c) => c.estimated_tokens),
                    config.bloatLimit
                  );

                  return {
                    id: ws.id,
                    name: ws.name,
                    uri: ws.uri,
                    estimatedTokens: totalTokens,
                    estimatedTokensFormatted: formatTokens(totalTokens),
                    conversationCount: ws.conversation_count,
                    messageCount: totalMessages,
                    brainSizeBytes: ws.total_brain_bytes,
                    brainSizeFormatted: formatBytes(ws.total_brain_bytes),
                    pbSizeBytes: ws.total_pb_bytes,
                    pbSizeFormatted: formatBytes(ws.total_pb_bytes),
                    health: health.status,
                    healthEmoji: health.emoji,
                    lastSeen: ws.last_seen,
                  };
                });

              return new Response(JSON.stringify({ workspaces: data }), { headers });
            }

            // ── GET /api/conversations?workspace=<name> ──
            if (path === "/api/conversations") {
              const workspaceName = url.searchParams.get("workspace");
              let conversations;

              if (workspaceName) {
                const ws = db.getAllWorkspaces().find(
                  (w) =>
                    w.name.toLowerCase() === workspaceName.toLowerCase() ||
                    w.name.toLowerCase().includes(workspaceName.toLowerCase())
                );
                if (!ws) {
                  return new Response(JSON.stringify({ error: "Workspace not found" }), {
                    status: 404,
                    headers,
                  });
                }
                conversations = db.getConversationsByWorkspace(ws.id);
              } else {
                conversations = db.getAllConversations();
              }

              const data = conversations.map((c) => {
                const health = assessHealth(c.estimated_tokens, config.bloatLimit);
                return {
                  ...c,
                  estimatedTokensFormatted: formatTokens(c.estimated_tokens),
                  pbSizeFormatted: formatBytes(c.pb_file_bytes),
                  brainSizeFormatted: formatBytes(c.brain_folder_bytes),
                  health: health.status,
                  healthEmoji: health.emoji,
                };
              });

              return new Response(JSON.stringify({ conversations: data }), { headers });
            }

            // ── GET /api/conversation/:uuid ──
            const convMatch = path.match(/^\/api\/conversation\/([a-f0-9-]+)$/i);
            if (convMatch) {
              const uuid = convMatch[1];
              const conv = db.getConversation(uuid);
              if (!conv) {
                return new Response(JSON.stringify({ error: "Conversation not found" }), {
                  status: 404,
                  headers,
                });
              }

              const snapshots = db.getSnapshotHistory(uuid);
              const health = assessHealth(conv.estimated_tokens, config.bloatLimit);

              return new Response(
                JSON.stringify({
                  conversation: {
                    ...conv,
                    estimatedTokensFormatted: formatTokens(conv.estimated_tokens),
                    pbSizeFormatted: formatBytes(conv.pb_file_bytes),
                    brainSizeFormatted: formatBytes(conv.brain_folder_bytes),
                    health: health.status,
                    healthEmoji: health.emoji,
                    bloatScore: health.ratio,
                  },
                  snapshots,
                }),
                { headers }
              );
            }

            // ── GET /api/health ──
            if (path === "/api/health") {
              const totalStats = db.getTotalStats();
              const allConversations = db.getAllConversations();
              const bloatViolations = allConversations.filter(
                (c) => c.estimated_tokens > config.bloatLimit
              );

              return new Response(
                JSON.stringify({
                  status: bloatViolations.length > 0 ? "degraded" : "healthy",
                  totalConversations: totalStats.total_conversations,
                  totalEstimatedTokens: totalStats.total_estimated_tokens,
                  totalEstimatedTokensFormatted: formatTokens(totalStats.total_estimated_tokens),
                  totalPbBytes: totalStats.total_pb_bytes,
                  totalPbBytesFormatted: formatBytes(totalStats.total_pb_bytes),
                  totalBrainBytes: totalStats.total_brain_bytes,
                  totalBrainBytesFormatted: formatBytes(totalStats.total_brain_bytes),
                  bloatLimit: config.bloatLimit,
                  bloatViolationCount: bloatViolations.length,
                  config: {
                    bloatLimit: config.bloatLimit,
                    bytesPerToken: config.bytesPerToken,
                  },
                }),
                { headers }
              );
            }

            // ── 404 ──
            return new Response(
              JSON.stringify({
                error: "Not found",
                availableEndpoints: [
                  "GET /api/workspaces",
                  "GET /api/conversations?workspace=<name>",
                  "GET /api/conversation/<uuid>",
                  "GET /api/health",
                ],
              }),
              { status: 404, headers }
            );
          } catch (err) {
            return new Response(
              JSON.stringify({ error: "Internal server error", message: String(err) }),
              { status: 500, headers }
            );
          }
        },
      });

      console.log(chalk.bold.green(`🚀 AG Kernel Monitor API server running on http://localhost:${port}`));
      console.log();
      console.log(chalk.dim("Available endpoints:"));
      console.log(chalk.dim(`  GET http://localhost:${port}/api/workspaces`));
      console.log(chalk.dim(`  GET http://localhost:${port}/api/conversations?workspace=<name>`));
      console.log(chalk.dim(`  GET http://localhost:${port}/api/conversation/<uuid>`));
      console.log(chalk.dim(`  GET http://localhost:${port}/api/health`));
    });
}
