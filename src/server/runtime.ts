/**
 * Guards modules that must never be evaluated by browser code.
 *
 * The PayPal integration also imports Node built-ins, so a browser bundle cannot
 * safely include it. Keeping this assertion close to the server boundary makes
 * accidental client imports fail fast during development.
 */
export function assertServerRuntime(moduleName: string): void {
  if (typeof window !== "undefined") {
    throw new Error(`${moduleName} is server-only and cannot run in a browser.`);
  }
}
