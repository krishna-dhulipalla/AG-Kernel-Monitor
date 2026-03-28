/**
 * `agk serve` — JSON API server using Bun.serve().
 */

import { Command } from "commander";
import chalk from "chalk";
import type { MonitorDB } from "../db/schema";
import type { AgKernelConfig } from "../config";
import { reconcile } from "../ingest/reconciler";
import {
  buildConversationViewModel,
  buildWorkspaceViewModel,
  getCurrentConversationView,
  listConversationViewModels,
  listWorkspaceViewModels,
} from "../view-models";

export function registerServeCommand(program: Command, db: MonitorDB, config: AgKernelConfig): void {
  program
    .command("serve")
    .description("Start a JSON API server on localhost")
    .option("-p, --port <number>", "Port to listen on", "3000")
    .action(async (options) => {
      const port = parseInt(options.port, 10);

      console.log(chalk.dim("🔍 Running initial scan..."));
      const stats = await reconcile(db, config);
      console.log(chalk.dim(`   Scanned ${stats.conversationsTotal} conversations`));
      console.log();

      Bun.serve({
        port,
        fetch(req) {
          const url = new URL(req.url);
          const path = url.pathname;

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
            if (path === "/api/workspaces") {
              const workspaces = listWorkspaceViewModels(db, config);
              return new Response(JSON.stringify({
                currentConversation: getCurrentConversationView(db, config),
                workspaces,
              }), { headers });
            }

            if (path === "/api/conversations") {
              const workspaceName = url.searchParams.get("workspace");
              const workspace = workspaceName
                ? db.getAllWorkspaces().find(
                    (entry) =>
                      entry.name.toLowerCase() === workspaceName.toLowerCase()
                      || entry.name.toLowerCase().includes(workspaceName.toLowerCase())
                  ) ?? null
                : null;

              if (workspaceName && !workspace) {
                return new Response(JSON.stringify({ error: "Workspace not found" }), { status: 404, headers });
              }

              const conversations = listConversationViewModels(
                db,
                config,
                workspace ? db.getConversationsByWorkspace(workspace.id) : db.getAllConversations(),
              );

              return new Response(JSON.stringify({
                currentConversation: getCurrentConversationView(db, config),
                workspace: workspace ? buildWorkspaceViewModel(db, config, workspace) : null,
                conversations,
              }), { headers });
            }

            const conversationMatch = path.match(/^\/api\/conversation\/([a-f0-9-]+)$/i);
            if (conversationMatch) {
              const conversation = db.getConversation(conversationMatch[1]);
              if (!conversation) {
                return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404, headers });
              }

              return new Response(JSON.stringify({
                conversation: buildConversationViewModel(db, config, conversation),
                snapshots: db.getSnapshotHistory(conversation.id),
              }), { headers });
            }

            if (path === "/api/health") {
              const currentConversation = getCurrentConversationView(db, config);
              const workspaces = listWorkspaceViewModels(db, config);
              const largestWorkspace = workspaces[0] ?? null;
              const unmappedCount = listConversationViewModels(db, config, db.getAllConversations())
                .filter((conversation) => conversation.mappingSource === "unmapped")
                .length;

              return new Response(JSON.stringify({
                status: currentConversation.conversation && currentConversation.conversation.contextRatio >= 1
                  ? "degraded"
                  : "healthy",
                currentConversation,
                topWorkspace: largestWorkspace,
                unmappedConversationCount: unmappedCount,
                bloatLimit: config.bloatLimit,
              }), { headers });
            }

            return new Response(JSON.stringify({
              error: "Not found",
              availableEndpoints: [
                "GET /api/workspaces",
                "GET /api/conversations?workspace=<name>",
                "GET /api/conversation/<uuid>",
                "GET /api/health",
              ],
            }), { status: 404, headers });
          } catch (err) {
            return new Response(JSON.stringify({
              error: "Internal server error",
              message: String(err),
            }), { status: 500, headers });
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
