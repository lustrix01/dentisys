export type UserRole = 'superadmin' | 'admin' | 'faculty' | 'secretary' | 'student';

export type AuthPhase =
  | 'bootstrapping'
  | 'unauthenticated'
  | 'submitting_login'
  | 'two_factor_verification_required'
  | 'authenticated';

export interface SafeUser {
  user_id: number;
  login_email: string;
  role: UserRole;
  display_name: string;
  session_uuid: string;
  authentication_source: 'password' | 'google' | 'development_mock';
  /** "Remember me" was ticked at sign-in (9.26): this session has no 30-minute idle sign-out. */
  remembered?: boolean;
  /** Saved appearance preference for this account. */
  theme?: 'light' | 'dark';
  student?: {
    student_id: number;
    student_number: string;
    status: string;
  };
}

export interface LoginResponse {
  type: 'direct_login' | 'two_factor_required' | 'two_factor_setup_required' | 'account_link_required' | 'google_linked';
  two_factor_required: boolean;
  two_factor_enrolled: boolean;
  two_factor_challenge_token?: string;
  two_factor_setup_token?: string;
  expires_in?: number;
  access_token?: string;
  account_link_required?: boolean;
  email?: string;
  link_challenge_token?: string;
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
  access_token?: string;
}

export interface MfaSuccessResponse {
  access_token: string;
  user: { user_id: number };
}
