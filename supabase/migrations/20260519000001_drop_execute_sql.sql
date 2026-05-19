-- Drop the execute_sql dev tool RPC.
-- This function was created in 20260514000002_execute_sql_dev_tool.sql
-- and was only used by SqlAdminPage during QA. That page has been removed.
-- Dropping the function closes the raw SQL execution surface entirely.

DROP FUNCTION IF EXISTS public.execute_sql(text);
DROP FUNCTION IF EXISTS public.execute_sql(query text);
