UPDATE "accounts" SET "currency" = upper(trim("currency"));--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "currency" SET DATA TYPE char(3);--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "currency" char(3);--> statement-breakpoint
UPDATE "budgets" SET "currency" = 'UAH';--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "currency" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_currency_iso4217" CHECK ("accounts"."currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_currency_iso4217" CHECK ("budgets"."currency" ~ '^[A-Z]{3}$');
