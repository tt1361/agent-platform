import { Controller, Get, Param } from '@nestjs/common';
import { TraceService } from './trace.service.js';

@Controller('traces')
export class TraceController {
  constructor(private readonly traceService: TraceService) {
    this.getTrace = this.getTrace.bind(this);
  }

  @Get(':traceId')
  async getTrace(@Param('traceId') traceId: string) {
    return this.traceService.getTraceDetails(traceId);
  }
}
