-- Adds TOTP-based MFA fields to users. Written defensively (IF NOT EXISTS), matching the
-- project's other migrations, since this is a live product.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfaEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfaSecret" TEXT;
