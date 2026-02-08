import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../../utils/errors';

type ValidationTarget = 'body' | 'query' | 'params';

/**
 * Middleware factory for validating request data with Zod schemas
 */
export const validate = (
  schema: ZodSchema,
  target: ValidationTarget = 'body'
) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const data = req[target];
      const validated = schema.parse(data);
      
      // Replace with validated data (includes transformations and defaults)
      req[target] = validated;
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors: Record<string, string[]> = {};
        
        error.errors.forEach((e) => {
          const path = e.path.join('.') || 'value';
          if (!errors[path]) {
            errors[path] = [];
          }
          errors[path].push(e.message);
        });

        next(new ValidationError('Validation failed', errors));
      } else {
        next(error);
      }
    }
  };
};

/**
 * Validate multiple targets at once
 */
export const validateMultiple = (schemas: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const allErrors: Record<string, string[]> = {};

      if (schemas.body) {
        try {
          req.body = schemas.body.parse(req.body);
        } catch (error) {
          if (error instanceof ZodError) {
            error.errors.forEach((e) => {
              const path = `body.${e.path.join('.')}`;
              if (!allErrors[path]) {
                allErrors[path] = [];
              }
              allErrors[path].push(e.message);
            });
          }
        }
      }

      if (schemas.query) {
        try {
          req.query = schemas.query.parse(req.query);
        } catch (error) {
          if (error instanceof ZodError) {
            error.errors.forEach((e) => {
              const path = `query.${e.path.join('.')}`;
              if (!allErrors[path]) {
                allErrors[path] = [];
              }
              allErrors[path].push(e.message);
            });
          }
        }
      }

      if (schemas.params) {
        try {
          req.params = schemas.params.parse(req.params);
        } catch (error) {
          if (error instanceof ZodError) {
            error.errors.forEach((e) => {
              const path = `params.${e.path.join('.')}`;
              if (!allErrors[path]) {
                allErrors[path] = [];
              }
              allErrors[path].push(e.message);
            });
          }
        }
      }

      if (Object.keys(allErrors).length > 0) {
        throw new ValidationError('Validation failed', allErrors);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
