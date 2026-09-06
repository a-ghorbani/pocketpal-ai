import {
  buildMcpToolNamespacedName,
  McpToolRegistry,
  sanitizeToolName,
} from '../mcpTools';

const makeClientTool = (name: string) => ({
  type: 'function',
  function: {name, description: 'client tool', parameters: {}},
});

describe('sanitizeToolName', () => {
  it('replaces invalid characters with underscores', () => {
    expect(sanitizeToolName('my tool.name/x')).toBe('my_tool_name_x');
  });

  it('keeps valid characters', () => {
    expect(sanitizeToolName('search-web_2')).toBe('search-web_2');
  });
});

describe('buildMcpToolNamespacedName', () => {
  it('namespaces server and tool names', () => {
    expect(buildMcpToolNamespacedName('files', 'read_file')).toBe(
      'mcp__files__read_file',
    );
  });
});

describe('McpToolRegistry', () => {
  it('starts empty', () => {
    const registry = new McpToolRegistry();
    expect(registry.hasServers()).toBe(false);
    expect(registry.getServers()).toEqual([]);
  });

  it('registers and removes servers', () => {
    const registry = new McpToolRegistry();
    registry.registerServer('fs', [{name: 'read', description: 'Read a file'}]);
    expect(registry.hasServers()).toBe(true);
    expect(registry.getServers()[0].status).toBe('connected');
    registry.removeServer('fs');
    expect(registry.hasServers()).toBe(false);
  });

  it('marks server errors', () => {
    const registry = new McpToolRegistry();
    registry.registerServer('fs', [{name: 'read'}]);
    registry.markServerError('fs');
    expect(registry.getServers()[0].status).toBe('error');
  });

  it('merges MCP tools into client tools with namespaced names', () => {
    const registry = new McpToolRegistry();
    registry.registerServer('fs', [
      {
        name: 'read_file',
        description: 'Reads files',
        inputSchema: {type: 'object'},
      },
    ]);

    const merged = registry.getMergedTools([makeClientTool('get_weather')]);
    expect(merged).toHaveLength(2);
    expect(merged[0].function.name).toBe('get_weather');
    expect(merged[1].function.name).toBe('mcp__fs__read_file');
    expect(merged[1].function.description).toBe('Reads files');
    expect(merged[1].function.parameters).toEqual({type: 'object'});
  });

  it('returns only client tools when no MCP servers registered', () => {
    const registry = new McpToolRegistry();
    const clientTools = [makeClientTool('a'), makeClientTool('b')];
    expect(registry.getMergedTools(clientTools)).toEqual(clientTools);
  });

  it('skips errored servers', () => {
    const registry = new McpToolRegistry();
    registry.registerServer('bad', [{name: 'x'}]);
    registry.markServerError('bad');
    expect(registry.getMergedTools([])).toEqual([]);
  });

  it('skips MCP tools that collide with client tool names', () => {
    const registry = new McpToolRegistry();
    const collision = buildMcpToolNamespacedName('fs', 'read');
    registry.registerServer('fs', [{name: 'read'}]);

    const merged = registry.getMergedTools([makeClientTool(collision)]);
    expect(merged).toHaveLength(1);
    expect(merged[0].function.name).toBe(collision);
  });

  it('provides empty parameters object when inputSchema missing', () => {
    const registry = new McpToolRegistry();
    registry.registerServer('fs', [{name: 'read'}]);
    const merged = registry.getMergedTools([]);
    expect(merged[0].function.parameters).toEqual({
      type: 'object',
      properties: {},
    });
  });
});
