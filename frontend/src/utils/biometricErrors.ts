export function isTransportOrBiometricUnavailable(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    if (obj.status === 0 || obj.status === 503) return true;
    if (obj.code === 'biometric_service_unavailable') return true;
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (
      msg.includes('unable to connect') ||
      msg.includes('network') ||
      msg.includes('connection') ||
      msg.includes('temporarily unavailable') ||
      msg.includes('service unavailable') ||
      msg.includes('timeout')
    ) {
      return true;
    }
  }
  return false;
}

export const UPLOAD_TIMEOUT_MESSAGE_PREFIX = 'The upload is taking too long on this connection. Move to a stronger signal, then ';

export function isRequestTimeout(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: unknown }).code === 'request_timeout';
}

export function enrollmentFailureMessage(err: unknown): string {
  const code = err && typeof err === 'object' ? (err as { code?: unknown }).code : undefined;
  if (code === 'liveness_failed') {
    return 'The requested action was not captured clearly. Keep your face inside the guide while you do it, then start a fresh capture.';
  }
  const msg = err instanceof Error && err.message ? err.message : 'Facial enrollment failed.';
  if (code === 'quality_failed') {
    return `${msg} Adjust lighting, face the camera directly, and start a fresh capture, or contact your Faculty/Secretary for manual attendance.`;
  }
  return `${msg} Start a fresh capture. If this continues, use manual attendance through your Secretary or Faculty.`;
}
