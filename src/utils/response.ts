// src/utils/response.ts
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
  errors?: string[];
}

export function successResponse<T>(data: T, message = 'Operation successful'): ApiResponse<T> {
  return { success: true, message, data };
}

export function errorResponse<T>(message: string, errors?: string[]): ApiResponse<T> {
  return { success: false, message, data: null, errors };
}
