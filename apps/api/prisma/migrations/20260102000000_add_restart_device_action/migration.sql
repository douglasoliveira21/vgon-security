-- Adds the RESTART_DEVICE remote action type (a full OS reboot, distinct from RESTART_AGENT
-- which only restarts the Agent process). ADD VALUE IF NOT EXISTS keeps this idempotent, matching
-- the project's other migrations, since this is a live product.
ALTER TYPE "RemoteActionType" ADD VALUE IF NOT EXISTS 'RESTART_DEVICE';
