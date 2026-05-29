-- Add missing FK from comanda_events.user_id → users.id
-- Without this, PostgREST cannot join comanda_events to users in a single query.

ALTER TABLE public.comanda_events
    ADD CONSTRAINT comanda_events_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id);
