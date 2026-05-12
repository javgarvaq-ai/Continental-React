-- Fix: authenticated users could not SELECT from users table.
--
-- The previous migration kept users_select as TO anon (needed for the login
-- screen employee list). But TO anon does not cover the authenticated role —
-- they are separate Postgres roles. Authenticated sessions got empty results.
--
-- Solution: add a matching SELECT policy for the authenticated role.

CREATE POLICY "users_select_authenticated"
    ON public.users
    FOR SELECT
    TO authenticated
    USING (true);
