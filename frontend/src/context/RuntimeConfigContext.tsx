import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getRuntimeConfigApi, type RuntimeConfigPayload } from '../services/apiClient';

export interface RuntimeConfig {
  loading: boolean;
  status: 'ok';
  environment: string;
  allowed_email_domains: string[];
  providers: RuntimeConfigPayload['providers'];
  features: RuntimeConfigPayload['features'];
}

const DISABLED_CONFIG: RuntimeConfig = {
  loading: false,
  status: 'ok',
  environment: 'unknown',
  allowed_email_domains: ['bicol-u.edu.ph'],
  providers: {
    identity: {
      password: { enabled: true },
      google: { enabled: false, client_id: null },
      development_mock: { enabled: false },
    },
    email: { active: 'smtp' },
    biometrics: { active: 'disabled' },
    location: { active: 'disabled' },
  },
  features: { browser_attendance_prototype: false, student_auth_enabled: false },
};

const INITIAL_CONFIG: RuntimeConfig = {
  ...DISABLED_CONFIG,
  loading: true,
};

const RuntimeConfigContext = createContext<RuntimeConfig>(INITIAL_CONFIG);

function normalizeRuntimeConfig(payload: RuntimeConfigPayload): RuntimeConfig {
  return {
    loading: false,
    status: 'ok',
    environment: typeof payload.environment === 'string' ? payload.environment : 'unknown',
    allowed_email_domains: Array.isArray(payload.allowed_email_domains)
      ? payload.allowed_email_domains.filter((domain): domain is string => typeof domain === 'string')
      : ['bicol-u.edu.ph'],
    providers: {
      identity: {
        password: { enabled: payload.providers?.identity?.password?.enabled !== false },
        google: {
          enabled: payload.providers?.identity?.google?.enabled === true,
          client_id: typeof payload.providers?.identity?.google?.client_id === 'string'
            ? payload.providers.identity.google.client_id
            : null,
        },
        development_mock: {
          enabled: payload.providers?.identity?.development_mock?.enabled === true,
        },
      },
      email: {
        active: payload.providers?.email?.active === 'mailpit' ? 'mailpit' : 'smtp',
      },
      biometrics: {
        active: payload.providers?.biometrics?.active === 'development-mock' ? 'development-mock' : 'disabled',
      },
      location: {
        active: payload.providers?.location?.active === 'development-mock' ? 'development-mock' : 'disabled',
      },
    },
    features: {
      browser_attendance_prototype: payload.features?.browser_attendance_prototype === true,
      student_auth_enabled: payload.features?.student_auth_enabled === true,
    },
  };
}

export function RuntimeConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<RuntimeConfig>(INITIAL_CONFIG);

  useEffect(() => {
    let active = true;
    getRuntimeConfigApi()
      .then((payload) => {
        if (!active || payload.status !== 'ok') return;
        setConfig(normalizeRuntimeConfig(payload));
      })
      .catch(() => {
        if (active) setConfig(DISABLED_CONFIG);
      });

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(() => config, [config]);
  return <RuntimeConfigContext.Provider value={value}>{children}</RuntimeConfigContext.Provider>;
}

export function useRuntimeConfig(): RuntimeConfig {
  return useContext(RuntimeConfigContext);
}
