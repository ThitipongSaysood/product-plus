/** Thrown anywhere; the global filter turns it into `{ error: key }` with `status`. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly key: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(key);
  }
}

export const notFound = (key = "errors.notFound") => new AppError(404, key);
