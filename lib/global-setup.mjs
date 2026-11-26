import { startInstance } from './instance.mjs';

/** Starts a fresh instance for the run; the returned function is Playwright's teardown. */
export default async function globalSetup() {
  const instance = await startInstance();
  return () => instance.stop();
}
