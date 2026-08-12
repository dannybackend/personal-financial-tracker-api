-- `USING upper(trim("currency"))` runs the normalization and the type change
-- as a single ALTER, under one lock - a separate UPDATE beforehand leaves a
-- window where another writer's INSERT/UPDATE can land an un-normalized row
-- between the two statements, and that row would then only surface as a
-- CHECK failure two statements later. A row that still doesn't fit char(3)
-- after normalizing (e.g. the free-text 'гривня' or 'USDT' the old
-- varchar(10) validator allowed through) is meant to fail this migration -
-- deciding what to replace it with is a data decision for a human, not
-- something this migration should guess at.
ALTER TABLE "accounts" ALTER COLUMN "currency" SET DATA TYPE char(3) USING upper(trim("currency"));--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "currency" char(3);--> statement-breakpoint
UPDATE "budgets" SET "currency" = 'UAH';--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "currency" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_currency_iso4217" CHECK ("accounts"."currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_currency_iso4217" CHECK ("budgets"."currency" ~ '^[A-Z]{3}$');
