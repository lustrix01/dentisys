export type UserRole = 'admin' | 'faculty' | 'secretary';

export type AuthPhase =
  | 'bootstrapping'
  | 'unauthenticated'
  | 'submitting_login'
  | 'mfa_method_selection_required'
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
  type: 'direct_login' | 'mfa_method_selection';
  mfa_required: boolean;
  mfa_enrolled: boolean;
  mfa_selection_token?: string;
  methods?: Array<'email' | 'authenticator'>;
  access_token?: string;
}

export interface EnrollStartResponse {
  confirmation_token: string;
  provisioning_uri: string;
  qr_code_data_uri: string;
  base32_secret: string;
}

export interface EnrollConfirmResponse {
  status: string;
  recovery_codes: string[];
}

export interface MfaSuccessResponse {
  access_token: string;
  user: { user_id: number };
}
