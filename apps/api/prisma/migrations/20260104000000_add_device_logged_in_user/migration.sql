-- Adds the "who is logged into this device right now" snapshot, refreshed on every heartbeat.
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "loggedInUser" TEXT;
