export type McpTransportType = 'stdio' | 'http' | 'sse';
export type McpCapabilityType = 'tool' | 'resource' | 'prompt';

export interface McpCapability {
  id: string;
  type: McpCapabilityType;
  name: string;
  description?: string;
  schema?: Record<string, unknown>;
}

export interface McpServerRecord {
  id: string;
  name: string;
  code: string;
  transportType: McpTransportType;
  endpoint: string;
  authType?: string;
  status: 'active' | 'inactive' | 'error';
  metadata?: Record<string, unknown>;
  capabilities: McpCapability[];
  createdAt: string;
  updatedAt: string;
}
