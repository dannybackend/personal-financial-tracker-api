import { sql } from 'drizzle-orm';

/**
 * Truncates every app + Better Auth table. Shared between global-setup.ts
 * (clean slate before the first test, in case a previous run was
 * interrupted before its own cleanup could run) and db-cleanup.ts (after
 * every test), so the table list only has to be kept in sync in one place.
 */
export const truncateAllTablesSql = sql`
  TRUNCATE TABLE
    auth_verification, auth_account, auth_session, auth_user,
    budgets, transactions, categories, accounts, users
  CASCADE
`;
