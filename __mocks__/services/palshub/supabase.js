// Mock for src/services/palshub/supabase.ts
// This mock avoids the @env import issue by providing a complete mock implementation

// Create a chainable query builder mock
const createQueryBuilder = () => {
  const queryBuilder = {
    select: jest.fn().mockReturnValue(queryBuilder),
    insert: jest.fn().mockResolvedValue({data: null, error: null}),
    update: jest.fn().mockResolvedValue({data: null, error: null}),
    delete: jest.fn().mockResolvedValue({data: null, error: null}),
    eq: jest.fn().mockReturnValue(queryBuilder),
    neq: jest.fn().mockReturnValue(queryBuilder),
    gt: jest.fn().mockReturnValue(queryBuilder),
    gte: jest.fn().mockReturnValue(queryBuilder),
    lt: jest.fn().mockReturnValue(queryBuilder),
    lte: jest.fn().mockReturnValue(queryBuilder),
    like: jest.fn().mockReturnValue(queryBuilder),
    ilike: jest.fn().mockReturnValue(queryBuilder),
    is: jest.fn().mockReturnValue(queryBuilder),
    in: jest.fn().mockReturnValue(queryBuilder),
    contains: jest.fn().mockReturnValue(queryBuilder),
    containedBy: jest.fn().mockReturnValue(queryBuilder),
    rangeGt: jest.fn().mockReturnValue(queryBuilder),
    rangeGte: jest.fn().mockReturnValue(queryBuilder),
    rangeLt: jest.fn().mockReturnValue(queryBuilder),
    rangeLte: jest.fn().mockReturnValue(queryBuilder),
    rangeAdjacent: jest.fn().mockReturnValue(queryBuilder),
    overlaps: jest.fn().mockReturnValue(queryBuilder),
    textSearch: jest.fn().mockReturnValue(queryBuilder),
    match: jest.fn().mockReturnValue(queryBuilder),
    not: jest.fn().mockReturnValue(queryBuilder),
    or: jest.fn().mockReturnValue(queryBuilder),
    filter: jest.fn().mockReturnValue(queryBuilder),
    order: jest.fn().mockReturnValue(queryBuilder),
    limit: jest.fn().mockReturnValue(queryBuilder),
    range: jest.fn().mockReturnValue(queryBuilder),
    abortSignal: jest.fn().mockReturnValue(queryBuilder),
    single: jest.fn().mockResolvedValue({data: null, error: null}),
    maybeSingle: jest.fn().mockResolvedValue({data: null, error: null}),
    csv: jest.fn().mockReturnValue(queryBuilder),
    geojson: jest.fn().mockReturnValue(queryBuilder),
    explain: jest.fn().mockReturnValue(queryBuilder),
    rollback: jest.fn().mockReturnValue(queryBuilder),
    returns: jest.fn().mockReturnValue(queryBuilder),
    // Add execution methods that return promises
    then: jest.fn().mockImplementation(resolve => {
      return Promise.resolve({data: [], error: null}).then(resolve);
    }),
    catch: jest.fn().mockImplementation(reject => {
      return Promise.resolve({data: [], error: null}).catch(reject);
    }),
    finally: jest.fn().mockImplementation(fn => {
      return Promise.resolve({data: [], error: null}).finally(fn);
    }),
  };

  return queryBuilder;
};

const mockSupabaseClient = {
  auth: {
    getSession: jest.fn().mockResolvedValue({
      data: {session: null},
      error: null,
    }),
    getUser: jest.fn().mockResolvedValue({
      data: {user: null},
      error: null,
    }),
    signInWithIdToken: jest.fn().mockResolvedValue({
      data: {user: null, session: null},
      error: null,
    }),
    signOut: jest.fn().mockResolvedValue({
      error: null,
    }),
    onAuthStateChange: jest.fn().mockReturnValue({
      data: {subscription: {unsubscribe: jest.fn()}},
    }),
  },
  from: jest.fn().mockImplementation(() => createQueryBuilder()),
};

// Export the mock client
export const supabase = mockSupabaseClient;

// Export helper functions
export const getAuthHeaders = jest.fn().mockResolvedValue({});

export const isAuthenticated = jest.fn().mockResolvedValue(false);

export const getCurrentUser = jest.fn().mockResolvedValue(null);

// Default export for CommonJS compatibility
module.exports = {
  supabase: mockSupabaseClient,
  getAuthHeaders,
  isAuthenticated,
  getCurrentUser,
};
