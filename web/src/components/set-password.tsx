"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Logo } from "./logo";
import { Button, Field, inputClass } from "./ui";
import { MIN_PASSWORD, passwordProblem } from "./set-password-rules";

/**
 * First sign-in with a one-time password from an admin: the agent picks their
 * own before anything else, so the shared password stops working.
 */
export function SetPasswordScreen() {
  const { user, setNewPassword, logout } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = passwordProblem(password, confirm);

  return (
    <main className="grid min-h-dvh place-items-center atmosphere px-4 py-10">
      <form
        className="w-full max-w-sm rounded-3xl border border-line bg-surface p-6 shadow-soft"
        onSubmit={async (e) => {
          e.preventDefault();
          if (problem) {
            setError(problem);
            return;
          }
          setBusy(true);
          setError(null);
          try {
            await setNewPassword(password);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save your password. Try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Logo className="text-3xl" markClassName="h-10 w-10" />
        <h1 className="mt-6 font-display text-3xl text-heading">Karibu{user ? `, ${user.name.split(" ")[0]}` : ""}!</h1>
        <p className="mt-2 text-sm text-mute">
          You signed in with a one-time password. Choose your own to finish setting up your account.
        </p>
        <p className="mt-1 text-sm text-mute" lang="sw">
          Chagua nenosiri lako jipya ili kuendelea.
        </p>
        <div className="mt-6 space-y-4">
          <Field label="New password">
            <input
              className={inputClass}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Type it again">
            <input
              className={inputClass}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          <p className="text-xs text-mute">At least {MIN_PASSWORD} characters, with letters and numbers.</p>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Saving…" : "Save and continue"}
          </Button>
          <button type="button" onClick={() => void logout()} className="w-full text-center text-sm text-mute hover:text-ink">
            Sign out
          </button>
        </div>
      </form>
    </main>
  );
}
