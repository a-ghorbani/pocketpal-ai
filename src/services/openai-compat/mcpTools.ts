import type {OaiTool} from './types';

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface RegisteredMcpServer {
  name: string;
  status: 'connected' | 'error';
  tools: McpToolDefinition[];
}

const TOOL_NAME_SANITIZE_RE = /[^a-zA-Z0-9_-]/g;

export function sanitizeToolName(name: string): string {
  return name.replace(TOOL_NAME_SANITIZE_RE, '_');
}

export function buildMcpToolNamespacedName(
  serverName: string,
  toolName: string,
): string {
  return `mcp__${sanitizeToolName(serverName)}__${sanitizeToolName(toolName)}`;
}

/**
 * Registry of MCP (Model Context Protocol) servers whose tools should be
 * exposed through the OpenAI-compatible API.
 *
 * V1 scope: tool-list merging. Registered MCP tools are merged into the
 * `tools` array of incoming /v1/chat/completions requests (namespaced as
 * mcp__<server>__<name>), and tool execution stays with the API client via
 * the standard `role: "tool"` message loop. This means any OpenAI client
 * that speaks MCP (Cherry Studio, Continue, custom agents) gets MCP support
 * transparently.
 */
export class McpToolRegistry {
  private servers: Map<string, RegisteredMcpServer> = new Map();

  registerServer(name: string, tools: McpToolDefinition[]): void {
    this.servers.set(name, {name, status: 'connected', tools});
  }

  markServerError(name: string): void {
    const server = this.servers.get(name);
    if (server) {
      server.status = 'error';
    }
  }

  removeServer(name: string): void {
    this.servers.delete(name);
  }

  getServers(): RegisteredMcpServer[] {
    return Array.from(this.servers.values());
  }

  hasServers(): boolean {
    return this.servers.size > 0;
  }

  /**
   * Merges client-provided tools with registered MCP tools.
   * Client tools take precedence on name collisions. MCP tools are exposed
   * with namespaced names so they cannot shadow client tools.
   */
  getMergedTools(clientTools?: OaiTool[]): OaiTool[] {
    const merged: OaiTool[] = [...(clientTools ?? [])];
    const takenNames = new Set(merged.map(tool => tool.function.name));

    for (const server of this.servers.values()) {
      if (server.status !== 'connected') {
        continue;
      }
      for (const tool of server.tools) {
        const namespacedName = buildMcpToolNamespacedName(
          server.name,
          tool.name,
        );
        if (takenNames.has(namespacedName)) {
          continue;
        }
        takenNames.add(namespacedName);
        merged.push({
          type: 'function',
          function: {
            name: namespacedName,
            description: tool.description ?? '',
            parameters: (tool.inputSchema as Record<string, unknown>) ?? {
              type: 'object',
              properties: {},
            },
          },
        });
      }
    }

    return merged;
  }
}

export const mcpToolRegistry = new McpToolRegistry();
