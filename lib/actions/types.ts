// Standardized return type for all Server Actions
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };
