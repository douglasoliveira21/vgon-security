-- Adds the "Client" concept above Site ("Localização" in the UI): Client -> Site -> Group
-- ("Departamento") -> Device, plus direct client assignment on Device/ProvisioningToken/User
-- (a user with clientId set only ever sees that one client's data). Written defensively
-- (IF NOT EXISTS / duplicate_object-tolerant DO blocks), matching the baseline migration, since
-- this is a live product and re-running this file safely is more important than being terse.

-- CreateTable
CREATE TABLE IF NOT EXISTS "clients" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "clients_tenantId_name_key" ON "clients"("tenantId", "name");

DO $$ BEGIN
    ALTER TABLE "clients" ADD CONSTRAINT "clients_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AlterTable: sites
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "clientId" TEXT;

DO $$ BEGIN
    ALTER TABLE "sites" ADD CONSTRAINT "sites_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AlterTable: groups
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "clientId" TEXT;

DO $$ BEGIN
    ALTER TABLE "groups" ADD CONSTRAINT "groups_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AlterTable: users (clientId = null means "sees every client under the tenant")
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "clientId" TEXT;

DO $$ BEGIN
    ALTER TABLE "users" ADD CONSTRAINT "users_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AlterTable: devices
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "clientId" TEXT;

CREATE INDEX IF NOT EXISTS "devices_tenantId_clientId_idx" ON "devices"("tenantId", "clientId");

DO $$ BEGIN
    ALTER TABLE "devices" ADD CONSTRAINT "devices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AlterTable: provisioning_tokens
ALTER TABLE "provisioning_tokens" ADD COLUMN IF NOT EXISTS "clientId" TEXT;

DO $$ BEGIN
    ALTER TABLE "provisioning_tokens" ADD CONSTRAINT "provisioning_tokens_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
