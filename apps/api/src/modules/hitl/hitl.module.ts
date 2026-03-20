import { Module } from '@nestjs/common';
import { HitlController } from './hitl.controller.js';
import { HitlService } from './hitl.service.js';

@Module({
  controllers: [HitlController],
  providers: [HitlService],
  exports: [HitlService],
})
export class HitlModule {}
