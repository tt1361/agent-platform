import type { AnyZodObject } from 'zod';
import { ZodError } from 'zod';
import type { NextFunction, Request, Response } from 'express';
import { HttpError } from './http-error.js';

export function validateBody(schema: AnyZodObject) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(new HttpError(400, 'VALIDATION_ERROR', 'Invalid request body', error.flatten()));
        return;
      }
      next(error);
    }
  };
}
