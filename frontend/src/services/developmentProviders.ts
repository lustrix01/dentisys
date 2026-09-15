import type { SafeUser } from '../types/auth';

export const DEVELOPMENT_MOCK_STUDENT: SafeUser = {
  user_id: 99,
  login_email: 'student@bicol-u.edu.ph',
  role: 'student',
  display_name: 'Development Mock Student',
  session_uuid: 'development-mock-student-session',
};

export interface DevelopmentBiometricOutcome {
  provider: 'development-mock';
  outcome: 'enrolled' | 'matched' | 'not-matched' | 'error';
}

export interface DevelopmentLocationOutcome {
  provider: 'development-mock';
  fixture: 'inside' | 'outside' | 'unavailable' | 'denied';
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
}

export const DEVELOPMENT_LOCATION_FIXTURES: Record<'inside' | 'outside', DevelopmentLocationOutcome> = {
  inside: {
    provider: 'development-mock',
    fixture: 'inside',
    latitude: 13.1436,
    longitude: 123.7438,
    accuracyMeters: 5,
  },
  outside: {
    provider: 'development-mock',
    fixture: 'outside',
    latitude: 13.1536,
    longitude: 123.7438,
    accuracyMeters: 5,
  },
};

export function developmentBiometricOutcome(outcome: DevelopmentBiometricOutcome['outcome']): DevelopmentBiometricOutcome {
  return { provider: 'development-mock', outcome };
}
