/**
 * PalsHub test-support API client (e2e only).
 *
 * Drives the server-side e2e helpers from the test host so the purchase flow
 * can run repeatedly from a clean state. These endpoints are test-mode only,
 * guarded by a shared key, and idempotent — safe to call on every run.
 *
 * Required env (set in e2e/.env or the CI env). Names match the palshub
 * test-harness contract:
 *   E2E_PALSHUB_BASE_URL - test server base, e.g. http://192.168.0.92:3010
 *   E2E_API_KEY          - shared secret sent as the X-E2E-Key header
 *   E2E_BUYER_EMAIL      - test buyer email (local part must contain "e2e")
 *   E2E_BUYER_PASSWORD   - test buyer password
 *   E2E_PALSHUB_PAL_ID   - premium fixture pal id (defaults to the seeded pal)
 */

export const palshubTestConfig = {
  baseUrl: process.env.E2E_PALSHUB_BASE_URL || 'http://192.168.0.92:3010',
  testKey: process.env.E2E_API_KEY || '',
  email: process.env.E2E_BUYER_EMAIL || '',
  password: process.env.E2E_BUYER_PASSWORD || '',
  palId:
    process.env.E2E_PALSHUB_PAL_ID ||
    // The seeded PREMIUM fixture pal ("Immeria Driver"); the purchase flow
    // needs a premium pal (Buy → checkout → Download flip). The free
    // dev-fixture pals (f0c0ffee-de40-…) have no Buy button.
    'deadbeef-0000-4000-8000-000000000099',
};

const ENSURE_USER_PATH = '/api/test/e2e/users/ensure';
const RESET_OWNERSHIP_PATH = '/api/test/e2e/purchases/reset';

async function post(path: string, body: Record<string, unknown>): Promise<void> {
  if (!palshubTestConfig.testKey) {
    throw new Error(
      'E2E_API_KEY is not set — cannot call PalsHub test endpoints',
    );
  }

  const url = `${palshubTestConfig.baseUrl}${path}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-E2E-Key': palshubTestConfig.testKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `PalsHub test API ${path} failed: ${response.status} ${response.statusText} ${text}`,
    );
  }
}

/**
 * Ensure the test buyer exists in the test Supabase project. Idempotent:
 * a no-op when the user already exists.
 */
export async function ensureTestUser(
  email: string = palshubTestConfig.email,
  password: string = palshubTestConfig.password,
): Promise<void> {
  await post(ENSURE_USER_PATH, {email, password});
}

/**
 * Void the test buyer's purchase + entitlement of the given pal so it reads
 * is_owned=false and the Buy button renders. Call in beforeEach: without it
 * a prior run's purchase keeps the Buy button hidden. Idempotent.
 */
export async function resetPalOwnership(
  palId: string = palshubTestConfig.palId,
  userEmail: string = palshubTestConfig.email,
): Promise<void> {
  await post(RESET_OWNERSHIP_PATH, {pal_id: palId, user_email: userEmail});
}

/**
 * Convenience: bring the account to a known clean pre-purchase state.
 */
export async function resetCheckoutScene(): Promise<void> {
  await ensureTestUser();
  await resetPalOwnership();
}
