import { z } from 'zod';
import { ErrorResponse } from '@langplot/shared';
export class ClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T extends z.ZodTypeAny>(
  path: string,
  schema: T,
  init: RequestInit = {},
): Promise<z.output<T>> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ClientError(
      'NETWORK_ERROR',
      'Нет связи с сервером. Проверьте подключение к интернету и попробуйте ещё раз.',
      0,
    );
  }
  const raw: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = ErrorResponse.safeParse(raw);
    throw new ClientError(
      error.success ? error.data.error.code : 'SERVER_ERROR',
      error.success ? error.data.error.message : 'Сервер временно недоступен. Попробуйте ещё раз.',
      response.status,
    );
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    throw new ClientError(
      'INVALID_RESPONSE',
      'Сервер вернул неподдерживаемый ответ.',
      response.status,
    );
  return parsed.data;
}
export const body = (data: unknown) => JSON.stringify(data);
export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Что-то пошло не так.';
