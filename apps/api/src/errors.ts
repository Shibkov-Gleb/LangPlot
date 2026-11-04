import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Проверьте заполненные поля.',
        details: error.issues.map((x) => `${x.path.join('.')}: ${x.message}`),
      },
    });
    return;
  }
  if (error?.type === 'entity.too.large') {
    res
      .status(413)
      .json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Размер пакета превышает 1 МБ.' } });
    return;
  }
  if (error instanceof SyntaxError && 'body' in error) {
    res
      .status(400)
      .json({ error: { code: 'INVALID_JSON', message: 'Не удалось прочитать JSON.' } });
    return;
  }
  console.error('[api]', error instanceof Error ? error.message : 'Unknown error');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Не удалось выполнить запрос. Попробуйте ещё раз.',
    },
  });
};
