-- Add JSONB column to capture the full Graph user object (manager,
-- onPremisesExtensionAttribute1..15, address fields, etc.). The "Directory"
-- tab on the user-detail page reads this column so admins can see every
-- attribute Graph returned without us hardcoding a relational column for
-- each one.
ALTER TABLE "org_users" ADD COLUMN "raw_attributes" JSONB;
