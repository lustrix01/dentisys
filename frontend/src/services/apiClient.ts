import type {
  LoginResponse,
  EnrollStartResponse,
  EnrollConfirmResponse,
  MfaSuccessResponse,
  SafeUser,
} from '../types/auth';

const configuredBase = import.meta.env.VITE_API_BASE_URL?.trim();
const API_BASE_URL = configuredBase
  ? configuredBase.replace(/\/+$/, '')
  : '/api';

let accessToken: string | null = null;

export function setAccessToken(token: string): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = null;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const KNOWN_MESSAGES: Record<number, Record<string, string>> = {
  400: {
    'Validation failed.': 'Please check your input and try again.',
    'Verification code required.': 'Please enter a verification code.',
    'Invalid verification code.': 'Invalid verification code. Please try again.',
    'Recovery code required.': 'Please enter a recovery code.',
  },
  401: {
    'Invalid credentials.': 'Invalid email or password.',
    'Invalid enrollment stage.': 'Enrollment session expired. Please log in again.',
    'Authentication required.': 'Your session has expired. Please log in again.',
  },
  429: {
    'Too many requests.': 'Too many attempts. Please wait and try again.',
  },
};

function mapError(status: number, backendMessage: string): string {
  const statusMap = KNOWN_MESSAGES[status];
  if (statusMap && statusMap[backendMessage]) {
    return statusMap[backendMessage];
  }
  if (status === 403) {
    return backendMessage;
  }
  if (status === 400) return 'Please check your input and try again.';
  if (status === 401) return 'Authentication failed. Please log in again.';
  if (status === 403) return 'Access denied. Contact the administrator.';
  if (status === 429) return 'Too many attempts. Please wait and try again.';
  if (status >= 500) return 'A server error occurred. Please try again later.';
  return 'An unexpected error occurred. Please try again.';
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  tokenOverride?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    accept: 'application/json',
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const token = tokenOverride ?? accessToken;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Unable to connect to the server. Check your connection.');
  }

  let responseData: unknown;
  try {
    responseData = await response.json();
  } catch {
    throw new ApiError(response.status, mapError(response.status, ''));
  }

  if (!response.ok) {
    const backendMessage =
      responseData && typeof responseData === 'object' && 'message' in responseData
        ? String((responseData as Record<string, unknown>).message)
        : '';
    throw new ApiError(response.status, mapError(response.status, backendMessage));
  }

  return responseData as T;
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('POST', '/auth/login', { email, password });
}

export function startEnrollment(enrollmentToken: string): Promise<EnrollStartResponse> {
  return request<EnrollStartResponse>('POST', '/auth/mfa/enroll/start', undefined, enrollmentToken);
}

export function confirmEnrollment(confirmationToken: string, code: string): Promise<EnrollConfirmResponse> {
  return request<EnrollConfirmResponse>('POST', '/auth/mfa/enroll/confirm', { code }, confirmationToken);
}

export function verifyMfa(mfaSessionToken: string, code: string): Promise<MfaSuccessResponse> {
  return request<MfaSuccessResponse>('POST', '/auth/mfa/verify', { code }, mfaSessionToken);
}

export function recoverMfa(mfaSessionToken: string, code: string): Promise<MfaSuccessResponse> {
  return request<MfaSuccessResponse>('POST', '/auth/mfa/recover', { code }, mfaSessionToken);
}

export function getMe(): Promise<SafeUser> {
  return request<SafeUser>('GET', '/auth/me');
}

export interface HealthPayload {
  status: string;
  app: string;
  php: string;
  database: string;
  timestamp: string;
}

export function healthCheck(): Promise<HealthPayload> {
  return request<HealthPayload>('GET', '/health');
}
