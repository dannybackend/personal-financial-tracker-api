import { z } from 'zod';

/**
 * Currency codes this API accepts - ISO-4217 alphabetic, uppercase.
 *
 * Deliberately a short whitelist rather than the full ISO-4217 register: a
 * currency belongs here once something in the product actually supports it.
 * Extending it costs one line and no migration, because the database only
 * enforces the *shape* of the column (`CHECK (currency ~ '^[A-Z]{3}$')`,
 * `src/db/schema.ts`) - this list is what decides the *set*.
 */
export const SUPPORTED_CURRENCIES = ['UAH', 'USD', 'EUR', 'PLN', 'GBP'] as const;

/**
 * The single validator for every currency field in the API.
 *
 * Rejects lowercase (`"usd"`) instead of normalising it: one canonical form on
 * the way in, in storage and in the response means what the client sent always
 * matches what got stored. See `docs/API-CONVENTIONS.md` §6.
 */
export const currencySchema = z.enum(SUPPORTED_CURRENCIES);

/** A currency code accepted by this API. */
export type Currency = z.infer<typeof currencySchema>;
