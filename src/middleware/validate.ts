// src/middleware/validate.ts

import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema, ZodError } from 'zod';

type RequestPart = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, part: RequestPart = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: formatErrors(result.error),
      });
      return;
    }

    if (part === 'query') {
      // Express 5 makes req.query a read-only getter — merge onto the object instead
      Object.assign(req.query, result.data);
    } else {
      (req as unknown as Record<string, unknown>)[part] = result.data;
    }

    next();
  };
}

function formatErrors(error: ZodError): Record<string, string> {
  return error.issues.reduce<Record<string, string>>((acc, issue) => {
    const path = issue.path.join('.') || 'root';
    acc[path] = issue.message;
    return acc;
  }, {});
}
