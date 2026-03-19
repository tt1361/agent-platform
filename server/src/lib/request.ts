import { HttpError } from './http-error.js';

export function getRequiredParam(value: string | string[] | undefined, name: string) {
  if (typeof value === 'string' && value.length > 0) return value;
  throw new HttpError(400, 'VALIDATION_ERROR', `Missing or invalid route param: ${name}`);
}
