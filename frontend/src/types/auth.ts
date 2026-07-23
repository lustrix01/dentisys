export type UserRole = 'admin' | 'faculty' | 'secretary';

export type AuthPhase =
  | 'bootstrapping'
  | 'unauthenticated'
  | 'submitting_login'
  | 'enrollment_start_required'
  | 'enrollment_confirmation_required'
  | 'mfa_verification_required'
  | 'authenticated';

export interface SafeUser {
  user_id: number;
  login_email: string;
  role: UserRole;
  display_name: string;
  session_uuid: string;
}

export interface LoginResponse {
  type: 'direct_login' | 'mfa_enrollment' | 'mfa_challenge';
  mfa_required: boolean;
  mfa_enrolled: boolean;
  enrollment_token?: string;
  mfa_session_token?: string;
  access_token?: string;
  dev_mfa_code?: string | null;
}

export interface EnrollStartResponse {
  confirmation_token: string;
  provisioning_uri: string;
  base32_secret: string;
  dev_mfa_code?: string | null;
}

export interface EnrollConfirmResponse {
  access_token: string;
  user: { user_id: number };
  recovery_codes: string[];
}

export interface MfaSuccessResponse {
  access_token: string;
  user: { user_id: number };
}
