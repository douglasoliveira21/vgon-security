-- Adds the WIPE_DEVICE remote action type — irreversibly erases the device (see the Agent's
-- WindowsSystemActions.WipeDevice, which triggers Windows' own factory-reset flow). ADD VALUE IF
-- NOT EXISTS keeps this idempotent, matching the project's other migrations.
ALTER TYPE "RemoteActionType" ADD VALUE IF NOT EXISTS 'WIPE_DEVICE';
