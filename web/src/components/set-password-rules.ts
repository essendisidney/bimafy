/** New-password rules (no imports, so they unit-test in Node). */
export const MIN_PASSWORD = 8;

/** Why a new password isn't acceptable yet, or null when it is. */
export function passwordProblem(password: string, confirm: string, temp?: string) {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Mix letters and numbers.";
  if (temp && password === temp) return "Choose a password different from the one you were sent.";
  if (password !== confirm) return "The two passwords don't match.";
  return null;
}
