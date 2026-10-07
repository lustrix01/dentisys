import React, { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { PersonNameFields, composePersonName, type PersonNameParts } from './PersonNameFields';

export interface NameChangeResponse {
  name: string;
  prefix?: string | null;
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  suffix?: string | null;
}

interface ChangeNameDialogProps {
  currentParts: PersonNameParts;
  authenticatorEnabled: boolean;
  onSave: (parts: PersonNameParts, code?: string) => Promise<NameChangeResponse>;
  onSuccess: (response: NameChangeResponse) => void | Promise<void>;
}

export function ChangeNameDialog({
  currentParts,
  authenticatorEnabled,
  onSave,
  onSuccess,
}: ChangeNameDialogProps) {
  const [open, setOpen] = useState(false);
  const [parts, setParts] = useState(currentParts);
  const [code, setCode] = useState('');
  const [requiresCode, setRequiresCode] = useState(authenticatorEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const unchanged = composePersonName(parts) === composePersonName(currentParts);

  useEffect(() => {
    if (open) {
      setParts({
        prefix: currentParts.prefix,
        firstName: currentParts.firstName,
        middleName: currentParts.middleName,
        lastName: currentParts.lastName,
        suffix: currentParts.suffix,
      });
      setCode('');
      setRequiresCode(authenticatorEnabled);
      setError('');
    }
  }, [
    open,
    authenticatorEnabled,
    currentParts.prefix,
    currentParts.firstName,
    currentParts.middleName,
    currentParts.lastName,
    currentParts.suffix,
  ]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (unchanged || saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await onSave(parts, code || undefined);
      await onSuccess(response);
      setOpen(false);
    } catch (requestError) {
      const apiError = requestError as { code?: string; message?: string };
      if (apiError?.code === 'TWO_FACTOR_REQUIRED') setRequiresCode(true);
      setError(apiError?.message || 'Unable to change your name.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        Change Name
      </button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Change Name" size="lg">
        <form onSubmit={submit} className="space-y-5">
          <p className="text-sm text-slate-500 dark:text-slate-400">Update the name shown on your account.</p>
          <PersonNameFields value={parts} onChange={setParts} />
          {(authenticatorEnabled || requiresCode) && (
            <label className="block max-w-xs text-xs font-bold text-slate-600 dark:text-slate-300">
              Authenticator code
              <input
                aria-label="Authenticator code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 font-mono tracking-widest text-slate-800 outline-none focus:ring-2 focus:ring-clinical-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                placeholder="000000"
              />
            </label>
          )}
          {error && <div role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs font-semibold text-rose-700 dark:text-rose-400">{error}</div>}
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end dark:border-slate-800">
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">Cancel</button>
            <button type="submit" disabled={unchanged || saving} className="rounded-xl bg-clinical-600 px-5 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? 'Saving…' : 'Save name'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
