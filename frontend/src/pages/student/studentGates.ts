import type { RuntimeConfig } from '../../context/RuntimeConfigContext';
import type { SafeUser } from '../../types/auth';

/**
 * A Student may use the browser-backed prototype only when both the server
 * session provenance and the current runtime configuration agree that it is a
 * development/test identity. Runtime configuration is intentionally part of
 * the predicate so a stale `/me` response cannot unlock prototype surfaces.
 */
export function isDevelopmentMockStudent(
  user: Pick<SafeUser, 'role' | 'authentication_source'> | null,
  config: RuntimeConfig,
): boolean {
  return user?.role === 'student'
    && user.authentication_source === 'development_mock'
    && (config.environment === 'development' || config.environment === 'test')
    && config.features.student_auth_enabled
    && config.providers.identity.development_mock.enabled;
}

export type StudentPrototypeSurface =
  | 'academic'
  | 'attendance_logs'
  | 'face'
  | 'attendance'
  | 'dashboard';

export function isStudentPrototypeSurfaceEnabled(
  config: RuntimeConfig,
  surface: StudentPrototypeSurface,
): boolean {
  const browserAttendance = config.features.browser_attendance_prototype;
  const biometrics = config.providers.biometrics.active === 'development-mock';
  const location = config.providers.location.active === 'development-mock';

  switch (surface) {
    case 'academic':
      return true;
    case 'attendance_logs':
      return browserAttendance;
    case 'face':
      return biometrics;
    case 'attendance':
    case 'dashboard':
      return browserAttendance && biometrics && location;
    default:
      return false;
  }
}

export function isStudentPrototypeAllowed(
  user: Pick<SafeUser, 'role' | 'authentication_source'> | null,
  config: RuntimeConfig,
  surface: StudentPrototypeSurface,
): boolean {
  return isDevelopmentMockStudent(user, config)
    && isStudentPrototypeSurfaceEnabled(config, surface);
}

/**
 * Check if the user is an authenticated real Student (via password or Google).
 */
export function isRealStudent(
  user: Pick<SafeUser, 'role' | 'authentication_source'> | null,
): boolean {
  return user?.role === 'student'
    && (user.authentication_source === 'password' || user.authentication_source === 'google');
}

/**
 * Check if the user is a Secretary with a linked Student identity per BIO-010.
 */
export function isSecretaryWithStudentContext(
  user: Pick<SafeUser, 'role' | 'student'> | null,
): boolean {
  return user?.role === 'secretary' && Boolean(user?.student);
}

/**
 * Check if the user is authorized to access authoritative Student biometric self-service
 * (either a real Student, or a Secretary for their own linked Student profile).
 */
export function canAccessAuthoritativeStudentBiometrics(
  user: Pick<SafeUser, 'role' | 'authentication_source' | 'student'> | null,
): boolean {
  return isRealStudent(user) || isSecretaryWithStudentContext(user);
}
