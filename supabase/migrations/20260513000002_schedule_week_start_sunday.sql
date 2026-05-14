-- Migration: 20260513000002_schedule_week_start_sunday
-- The schedule week now starts on Sunday instead of Monday.
-- Existing rows need two adjustments:
--   1. week_start shifts back one day (Monday → previous Sunday)
--   2. day_of_week renumbered: old 0=Mon…6=Sun → new 0=Sun, 1=Mon…6=Sat
--      formula: new_day = (old_day + 1) % 7
-- The unique constraint (employee_id, week_start, day_of_week) is not violated
-- because both columns are updated atomically in the same statement.

UPDATE employee_schedule_shifts
SET
    week_start  = week_start - INTERVAL '1 day',
    day_of_week = (day_of_week + 1) % 7;
