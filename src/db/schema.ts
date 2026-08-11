import { pgTable, uuid, varchar, char, text, timestamp, numeric, pgEnum, index, check } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { authUser } from './auth-schema.js';
import type { Currency } from '../lib/currency.js';

// Shared by every `currency` column below: the database enforces the *shape*
// of the code (3 uppercase letters) via a per-table CHECK constraint;
// src/lib/currency.ts's Zod enum enforces the *set* of codes actually
// accepted. The `check(...)` call itself is repeated once per table on
// purpose - a helper typed around `AnyPgColumn` would hide two short,
// identical lines behind an abstraction that exists for a single caller pair.
//
// `sql.raw`, not a tagged-template value: a CHECK constraint is DDL, and
// DDL cannot bind a `$1` parameter the way a query can - drizzle-kit would
// otherwise emit `CHECK (currency ~ $1)` with no way to ever supply $1. The
// pattern is a hardcoded literal here, never user input, so inlining it is
// safe.
const CURRENCY_FORMAT = sql.raw(`'^[A-Z]{3}$'`);

// -- ENUMS --

export const accountTypeEnum = pgEnum('account_type', ['cash', 'card', 'deposit']);
export const categoryTypeEnum = pgEnum('category_type', ['income', 'expense']);
export const transactionTypeEnum = pgEnum('transaction_type', ['income', 'expense']);
export const budgetPeriodEnum = pgEnum('budget_period', ['monthly', 'weekly']);

// -- TABLES --

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  authUserId: text('auth_user_id')
    .references(() => authUser.id, { onDelete: 'cascade' })
    .unique()
    .notNull(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  name: varchar('name', { length: 255 }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  type: accountTypeEnum('type').notNull(),
  // `.$type<Currency>()` narrows the TS type only - the CHECK constraint
  // below is what the database actually enforces. Not applied to
  // `budgets.currency`: nothing validates it against `SUPPORTED_CURRENCIES`
  // yet (no `/budgets` route exists), so the narrower type would claim a
  // guarantee the column doesn't have. See docs/PROGRESS.md.
  currency: char('currency', { length: 3 }).$type<Currency>().notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index('accounts_user_id_idx').on(table.userId),
  check('accounts_currency_iso4217', sql`${table.currency} ~ ${CURRENCY_FORMAT}`),
]);

/** Domain user profile row (`users` table) - not the Better Auth user. */
export type User = typeof users.$inferSelect;

/** A single financial account row. */
export type Account = typeof accounts.$inferSelect;

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  type: categoryTypeEnum('type').notNull(),
  color: varchar('color', { length: 50 }),
  icon: varchar('icon', { length: 50 }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index('categories_user_id_idx').on(table.userId),
]);

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  accountId: uuid('account_id')
    .references(() => accounts.id, { onDelete: 'cascade' })
    .notNull(),
  categoryId: uuid('category_id')
    .references(() => categories.id, { onDelete: 'set null' }),
  type: transactionTypeEnum('type').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  description: text('description'),
  date: timestamp('date', { mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index('transactions_user_id_idx').on(table.userId),
  index('transactions_account_id_idx').on(table.accountId),
  index('transactions_category_id_idx').on(table.categoryId),
]);

export const budgets = pgTable('budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  categoryId: uuid('category_id')
    .references(() => categories.id, { onDelete: 'cascade' })
    .notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  currency: char('currency', { length: 3 }).notNull(),
  period: budgetPeriodEnum('period').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index('budgets_user_id_idx').on(table.userId),
  index('budgets_category_id_idx').on(table.categoryId),
  check('budgets_currency_iso4217', sql`${table.currency} ~ ${CURRENCY_FORMAT}`),
]);

// -- RELATIONS --

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  categories: many(categories),
  transactions: many(transactions),
  budgets: many(budgets),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
  transactions: many(transactions),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, {
    fields: [categories.userId],
    references: [users.id],
  }),
  transactions: many(transactions),
  budgets: many(budgets),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
  account: one(accounts, {
    fields: [transactions.accountId],
    references: [accounts.id],
  }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
}));

export const budgetsRelations = relations(budgets, ({ one }) => ({
  user: one(users, {
    fields: [budgets.userId],
    references: [users.id],
  }),
  category: one(categories, {
    fields: [budgets.categoryId],
    references: [categories.id],
  }),
}));
