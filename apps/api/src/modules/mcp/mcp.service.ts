import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { McpCapability, McpServerRecord, McpTransportType } from './mcp.types.js';

@Injectable()
export class McpService {
  private readonly servers = new Map<string, McpServerRecord>();

  constructor() {
    const demoId = randomUUID();
    this.servers.set(demoId, {
      id: demoId,
      name: 'Demo MCP Server',
      code: 'demo-mcp',
      transportType: 'http',
      endpoint: 'http://127.0.0.1:8800/mcp',
      authType: 'none',
      status: 'inactive',
      metadata: { source: 'bootstrap' },
      capabilities: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  listServers() {
    return [...this.servers.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getServer(id: string) {
    const item = this.servers.get(id);
    if (!item) throw new NotFoundException('MCP server not found');
    return item;
  }

  registerServer(input: {
    name: string;
    code: string;
    transportType: McpTransportType;
    endpoint: string;
    authType?: string;
    metadata?: Record<string, unknown>;
  }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const record: McpServerRecord = {
      id,
      name: input.name,
      code: input.code,
      transportType: input.transportType,
      endpoint: input.endpoint,
      authType: input.authType,
      status: 'inactive',
      metadata: input.metadata,
      capabilities: [],
      createdAt: now,
      updatedAt: now,
    };
    this.servers.set(id, record);
    return record;
  }

  removeServer(id: string) {
    const existing = this.getServer(id);
    this.servers.delete(id);
    return existing;
  }

  async discoverCapabilities(id: string) {
    const server = this.getServer(id);

    const capabilities: McpCapability[] = [
      {
        id: `${id}-tool-1`,
        type: 'tool',
        name: 'demo.search',
        description: 'Demo discovered MCP tool',
        schema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
          required: ['query'],
        },
      },
      {
        id: `${id}-resource-1`,
        type: 'resource',
        name: 'demo://handbook',
        description: 'Demo MCP resource',
      },
    ];

    const updated: McpServerRecord = {
      ...server,
      status: 'active',
      capabilities,
      updatedAt: new Date().toISOString(),
    };
    this.servers.set(id, updated);
    return updated;
  }
}
