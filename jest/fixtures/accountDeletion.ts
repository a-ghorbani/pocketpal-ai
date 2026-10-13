export const ACCOUNT_DELETE_ROUTE = '/api/mobile/account/delete';

export const verbatim = {
  deleted: '{"status":"deleted"}',
  alreadyDeleted: '{"status":"already_deleted"}',
  unauthenticated: '{"error":"unauthenticated"}',
  creatorContactSupport:
    '{"error":"creator_contact_support","contact":"info@palshub.ai"}',
  paymentInProgress: '{"error":"payment_in_progress"}',
};

export const statusOnly = {
  invalidRequest: 400,
  rateLimited: 429,
  internalError: 500,
};

export const deleteResponse = (status: number, rawBody: string | null) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => {
    if (rawBody === null) {
      throw new SyntaxError('Unexpected end of JSON input');
    }
    return JSON.parse(rawBody);
  },
});
