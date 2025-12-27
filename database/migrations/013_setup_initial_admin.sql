-- Migration: Set up initial admin user
-- This ensures the initial admin email has admin access

-- Set the initial admin user as admin
-- Replace 'everythingsimpleinc1@gmail.com' with the actual admin email if different
UPDATE users 
SET is_admin = TRUE 
WHERE email = 'everythingsimpleinc1@gmail.com' 
  AND is_admin = FALSE;

-- Verify the admin user exists
-- This will show if the admin user was found and updated
DO $$
DECLARE
  admin_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO admin_count
  FROM users
  WHERE email = 'everythingsimpleinc1@gmail.com' AND is_admin = TRUE;
  
  IF admin_count = 0 THEN
    RAISE NOTICE 'Warning: Admin user everythingsimpleinc1@gmail.com not found or could not be set as admin.';
    RAISE NOTICE 'Please ensure the user exists and run this migration again, or set admin access manually via the admin dashboard.';
  ELSE
    RAISE NOTICE 'Success: Admin user everythingsimpleinc1@gmail.com has been set as admin.';
  END IF;
END $$;

