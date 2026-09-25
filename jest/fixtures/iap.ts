export const apiPal = (overrides: Record<string, unknown> = {}) => ({
  id: 'pal-1',
  title: 'Story Pal',
  description: 'Tells stories',
  thumbnail_url: 'https://example.com/pal-1.png',
  price_cents: 499,
  is_free: false,
  categories: [],
  tags: [],
  stats: {rating: null, review_count: 0},
  is_owned: false,
  created_at: '2026-01-01T00:00:00Z',
  protection_level: 'reveal_on_purchase',
  store_product_id: 'pal.0123456789abcdef0123456789abcdef',
  iap_enabled: {ios: true, android: true},
  content_version: 3,
  system_prompt: 'You tell stories.',
  ...overrides,
});

export const verifyResponse = (
  results: Array<Record<string, unknown>> = [
    {
      pal_id: 'pal-1',
      status: 'active',
      content_version: 3,
      pal: apiPal(),
      support_code: 'SUP-1',
    },
  ],
) => ({results});

export const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
