-- Migration: 20260513000003_error_log_table
-- Creates a simple error log table for ErrorBoundary crash reporting.
-- Inserts are allowed for all authenticated sessions (and anon, since crashes
-- can happen on the login screen before auth completes).
-- Reads are restricted to authenticated users only (admin review).

CREATE TABLE IF NOT EXISTS error_log (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at   timestamptz NOT NULL DEFAULT now(),
    error_message text,
    stack        text,
    user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    route        text
);

ALTER TABLE error_log ENABLE ROW LEVEL SECURITY;

-- Anyone (including pre-auth sessions) can insert crash reports
CREATE POLICY "error_log_insert"
    ON error_log
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- Only authenticated users can read (admin reviewing logs)
CREATE POLICY "error_log_select"
    ON error_log
    FOR SELECT
    TO authenticated
    USING (true);
