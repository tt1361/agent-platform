import { Controller, Get, Post, Delete, Param, Body, Patch, UploadedFile, UseInterceptors, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { readFile } from 'node:fs/promises';
import { KnowledgeService } from './knowledge.service.js';
import { KnowledgeRetrievalService } from './knowledge.retrieval.service.js';

@Controller('knowledge')
export class KnowledgeController {
  constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly retrievalService: KnowledgeRetrievalService,
  ) {
    this.listBases = this.listBases.bind(this);
    this.createBase = this.createBase.bind(this);
    this.updateBase = this.updateBase.bind(this);
    this.deleteBase = this.deleteBase.bind(this);
    this.listBaseDocuments = this.listBaseDocuments.bind(this);
    this.createManualDocument = this.createManualDocument.bind(this);
    this.createUrlDocument = this.createUrlDocument.bind(this);
    this.uploadDocument = this.uploadDocument.bind(this);
    this.getDocument = this.getDocument.bind(this);
    this.getDownloadInfo = this.getDownloadInfo.bind(this);
    this.downloadFile = this.downloadFile.bind(this);
    this.retrieve = this.retrieve.bind(this);
    this.list = this.list.bind(this);
    this.create = this.create.bind(this);
    this.remove = this.remove.bind(this);
    this.listDocuments = this.listDocuments.bind(this);
    this.removeDocument = this.removeDocument.bind(this);
  }

  @Get('bases')
  async listBases() {
    return this.knowledgeService.list();
  }

  @Post('bases')
  async createBase(@Body() body: { name: string; description?: string }) {
    return this.knowledgeService.create(body);
  }

  @Patch('bases/:id')
  async updateBase(@Param('id') id: string, @Body() body: any) {
    return this.knowledgeService.update(id, body);
  }

  @Delete('bases/:id')
  async deleteBase(@Param('id') id: string) {
    return this.knowledgeService.remove(id);
  }

  @Get('bases/:id/documents')
  async listBaseDocuments(@Param('id') id: string) {
    return this.knowledgeService.listDocuments(id);
  }

  @Post('bases/:id/documents/manual')
  async createManualDocument(@Param('id') id: string, @Body() body: { title: string; content: string }) {
    return this.knowledgeService.createManualDocument(id, body);
  }

  @Post('bases/:id/documents/url')
  async createUrlDocument(@Param('id') id: string, @Body() body: { url: string; title?: string }) {
    return this.knowledgeService.createUrlDocument(id, body);
  }

  @Post('bases/:id/documents/upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadDocument(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.knowledgeService.createUploadedDocument(id, file);
  }

  @Get('documents/:id')
  async getDocument(@Param('id') id: string) {
    return this.knowledgeService.getDocumentById(id);
  }

  @Get('documents/:id/download')
  async getDownloadInfo(@Param('id') id: string) {
    return this.knowledgeService.getDownloadPath(id);
  }

  @Get('documents/:id/file')
  async downloadFile(@Param('id') id: string, @Res() res: Response) {
    const doc: any = await this.knowledgeService.getDocumentById(id);
    if (!doc.filePath) {
      return res.status(404).json({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'No file for document' } });
    }
    const buf = await readFile(doc.filePath);
    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.fileName || doc.title || 'document')}"`);
    res.send(buf);
  }

  @Post('retrieve')
  async retrieve(@Body() body: { query: string; limit?: number }) {
    return this.retrievalService.retrieve(body.query, body.limit);
  }

  @Get()
  async list() {
    return this.knowledgeService.list();
  }

  @Post()
  async create(@Body() body: { name: string; description?: string }) {
    return this.knowledgeService.create(body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.knowledgeService.remove(id);
  }

  @Get(':id/documents')
  async listDocuments(@Param('id') id: string) {
    return this.knowledgeService.listDocuments(id);
  }

  @Delete('documents/:id')
  async removeDocument(@Param('id') id: string) {
    return this.knowledgeService.removeDocument(id);
  }
}
