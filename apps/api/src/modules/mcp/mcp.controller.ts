import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { McpService } from './mcp.service.js';
import type { McpTransportType } from './mcp.types.js';

@Controller('mcp/servers')
export class McpController {
  constructor(private readonly mcpService: McpService) {
    this.listServers = this.listServers.bind(this);
    this.getServer = this.getServer.bind(this);
    this.registerServer = this.registerServer.bind(this);
    this.discover = this.discover.bind(this);
    this.remove = this.remove.bind(this);
  }

  @Get()
  listServers() {
    return this.mcpService.listServers();
  }

  @Get(':id')
  getServer(@Param('id') id: string) {
    return this.mcpService.getServer(id);
  }

  @Post()
  registerServer(
    @Body()
    body: {
      name: string;
      code: string;
      transportType: McpTransportType;
      endpoint: string;
      authType?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.mcpService.registerServer(body);
  }

  @Post(':id/discover')
  discover(@Param('id') id: string) {
    return this.mcpService.discoverCapabilities(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.mcpService.removeServer(id);
  }
}
