import { pgTable, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';

/**
 * Better Auth — user table.
 *
 * Named `auth_user` (SQL: "auth_user") to avoid collision with the application
 * `users` table that holds financial-tracker profile data.
 * Better Auth will be told to use this table via the `schema` mapping in
 * `src/lib/auth.ts`.
 */
export const authUser = pgTable('auth_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

/**
 * Better Auth — session table.
 * Stores server-side session records linked to a user.
 */
export const authSession = pgTable('auth_session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
}, (table) => [
  index('auth_session_user_id_idx').on(table.userId),
]);

/**
 * Better Auth — account table (OAuth provider accounts).
 * Named `auth_account` to avoid collision with the application `accounts`
 * table that represents financial accounts.
 */
export const authAccount = pgTable('auth_account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
}, (table) => [
  index('auth_account_user_id_idx').on(table.userId),
]);

/**
 * Better Auth — verification table.
 * Used for email verification tokens and similar one-time codes.
 */
export const authVerification = pgTable('auth_verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});
