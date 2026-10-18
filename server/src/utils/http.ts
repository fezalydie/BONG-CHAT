import type { NextFunction, Request, Response } from 'express';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown;

/** Wraps async route handlers so rejections reach the error middleware. */
export function asyncHandler(handler: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json(data);
}

/** Escape SQL LIKE wildcards so user input is matched literally. */
export function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export function likeQuery(value: string): string {
  return `%${likeEscape(value)}%`;
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function bool(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}
