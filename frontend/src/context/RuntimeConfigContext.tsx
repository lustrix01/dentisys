import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getRuntimeConfigApi, type RuntimeConfigPayload } from '../services/apiClient';

export interface RuntimeConfig {
  status: 'ok';
  environment: string;
  providers: RuntimeConfigPayload['providers'];
  features: RuntimeConfigPayload['features'];
}

const DISABLED_CONFIG: RuntimeConfig = {
  status: 'ok',
  environment: 'unknown',
  providers: {
    identity: { primary: 'password', development_mock_enabled: false },
    email: { active: 'smtp' },
    biometrics: { active: 'disabled' },
    location: { active: 'disabled' },
  },
  features: { browser_attendance_prototype: false },
};

const RuntimeConfigContext = createContext<RuntimeConfig>(DISABLED_CONFIG);

function normalizeRuntimeConfig(payload: RuntimeConfigPayload): RuntimeConfig {
  return {
    status: 'ok',
    environment: typeof payload.environment === 'string' ? payload.environment : 'unknown',
    providers: {
      identity: {
        primary: 'password',
        development_mock_enabled: payload.providers?.identity?.development_mock_enabled === true,
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
    },
  };
}

export function RuntimeConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<RuntimeConfig>(DISABLED_CONFIG);

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
