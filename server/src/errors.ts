export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: unknown) {
    super(message);
  }
}
export const badRequest = (m: string, code?: string, details?: unknown) => new HttpError(400, m, code, details);
export const unauthorized = (m = 'Não autenticado') => new HttpError(401, m, 'unauthorized');
export const forbidden = (m = 'Sem permissão') => new HttpError(403, m, 'forbidden');
export const notFound = (m = 'Não encontrado') => new HttpError(404, m, 'not_found');
export const conflict = (m: string, code?: string) => new HttpError(409, m, code ?? 'conflict');
