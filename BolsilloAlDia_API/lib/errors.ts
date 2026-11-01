export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "INVALID_CREDENTIALS"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "EMAIL_IN_USE"
  | "INVALID_REFERENCE"
  | "RATE_LIMITED"
  | "CONFIG_ERROR"
  | "INTERNAL_ERROR";

/** Error de negocio con status HTTP y código estable que la app móvil puede interpretar. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
