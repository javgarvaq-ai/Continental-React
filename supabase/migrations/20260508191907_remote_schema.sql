drop extension if exists "pg_net";

create sequence "public"."comandas_folio_seq";


  create table "public"."cash_movements" (
    "id" uuid not null default gen_random_uuid(),
    "shift_id" uuid not null,
    "user_id" uuid not null,
    "type" text not null,
    "amount" numeric not null,
    "note" text,
    "created_at" timestamp with time zone default now(),
    "category" text,
    "movement_nature" text,
    "source_location" text,
    "destination_location" text
      );


alter table "public"."cash_movements" enable row level security;


  create table "public"."categories" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "name" text not null,
    "active" boolean not null default true
      );


alter table "public"."categories" enable row level security;


  create table "public"."comanda_events" (
    "id" uuid not null default gen_random_uuid(),
    "comanda_id" uuid not null,
    "user_id" uuid not null,
    "event_type" text not null,
    "event_data" jsonb,
    "created_at" timestamp without time zone default now(),
    "mesa_id" bigint,
    "details" jsonb,
    "product_id" uuid
      );


alter table "public"."comanda_events" enable row level security;


  create table "public"."comanda_items" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "comanda_id" uuid not null,
    "product_id" uuid not null,
    "quantity" integer not null default 1,
    "unit_price" numeric not null,
    "status" text not null default 'active'::text,
    "is_free_mixer" boolean not null default false,
    "source_shot_product_id" uuid,
    "source_type" text,
    "is_free_benefit" boolean not null default false
      );


alter table "public"."comanda_items" enable row level security;


  create table "public"."comandas" (
    "id" uuid not null default gen_random_uuid(),
    "unit_id" uuid not null,
    "status" text not null default 'open'::text,
    "opened_at" timestamp with time zone not null default now(),
    "closed_at" timestamp with time zone,
    "final_total" numeric,
    "paid_by_user_id" uuid,
    "tip_total" numeric not null default '0'::numeric,
    "opened_by" uuid,
    "cuenta_by" uuid,
    "cobrado_by" uuid,
    "reopened_by" uuid,
    "cuenta_at" timestamp with time zone,
    "cobrado_at" timestamp with time zone,
    "reopened_at" timestamp without time zone,
    "personas" integer,
    "folio" integer not null default nextval('public.comandas_folio_seq'::regclass),
    "customer_name" text,
    "customer_id" uuid
      );


alter table "public"."comandas" enable row level security;


  create table "public"."customer_memberships" (
    "id" uuid not null default gen_random_uuid(),
    "customer_id" uuid not null,
    "plan_id" uuid not null,
    "month" date not null,
    "status" text not null default 'active'::text,
    "paid_via_comanda_id" uuid,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."customer_memberships" enable row level security;


  create table "public"."customers" (
    "id" uuid not null default gen_random_uuid(),
    "customer_number" text not null,
    "name" text not null,
    "phone" text,
    "email" text,
    "visit_count" integer not null default 0,
    "bottle_credits_available" integer not null default 0,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."customers" enable row level security;


  create table "public"."employee_schedule_shifts" (
    "id" uuid not null default gen_random_uuid(),
    "employee_id" uuid not null,
    "week_start" date not null,
    "day_of_week" smallint not null,
    "start_time" time without time zone not null,
    "end_time" time without time zone not null,
    "actual_hours" numeric(4,2),
    "notes" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."employee_schedule_shifts" enable row level security;


  create table "public"."employee_time_logs" (
    "id" uuid not null default gen_random_uuid(),
    "employee_id" uuid not null,
    "checked_in_at" timestamp with time zone not null default now(),
    "checked_out_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."employee_time_logs" enable row level security;


  create table "public"."employees" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "position" text,
    "user_id" uuid,
    "active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "hourly_rate" numeric(10,2) default 0
      );


alter table "public"."employees" enable row level security;


  create table "public"."inventory_items" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "name" text not null,
    "unit_type" text not null,
    "current_stock" numeric(12,2) not null default 0,
    "capacity_oz" numeric(12,2),
    "active" boolean not null default true
      );


alter table "public"."inventory_items" enable row level security;


  create table "public"."inventory_movements" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "product_id" uuid,
    "comanda_item_id" uuid,
    "movement_type" text not null,
    "quantity_change" numeric(12,2),
    "inventory_item_id" uuid,
    "user_id" uuid,
    "note" text,
    "quantity" numeric
      );


alter table "public"."inventory_movements" enable row level security;


  create table "public"."membership_benefit_products" (
    "id" uuid not null default gen_random_uuid(),
    "benefit_id" uuid not null,
    "product_id" uuid not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."membership_benefit_products" enable row level security;


  create table "public"."membership_benefit_usage" (
    "id" uuid not null default gen_random_uuid(),
    "customer_id" uuid not null,
    "customer_membership_id" uuid not null,
    "comanda_id" uuid not null,
    "benefit_type" text not null,
    "discount_percentage" numeric,
    "discount_amount_saved" numeric,
    "free_product_id" uuid,
    "free_bottle_product_id" uuid,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."membership_benefit_usage" enable row level security;


  create table "public"."membership_plan_benefits" (
    "id" uuid not null default gen_random_uuid(),
    "plan_id" uuid not null,
    "benefit_type" text not null,
    "discount_percentage" numeric,
    "milestone_visits" integer,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."membership_plan_benefits" enable row level security;


  create table "public"."membership_plans" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "price_monthly" numeric not null,
    "active" boolean not null default true,
    "created_at" timestamp with time zone default now(),
    "product_id" uuid
      );


alter table "public"."membership_plans" enable row level security;


  create table "public"."payments" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "comanda_id" uuid not null,
    "paid_by_user" uuid,
    "efectivo" numeric,
    "tarjeta" numeric,
    "transferencia" numeric,
    "total_paid" numeric,
    "shift_id" uuid,
    "tip_amount" numeric not null default 0,
    "change_given" numeric not null default 0
      );


alter table "public"."payments" enable row level security;


  create table "public"."product_allowed_mixers" (
    "id" uuid not null default gen_random_uuid(),
    "shot_product_id" uuid not null,
    "mixer_product_id" uuid not null,
    "active" boolean not null default true,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."product_allowed_mixers" enable row level security;


  create table "public"."product_recipes" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "product_id" uuid not null,
    "inventory_item_id" uuid not null,
    "deduct_amount" numeric(12,2) not null,
    "active" boolean not null default true
      );


alter table "public"."product_recipes" enable row level security;


  create table "public"."products" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "name" text not null,
    "price" numeric not null,
    "category_id" uuid not null default gen_random_uuid(),
    "inventory_type" text default 'unit'::text,
    "base_unit" text default 'unit'::text,
    "current_stock" numeric default 0,
    "parent_product_id" uuid,
    "deduct_amount" numeric default 1,
    "is_shot" boolean not null default false,
    "is_mixer" boolean not null default false,
    "free_mixers_qty" integer not null default 0,
    "requires_inventory" boolean not null default false,
    "active" boolean not null default true
      );


alter table "public"."products" enable row level security;


  create table "public"."shifts" (
    "id" uuid not null default gen_random_uuid(),
    "opened_at" timestamp with time zone default now(),
    "closed_at" timestamp with time zone,
    "status" text not null default 'open'::text,
    "starting_cash" numeric not null,
    "cash_counted" numeric,
    "difference" numeric,
    "opened_by_user_id" uuid,
    "closed_by_user_id" uuid,
    "total_efectivo" numeric default 0,
    "total_tarjeta" numeric default 0,
    "total_transferencia" numeric default 0,
    "total_propinas" numeric default 0,
    "total_retiros" numeric default 0,
    "expected_cash" numeric default 0
      );


alter table "public"."shifts" enable row level security;


  create table "public"."units" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "type" text not null,
    "status" text not null default 'free'::text,
    "created_at" timestamp with time zone not null default now(),
    "active" boolean not null default true
      );


alter table "public"."units" enable row level security;


  create table "public"."users" (
    "id" uuid not null default gen_random_uuid(),
    "role" text not null,
    "name" text not null,
    "pin_hash" text not null,
    "active" boolean not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."users" enable row level security;

alter sequence "public"."comandas_folio_seq" owned by "public"."comandas"."folio";

CREATE UNIQUE INDEX "Categoriesg_pkey" ON public.categories USING btree (id);

CREATE UNIQUE INDEX "Units_pkey" ON public.units USING btree (id);

CREATE UNIQUE INDEX "Users_pkey" ON public.users USING btree (id);

CREATE UNIQUE INDEX cash_movements_pkey ON public.cash_movements USING btree (id);

CREATE INDEX cash_movements_shift_idx ON public.cash_movements USING btree (shift_id);

CREATE UNIQUE INDEX comanda_events_pkey ON public.comanda_events USING btree (id);

CREATE UNIQUE INDEX comanda_items_pkey ON public.comanda_items USING btree (id);

CREATE UNIQUE INDEX comandas_folio_key ON public.comandas USING btree (folio);

CREATE UNIQUE INDEX comandas_pkey ON public.comandas USING btree (id);

CREATE UNIQUE INDEX customer_memberships_customer_month_unique ON public.customer_memberships USING btree (customer_id, month);

CREATE UNIQUE INDEX customer_memberships_pkey ON public.customer_memberships USING btree (id);

CREATE UNIQUE INDEX customer_memberships_unique ON public.customer_memberships USING btree (customer_id, month);

CREATE UNIQUE INDEX customers_customer_number_key ON public.customers USING btree (customer_number);

CREATE UNIQUE INDEX customers_pkey ON public.customers USING btree (id);

CREATE UNIQUE INDEX employee_one_open_checkin ON public.employee_time_logs USING btree (employee_id) WHERE (checked_out_at IS NULL);

CREATE UNIQUE INDEX employee_schedule_shifts_employee_id_week_start_day_of_week_key ON public.employee_schedule_shifts USING btree (employee_id, week_start, day_of_week);

CREATE UNIQUE INDEX employee_schedule_shifts_pkey ON public.employee_schedule_shifts USING btree (id);

CREATE UNIQUE INDEX employee_time_logs_pkey ON public.employee_time_logs USING btree (id);

CREATE UNIQUE INDEX employees_pkey ON public.employees USING btree (id);

CREATE INDEX idx_comanda_events_comanda_id ON public.comanda_events USING btree (comanda_id);

CREATE INDEX idx_comanda_events_event_type ON public.comanda_events USING btree (event_type);

CREATE INDEX idx_comanda_events_mesa_id ON public.comanda_events USING btree (mesa_id);

CREATE INDEX idx_schedule_week ON public.employee_schedule_shifts USING btree (week_start);

CREATE UNIQUE INDEX inventory_items_pkey ON public.inventory_items USING btree (id);

CREATE INDEX inventory_movements_comanda_item_idx ON public.inventory_movements USING btree (comanda_item_id);

CREATE INDEX inventory_movements_created_at_idx ON public.inventory_movements USING btree (created_at);

CREATE INDEX inventory_movements_inventory_item_idx ON public.inventory_movements USING btree (inventory_item_id);

CREATE UNIQUE INDEX inventory_movements_pkey ON public.inventory_movements USING btree (id);

CREATE INDEX inventory_movements_product_idx ON public.inventory_movements USING btree (product_id);

CREATE UNIQUE INDEX membership_benefit_products_pkey ON public.membership_benefit_products USING btree (id);

CREATE UNIQUE INDEX membership_benefit_usage_pkey ON public.membership_benefit_usage USING btree (id);

CREATE UNIQUE INDEX membership_plan_benefits_pkey ON public.membership_plan_benefits USING btree (id);

CREATE UNIQUE INDEX membership_plans_pkey ON public.membership_plans USING btree (id);

CREATE UNIQUE INDEX one_active_membership_per_customer_month ON public.customer_memberships USING btree (customer_id, month) WHERE (status = 'active'::text);

CREATE UNIQUE INDEX one_active_mixer_mapping ON public.product_allowed_mixers USING btree (shot_product_id, mixer_product_id) WHERE (active = true);

CREATE UNIQUE INDEX one_active_recipe_per_product_inventory_item ON public.product_recipes USING btree (product_id, inventory_item_id) WHERE (active = true);

CREATE UNIQUE INDEX one_membership_usage_per_customer_comanda_benefit ON public.membership_benefit_usage USING btree (customer_id, comanda_id, benefit_type);

CREATE UNIQUE INDEX one_product_per_benefit ON public.membership_benefit_products USING btree (benefit_id, product_id);

CREATE UNIQUE INDEX only_one_open_shift ON public.shifts USING btree (status) WHERE (status = 'open'::text);

CREATE UNIQUE INDEX payments_comanda_id_unique ON public.payments USING btree (comanda_id);

CREATE UNIQUE INDEX payments_pkey ON public.payments USING btree (id);

CREATE UNIQUE INDEX product_allowed_mixers_pkey ON public.product_allowed_mixers USING btree (id);

CREATE UNIQUE INDEX product_allowed_mixers_shot_product_id_mixer_product_id_key ON public.product_allowed_mixers USING btree (shot_product_id, mixer_product_id);

CREATE UNIQUE INDEX product_recipes_pkey ON public.product_recipes USING btree (id);

CREATE UNIQUE INDEX product_recipes_product_inventory_uidx ON public.product_recipes USING btree (product_id, inventory_item_id);

CREATE UNIQUE INDEX products_pkey ON public.products USING btree (id);

CREATE UNIQUE INDEX shifts_one_open_at_a_time ON public.shifts USING btree (status) WHERE (status = 'open'::text);

CREATE UNIQUE INDEX shifts_pkey ON public.shifts USING btree (id);

CREATE UNIQUE INDEX ux_inventory_items_name_unique ON public.inventory_items USING btree (name);

CREATE UNIQUE INDEX ux_product_allowed_mixers_unique ON public.product_allowed_mixers USING btree (shot_product_id, mixer_product_id) WHERE (active = true);

CREATE UNIQUE INDEX ux_product_recipes_product_inventory ON public.product_recipes USING btree (product_id, inventory_item_id) WHERE (active = true);

CREATE UNIQUE INDEX ux_products_name_unique ON public.products USING btree (name);

alter table "public"."cash_movements" add constraint "cash_movements_pkey" PRIMARY KEY using index "cash_movements_pkey";

alter table "public"."categories" add constraint "Categoriesg_pkey" PRIMARY KEY using index "Categoriesg_pkey";

alter table "public"."comanda_events" add constraint "comanda_events_pkey" PRIMARY KEY using index "comanda_events_pkey";

alter table "public"."comanda_items" add constraint "comanda_items_pkey" PRIMARY KEY using index "comanda_items_pkey";

alter table "public"."comandas" add constraint "comandas_pkey" PRIMARY KEY using index "comandas_pkey";

alter table "public"."customer_memberships" add constraint "customer_memberships_pkey" PRIMARY KEY using index "customer_memberships_pkey";

alter table "public"."customers" add constraint "customers_pkey" PRIMARY KEY using index "customers_pkey";

alter table "public"."employee_schedule_shifts" add constraint "employee_schedule_shifts_pkey" PRIMARY KEY using index "employee_schedule_shifts_pkey";

alter table "public"."employee_time_logs" add constraint "employee_time_logs_pkey" PRIMARY KEY using index "employee_time_logs_pkey";

alter table "public"."employees" add constraint "employees_pkey" PRIMARY KEY using index "employees_pkey";

alter table "public"."inventory_items" add constraint "inventory_items_pkey" PRIMARY KEY using index "inventory_items_pkey";

alter table "public"."inventory_movements" add constraint "inventory_movements_pkey" PRIMARY KEY using index "inventory_movements_pkey";

alter table "public"."membership_benefit_products" add constraint "membership_benefit_products_pkey" PRIMARY KEY using index "membership_benefit_products_pkey";

alter table "public"."membership_benefit_usage" add constraint "membership_benefit_usage_pkey" PRIMARY KEY using index "membership_benefit_usage_pkey";

alter table "public"."membership_plan_benefits" add constraint "membership_plan_benefits_pkey" PRIMARY KEY using index "membership_plan_benefits_pkey";

alter table "public"."membership_plans" add constraint "membership_plans_pkey" PRIMARY KEY using index "membership_plans_pkey";

alter table "public"."payments" add constraint "payments_pkey" PRIMARY KEY using index "payments_pkey";

alter table "public"."product_allowed_mixers" add constraint "product_allowed_mixers_pkey" PRIMARY KEY using index "product_allowed_mixers_pkey";

alter table "public"."product_recipes" add constraint "product_recipes_pkey" PRIMARY KEY using index "product_recipes_pkey";

alter table "public"."products" add constraint "products_pkey" PRIMARY KEY using index "products_pkey";

alter table "public"."shifts" add constraint "shifts_pkey" PRIMARY KEY using index "shifts_pkey";

alter table "public"."units" add constraint "Units_pkey" PRIMARY KEY using index "Units_pkey";

alter table "public"."users" add constraint "Users_pkey" PRIMARY KEY using index "Users_pkey";

alter table "public"."cash_movements" add constraint "cash_movements_shift_id_fkey" FOREIGN KEY (shift_id) REFERENCES public.shifts(id) not valid;

alter table "public"."cash_movements" validate constraint "cash_movements_shift_id_fkey";

alter table "public"."cash_movements" add constraint "cash_movements_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) not valid;

alter table "public"."cash_movements" validate constraint "cash_movements_user_id_fkey";

alter table "public"."comanda_events" add constraint "comanda_events_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) not valid;

alter table "public"."comanda_events" validate constraint "comanda_events_product_id_fkey";

alter table "public"."comanda_items" add constraint "comanda_items_comanda_id_fkey" FOREIGN KEY (comanda_id) REFERENCES public.comandas(id) ON UPDATE CASCADE not valid;

alter table "public"."comanda_items" validate constraint "comanda_items_comanda_id_fkey";

alter table "public"."comanda_items" add constraint "comanda_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT not valid;

alter table "public"."comanda_items" validate constraint "comanda_items_product_id_fkey";

alter table "public"."comanda_items" add constraint "comanda_items_source_shot_product_id_fkey" FOREIGN KEY (source_shot_product_id) REFERENCES public.products(id) not valid;

alter table "public"."comanda_items" validate constraint "comanda_items_source_shot_product_id_fkey";

alter table "public"."comanda_items" add constraint "comanda_items_source_type_check" CHECK (((source_type IS NULL) OR (source_type = ANY (ARRAY['regular'::text, 'free_mixer'::text])))) not valid;

alter table "public"."comanda_items" validate constraint "comanda_items_source_type_check";

alter table "public"."comandas" add constraint "comandas_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) not valid;

alter table "public"."comandas" validate constraint "comandas_customer_id_fkey";

alter table "public"."comandas" add constraint "comandas_folio_key" UNIQUE using index "comandas_folio_key";

alter table "public"."comandas" add constraint "comandas_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'pending_payment'::text, 'processing_payment'::text, 'paid'::text, 'cancelled'::text]))) not valid;

alter table "public"."comandas" validate constraint "comandas_status_check";

alter table "public"."comandas" add constraint "comandas_unit_id_fkey" FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE RESTRICT not valid;

alter table "public"."comandas" validate constraint "comandas_unit_id_fkey";

alter table "public"."customer_memberships" add constraint "customer_memberships_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) not valid;

alter table "public"."customer_memberships" validate constraint "customer_memberships_customer_id_fkey";

alter table "public"."customer_memberships" add constraint "customer_memberships_customer_month_unique" UNIQUE using index "customer_memberships_customer_month_unique";

alter table "public"."customer_memberships" add constraint "customer_memberships_paid_via_comanda_id_fkey" FOREIGN KEY (paid_via_comanda_id) REFERENCES public.comandas(id) not valid;

alter table "public"."customer_memberships" validate constraint "customer_memberships_paid_via_comanda_id_fkey";

alter table "public"."customer_memberships" add constraint "customer_memberships_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES public.membership_plans(id) not valid;

alter table "public"."customer_memberships" validate constraint "customer_memberships_plan_id_fkey";

alter table "public"."customer_memberships" add constraint "customer_memberships_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'expired'::text]))) not valid;

alter table "public"."customer_memberships" validate constraint "customer_memberships_status_check";

alter table "public"."customer_memberships" add constraint "customer_memberships_unique" UNIQUE using index "customer_memberships_unique";

alter table "public"."customers" add constraint "customers_customer_number_key" UNIQUE using index "customers_customer_number_key";

alter table "public"."employee_schedule_shifts" add constraint "employee_schedule_shifts_day_of_week_check" CHECK (((day_of_week >= 0) AND (day_of_week <= 6))) not valid;

alter table "public"."employee_schedule_shifts" validate constraint "employee_schedule_shifts_day_of_week_check";

alter table "public"."employee_schedule_shifts" add constraint "employee_schedule_shifts_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE not valid;

alter table "public"."employee_schedule_shifts" validate constraint "employee_schedule_shifts_employee_id_fkey";

alter table "public"."employee_schedule_shifts" add constraint "employee_schedule_shifts_employee_id_week_start_day_of_week_key" UNIQUE using index "employee_schedule_shifts_employee_id_week_start_day_of_week_key";

alter table "public"."employee_time_logs" add constraint "employee_time_logs_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE not valid;

alter table "public"."employee_time_logs" validate constraint "employee_time_logs_employee_id_fkey";

alter table "public"."employees" add constraint "employees_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL not valid;

alter table "public"."employees" validate constraint "employees_user_id_fkey";

alter table "public"."inventory_items" add constraint "inventory_items_stock_non_negative" CHECK ((current_stock >= (0)::numeric)) not valid;

alter table "public"."inventory_items" validate constraint "inventory_items_stock_non_negative";

alter table "public"."inventory_items" add constraint "inventory_items_unit_type_check" CHECK ((unit_type = ANY (ARRAY['unit'::text, 'oz'::text]))) not valid;

alter table "public"."inventory_items" validate constraint "inventory_items_unit_type_check";

alter table "public"."inventory_movements" add constraint "inventory_movements_comanda_item_id_fkey" FOREIGN KEY (comanda_item_id) REFERENCES public.comanda_items(id) ON DELETE SET NULL not valid;

alter table "public"."inventory_movements" validate constraint "inventory_movements_comanda_item_id_fkey";

alter table "public"."inventory_movements" add constraint "inventory_movements_inventory_item_id_fkey" FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE RESTRICT not valid;

alter table "public"."inventory_movements" validate constraint "inventory_movements_inventory_item_id_fkey";

alter table "public"."inventory_movements" add constraint "inventory_movements_movement_type_check" CHECK ((movement_type = ANY (ARRAY['entry'::text, 'adjustment_plus'::text, 'adjustment_minus'::text, 'sale_deduction'::text]))) not valid;

alter table "public"."inventory_movements" validate constraint "inventory_movements_movement_type_check";

alter table "public"."inventory_movements" add constraint "inventory_movements_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT not valid;

alter table "public"."inventory_movements" validate constraint "inventory_movements_product_id_fkey";

alter table "public"."inventory_movements" add constraint "inventory_movements_type_check" CHECK ((movement_type = ANY (ARRAY['entry'::text, 'adjustment_plus'::text, 'adjustment_minus'::text, 'sale_deduction'::text]))) not valid;

alter table "public"."inventory_movements" validate constraint "inventory_movements_type_check";

alter table "public"."inventory_movements" add constraint "inventory_movements_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) not valid;

alter table "public"."inventory_movements" validate constraint "inventory_movements_user_id_fkey";

alter table "public"."membership_benefit_products" add constraint "membership_benefit_products_benefit_id_fkey" FOREIGN KEY (benefit_id) REFERENCES public.membership_plan_benefits(id) not valid;

alter table "public"."membership_benefit_products" validate constraint "membership_benefit_products_benefit_id_fkey";

alter table "public"."membership_benefit_products" add constraint "membership_benefit_products_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) not valid;

alter table "public"."membership_benefit_products" validate constraint "membership_benefit_products_product_id_fkey";

alter table "public"."membership_benefit_usage" add constraint "membership_benefit_usage_comanda_id_fkey" FOREIGN KEY (comanda_id) REFERENCES public.comandas(id) not valid;

alter table "public"."membership_benefit_usage" validate constraint "membership_benefit_usage_comanda_id_fkey";

alter table "public"."membership_benefit_usage" add constraint "membership_benefit_usage_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) not valid;

alter table "public"."membership_benefit_usage" validate constraint "membership_benefit_usage_customer_id_fkey";

alter table "public"."membership_benefit_usage" add constraint "membership_benefit_usage_membership_id_fkey" FOREIGN KEY (customer_membership_id) REFERENCES public.customer_memberships(id) not valid;

alter table "public"."membership_benefit_usage" validate constraint "membership_benefit_usage_membership_id_fkey";

alter table "public"."membership_plan_benefits" add constraint "membership_plan_benefits_benefit_type_check" CHECK ((benefit_type = ANY (ARRAY['discount'::text, 'free_product'::text, 'free_bottle_milestone'::text]))) not valid;

alter table "public"."membership_plan_benefits" validate constraint "membership_plan_benefits_benefit_type_check";

alter table "public"."membership_plan_benefits" add constraint "membership_plan_benefits_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES public.membership_plans(id) not valid;

alter table "public"."membership_plan_benefits" validate constraint "membership_plan_benefits_plan_id_fkey";

alter table "public"."membership_plans" add constraint "membership_plans_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) not valid;

alter table "public"."membership_plans" validate constraint "membership_plans_product_id_fkey";

alter table "public"."payments" add constraint "payments_comanda_id_fkey" FOREIGN KEY (comanda_id) REFERENCES public.comandas(id) ON DELETE CASCADE not valid;

alter table "public"."payments" validate constraint "payments_comanda_id_fkey";

alter table "public"."payments" add constraint "payments_comanda_id_unique" UNIQUE using index "payments_comanda_id_unique";

alter table "public"."payments" add constraint "payments_shift_id_fkey" FOREIGN KEY (shift_id) REFERENCES public.shifts(id) not valid;

alter table "public"."payments" validate constraint "payments_shift_id_fkey";

alter table "public"."product_allowed_mixers" add constraint "product_allowed_mixers_mixer_product_id_fkey" FOREIGN KEY (mixer_product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."product_allowed_mixers" validate constraint "product_allowed_mixers_mixer_product_id_fkey";

alter table "public"."product_allowed_mixers" add constraint "product_allowed_mixers_shot_product_id_fkey" FOREIGN KEY (shot_product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."product_allowed_mixers" validate constraint "product_allowed_mixers_shot_product_id_fkey";

alter table "public"."product_allowed_mixers" add constraint "product_allowed_mixers_shot_product_id_mixer_product_id_key" UNIQUE using index "product_allowed_mixers_shot_product_id_mixer_product_id_key";

alter table "public"."product_recipes" add constraint "product_recipes_inventory_item_id_fkey" FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE RESTRICT not valid;

alter table "public"."product_recipes" validate constraint "product_recipes_inventory_item_id_fkey";

alter table "public"."product_recipes" add constraint "product_recipes_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."product_recipes" validate constraint "product_recipes_product_id_fkey";

alter table "public"."products" add constraint "products_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE RESTRICT not valid;

alter table "public"."products" validate constraint "products_category_id_fkey";

alter table "public"."products" add constraint "products_parent_product_id_fkey" FOREIGN KEY (parent_product_id) REFERENCES public.products(id) not valid;

alter table "public"."products" validate constraint "products_parent_product_id_fkey";

alter table "public"."shifts" add constraint "shifts_closed_by_user_id_fkey" FOREIGN KEY (closed_by_user_id) REFERENCES public.users(id) not valid;

alter table "public"."shifts" validate constraint "shifts_closed_by_user_id_fkey";

alter table "public"."shifts" add constraint "shifts_opened_by_user_id_fkey" FOREIGN KEY (opened_by_user_id) REFERENCES public.users(id) not valid;

alter table "public"."shifts" validate constraint "shifts_opened_by_user_id_fkey";

alter table "public"."users" add constraint "users_role_check" CHECK ((role = ANY (ARRAY['admin'::text, 'manager'::text, 'waiter'::text]))) not valid;

alter table "public"."users" validate constraint "users_role_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.assign_comanda_folio()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.folio is null then
    new.folio := nextval('public.comandas_folio_seq');
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.deduct_inventory_item(p_inventory_item_id uuid, p_deduct_amount numeric, p_product_id uuid, p_comanda_item_id uuid, p_user_id uuid, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_new_stock numeric;
    v_item_name text;
BEGIN
    UPDATE inventory_items
    SET current_stock = current_stock - p_deduct_amount
    WHERE id = p_inventory_item_id
      AND current_stock >= p_deduct_amount
      AND active = true
    RETURNING current_stock, name INTO v_new_stock, v_item_name;

    IF NOT FOUND THEN
        SELECT name INTO v_item_name
        FROM inventory_items WHERE id = p_inventory_item_id;

        RETURN jsonb_build_object(
            'ok', false,
            'error', COALESCE(
                'Inventario insuficiente para ' || v_item_name,
                'Artículo de inventario no encontrado'
            )
        );
    END IF;

    INSERT INTO inventory_movements (
        inventory_item_id, product_id, comanda_item_id,
        movement_type, quantity_change, quantity, user_id, note
    ) VALUES (
        p_inventory_item_id, p_product_id, p_comanda_item_id,
        'sale_deduction', -p_deduct_amount, v_new_stock, p_user_id, p_note
    );

    RETURN jsonb_build_object('ok', true, 'new_stock', v_new_stock);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.finalize_comanda_payment(p_comanda_id uuid, p_user_id uuid, p_shift_id uuid, p_cobrado_at timestamp with time zone, p_tip_total numeric, p_efectivo numeric, p_tarjeta numeric, p_transferencia numeric, p_total_paid numeric, p_tip_amount numeric, p_change_given numeric, p_total numeric, p_cash_received numeric, p_total_aplicado numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_item      RECORD;
    v_recipe    RECORD;
    v_deduction NUMERIC;
    v_result    JSONB;
BEGIN
    -- 1. Update comanda to paid
    UPDATE comandas
    SET
        status          = 'paid',
        paid_by_user_id = p_user_id,
        cobrado_by      = p_user_id,
        cobrado_at      = p_cobrado_at,
        tip_total       = p_tip_total
    WHERE id = p_comanda_id;

    -- 2. Insert payment record
    INSERT INTO payments (
        comanda_id,
        shift_id,
        paid_by_user,
        efectivo,
        tarjeta,
        transferencia,
        total_paid,
        tip_amount,
        change_given
    ) VALUES (
        p_comanda_id,
        p_shift_id,
        p_user_id,
        p_efectivo,
        p_tarjeta,
        p_transferencia,
        p_total_paid,
        p_tip_amount,
        p_change_given
    );

    -- 3. Deduct inventory for every active item in this comanda
    FOR v_item IN
        SELECT ci.id AS comanda_item_id,
               ci.product_id,
               ci.quantity
        FROM   comanda_items ci
        WHERE  ci.comanda_id = p_comanda_id
          AND  ci.status     = 'active'
    LOOP
        FOR v_recipe IN
            SELECT pr.inventory_item_id,
                   pr.deduct_amount
            FROM   product_recipes pr
            WHERE  pr.product_id = v_item.product_id
              AND  pr.active     = true
        LOOP
            v_deduction := v_item.quantity * v_recipe.deduct_amount;

            SELECT deduct_inventory_item(
                v_recipe.inventory_item_id,
                v_deduction,
                v_item.product_id,
                v_item.comanda_item_id,
                p_user_id,
                'Deducción por cobro de comanda ' || p_comanda_id::TEXT
            ) INTO v_result;

            IF NOT (v_result->>'ok')::BOOLEAN THEN
                RAISE EXCEPTION '%', v_result->>'error';
            END IF;
        END LOOP;
    END LOOP;

    -- 4. Insert comanda event
    INSERT INTO comanda_events (
        comanda_id,
        user_id,
        event_type,
        event_data
    ) VALUES (
        p_comanda_id,
        p_user_id,
        'cobro_confirmed',
        jsonb_build_object(
            'total',             p_total,
            'efectivo',          p_efectivo,
            'tarjeta',           p_tarjeta,
            'transferencia',     p_transferencia,
            'propina',           p_tip_total,
            'cambio',            p_change_given,
            'efectivo_recibido', p_cash_received,
            'total_aplicado',    p_total_aplicado
        )
    );

    RETURN jsonb_build_object('ok', true);

EXCEPTION WHEN OTHERS THEN
    RAISE; -- re-raise so Postgres rolls back the entire transaction
END;
$function$
;

grant delete on table "public"."cash_movements" to "anon";

grant insert on table "public"."cash_movements" to "anon";

grant references on table "public"."cash_movements" to "anon";

grant select on table "public"."cash_movements" to "anon";

grant trigger on table "public"."cash_movements" to "anon";

grant truncate on table "public"."cash_movements" to "anon";

grant update on table "public"."cash_movements" to "anon";

grant delete on table "public"."cash_movements" to "authenticated";

grant insert on table "public"."cash_movements" to "authenticated";

grant references on table "public"."cash_movements" to "authenticated";

grant select on table "public"."cash_movements" to "authenticated";

grant trigger on table "public"."cash_movements" to "authenticated";

grant truncate on table "public"."cash_movements" to "authenticated";

grant update on table "public"."cash_movements" to "authenticated";

grant delete on table "public"."cash_movements" to "service_role";

grant insert on table "public"."cash_movements" to "service_role";

grant references on table "public"."cash_movements" to "service_role";

grant select on table "public"."cash_movements" to "service_role";

grant trigger on table "public"."cash_movements" to "service_role";

grant truncate on table "public"."cash_movements" to "service_role";

grant update on table "public"."cash_movements" to "service_role";

grant delete on table "public"."categories" to "anon";

grant insert on table "public"."categories" to "anon";

grant references on table "public"."categories" to "anon";

grant select on table "public"."categories" to "anon";

grant trigger on table "public"."categories" to "anon";

grant truncate on table "public"."categories" to "anon";

grant update on table "public"."categories" to "anon";

grant delete on table "public"."categories" to "authenticated";

grant insert on table "public"."categories" to "authenticated";

grant references on table "public"."categories" to "authenticated";

grant select on table "public"."categories" to "authenticated";

grant trigger on table "public"."categories" to "authenticated";

grant truncate on table "public"."categories" to "authenticated";

grant update on table "public"."categories" to "authenticated";

grant delete on table "public"."categories" to "service_role";

grant insert on table "public"."categories" to "service_role";

grant references on table "public"."categories" to "service_role";

grant select on table "public"."categories" to "service_role";

grant trigger on table "public"."categories" to "service_role";

grant truncate on table "public"."categories" to "service_role";

grant update on table "public"."categories" to "service_role";

grant delete on table "public"."comanda_events" to "anon";

grant insert on table "public"."comanda_events" to "anon";

grant references on table "public"."comanda_events" to "anon";

grant select on table "public"."comanda_events" to "anon";

grant trigger on table "public"."comanda_events" to "anon";

grant truncate on table "public"."comanda_events" to "anon";

grant update on table "public"."comanda_events" to "anon";

grant delete on table "public"."comanda_events" to "authenticated";

grant insert on table "public"."comanda_events" to "authenticated";

grant references on table "public"."comanda_events" to "authenticated";

grant select on table "public"."comanda_events" to "authenticated";

grant trigger on table "public"."comanda_events" to "authenticated";

grant truncate on table "public"."comanda_events" to "authenticated";

grant update on table "public"."comanda_events" to "authenticated";

grant delete on table "public"."comanda_events" to "service_role";

grant insert on table "public"."comanda_events" to "service_role";

grant references on table "public"."comanda_events" to "service_role";

grant select on table "public"."comanda_events" to "service_role";

grant trigger on table "public"."comanda_events" to "service_role";

grant truncate on table "public"."comanda_events" to "service_role";

grant update on table "public"."comanda_events" to "service_role";

grant delete on table "public"."comanda_items" to "anon";

grant insert on table "public"."comanda_items" to "anon";

grant references on table "public"."comanda_items" to "anon";

grant select on table "public"."comanda_items" to "anon";

grant trigger on table "public"."comanda_items" to "anon";

grant truncate on table "public"."comanda_items" to "anon";

grant update on table "public"."comanda_items" to "anon";

grant delete on table "public"."comanda_items" to "authenticated";

grant insert on table "public"."comanda_items" to "authenticated";

grant references on table "public"."comanda_items" to "authenticated";

grant select on table "public"."comanda_items" to "authenticated";

grant trigger on table "public"."comanda_items" to "authenticated";

grant truncate on table "public"."comanda_items" to "authenticated";

grant update on table "public"."comanda_items" to "authenticated";

grant delete on table "public"."comanda_items" to "service_role";

grant insert on table "public"."comanda_items" to "service_role";

grant references on table "public"."comanda_items" to "service_role";

grant select on table "public"."comanda_items" to "service_role";

grant trigger on table "public"."comanda_items" to "service_role";

grant truncate on table "public"."comanda_items" to "service_role";

grant update on table "public"."comanda_items" to "service_role";

grant delete on table "public"."comandas" to "anon";

grant insert on table "public"."comandas" to "anon";

grant references on table "public"."comandas" to "anon";

grant select on table "public"."comandas" to "anon";

grant trigger on table "public"."comandas" to "anon";

grant truncate on table "public"."comandas" to "anon";

grant update on table "public"."comandas" to "anon";

grant delete on table "public"."comandas" to "authenticated";

grant insert on table "public"."comandas" to "authenticated";

grant references on table "public"."comandas" to "authenticated";

grant select on table "public"."comandas" to "authenticated";

grant trigger on table "public"."comandas" to "authenticated";

grant truncate on table "public"."comandas" to "authenticated";

grant update on table "public"."comandas" to "authenticated";

grant delete on table "public"."comandas" to "service_role";

grant insert on table "public"."comandas" to "service_role";

grant references on table "public"."comandas" to "service_role";

grant select on table "public"."comandas" to "service_role";

grant trigger on table "public"."comandas" to "service_role";

grant truncate on table "public"."comandas" to "service_role";

grant update on table "public"."comandas" to "service_role";

grant delete on table "public"."customer_memberships" to "anon";

grant insert on table "public"."customer_memberships" to "anon";

grant references on table "public"."customer_memberships" to "anon";

grant select on table "public"."customer_memberships" to "anon";

grant trigger on table "public"."customer_memberships" to "anon";

grant truncate on table "public"."customer_memberships" to "anon";

grant update on table "public"."customer_memberships" to "anon";

grant delete on table "public"."customer_memberships" to "authenticated";

grant insert on table "public"."customer_memberships" to "authenticated";

grant references on table "public"."customer_memberships" to "authenticated";

grant select on table "public"."customer_memberships" to "authenticated";

grant trigger on table "public"."customer_memberships" to "authenticated";

grant truncate on table "public"."customer_memberships" to "authenticated";

grant update on table "public"."customer_memberships" to "authenticated";

grant delete on table "public"."customer_memberships" to "service_role";

grant insert on table "public"."customer_memberships" to "service_role";

grant references on table "public"."customer_memberships" to "service_role";

grant select on table "public"."customer_memberships" to "service_role";

grant trigger on table "public"."customer_memberships" to "service_role";

grant truncate on table "public"."customer_memberships" to "service_role";

grant update on table "public"."customer_memberships" to "service_role";

grant delete on table "public"."customers" to "anon";

grant insert on table "public"."customers" to "anon";

grant references on table "public"."customers" to "anon";

grant select on table "public"."customers" to "anon";

grant trigger on table "public"."customers" to "anon";

grant truncate on table "public"."customers" to "anon";

grant update on table "public"."customers" to "anon";

grant delete on table "public"."customers" to "authenticated";

grant insert on table "public"."customers" to "authenticated";

grant references on table "public"."customers" to "authenticated";

grant select on table "public"."customers" to "authenticated";

grant trigger on table "public"."customers" to "authenticated";

grant truncate on table "public"."customers" to "authenticated";

grant update on table "public"."customers" to "authenticated";

grant delete on table "public"."customers" to "service_role";

grant insert on table "public"."customers" to "service_role";

grant references on table "public"."customers" to "service_role";

grant select on table "public"."customers" to "service_role";

grant trigger on table "public"."customers" to "service_role";

grant truncate on table "public"."customers" to "service_role";

grant update on table "public"."customers" to "service_role";

grant delete on table "public"."employee_schedule_shifts" to "anon";

grant insert on table "public"."employee_schedule_shifts" to "anon";

grant references on table "public"."employee_schedule_shifts" to "anon";

grant select on table "public"."employee_schedule_shifts" to "anon";

grant trigger on table "public"."employee_schedule_shifts" to "anon";

grant truncate on table "public"."employee_schedule_shifts" to "anon";

grant update on table "public"."employee_schedule_shifts" to "anon";

grant delete on table "public"."employee_schedule_shifts" to "authenticated";

grant insert on table "public"."employee_schedule_shifts" to "authenticated";

grant references on table "public"."employee_schedule_shifts" to "authenticated";

grant select on table "public"."employee_schedule_shifts" to "authenticated";

grant trigger on table "public"."employee_schedule_shifts" to "authenticated";

grant truncate on table "public"."employee_schedule_shifts" to "authenticated";

grant update on table "public"."employee_schedule_shifts" to "authenticated";

grant delete on table "public"."employee_schedule_shifts" to "service_role";

grant insert on table "public"."employee_schedule_shifts" to "service_role";

grant references on table "public"."employee_schedule_shifts" to "service_role";

grant select on table "public"."employee_schedule_shifts" to "service_role";

grant trigger on table "public"."employee_schedule_shifts" to "service_role";

grant truncate on table "public"."employee_schedule_shifts" to "service_role";

grant update on table "public"."employee_schedule_shifts" to "service_role";

grant delete on table "public"."employee_time_logs" to "anon";

grant insert on table "public"."employee_time_logs" to "anon";

grant references on table "public"."employee_time_logs" to "anon";

grant select on table "public"."employee_time_logs" to "anon";

grant trigger on table "public"."employee_time_logs" to "anon";

grant truncate on table "public"."employee_time_logs" to "anon";

grant update on table "public"."employee_time_logs" to "anon";

grant delete on table "public"."employee_time_logs" to "authenticated";

grant insert on table "public"."employee_time_logs" to "authenticated";

grant references on table "public"."employee_time_logs" to "authenticated";

grant select on table "public"."employee_time_logs" to "authenticated";

grant trigger on table "public"."employee_time_logs" to "authenticated";

grant truncate on table "public"."employee_time_logs" to "authenticated";

grant update on table "public"."employee_time_logs" to "authenticated";

grant delete on table "public"."employee_time_logs" to "service_role";

grant insert on table "public"."employee_time_logs" to "service_role";

grant references on table "public"."employee_time_logs" to "service_role";

grant select on table "public"."employee_time_logs" to "service_role";

grant trigger on table "public"."employee_time_logs" to "service_role";

grant truncate on table "public"."employee_time_logs" to "service_role";

grant update on table "public"."employee_time_logs" to "service_role";

grant delete on table "public"."employees" to "anon";

grant insert on table "public"."employees" to "anon";

grant references on table "public"."employees" to "anon";

grant select on table "public"."employees" to "anon";

grant trigger on table "public"."employees" to "anon";

grant truncate on table "public"."employees" to "anon";

grant update on table "public"."employees" to "anon";

grant delete on table "public"."employees" to "authenticated";

grant insert on table "public"."employees" to "authenticated";

grant references on table "public"."employees" to "authenticated";

grant select on table "public"."employees" to "authenticated";

grant trigger on table "public"."employees" to "authenticated";

grant truncate on table "public"."employees" to "authenticated";

grant update on table "public"."employees" to "authenticated";

grant delete on table "public"."employees" to "service_role";

grant insert on table "public"."employees" to "service_role";

grant references on table "public"."employees" to "service_role";

grant select on table "public"."employees" to "service_role";

grant trigger on table "public"."employees" to "service_role";

grant truncate on table "public"."employees" to "service_role";

grant update on table "public"."employees" to "service_role";

grant delete on table "public"."inventory_items" to "anon";

grant insert on table "public"."inventory_items" to "anon";

grant references on table "public"."inventory_items" to "anon";

grant select on table "public"."inventory_items" to "anon";

grant trigger on table "public"."inventory_items" to "anon";

grant truncate on table "public"."inventory_items" to "anon";

grant update on table "public"."inventory_items" to "anon";

grant delete on table "public"."inventory_items" to "authenticated";

grant insert on table "public"."inventory_items" to "authenticated";

grant references on table "public"."inventory_items" to "authenticated";

grant select on table "public"."inventory_items" to "authenticated";

grant trigger on table "public"."inventory_items" to "authenticated";

grant truncate on table "public"."inventory_items" to "authenticated";

grant update on table "public"."inventory_items" to "authenticated";

grant delete on table "public"."inventory_items" to "service_role";

grant insert on table "public"."inventory_items" to "service_role";

grant references on table "public"."inventory_items" to "service_role";

grant select on table "public"."inventory_items" to "service_role";

grant trigger on table "public"."inventory_items" to "service_role";

grant truncate on table "public"."inventory_items" to "service_role";

grant update on table "public"."inventory_items" to "service_role";

grant delete on table "public"."inventory_movements" to "anon";

grant insert on table "public"."inventory_movements" to "anon";

grant references on table "public"."inventory_movements" to "anon";

grant select on table "public"."inventory_movements" to "anon";

grant trigger on table "public"."inventory_movements" to "anon";

grant truncate on table "public"."inventory_movements" to "anon";

grant update on table "public"."inventory_movements" to "anon";

grant delete on table "public"."inventory_movements" to "authenticated";

grant insert on table "public"."inventory_movements" to "authenticated";

grant references on table "public"."inventory_movements" to "authenticated";

grant select on table "public"."inventory_movements" to "authenticated";

grant trigger on table "public"."inventory_movements" to "authenticated";

grant truncate on table "public"."inventory_movements" to "authenticated";

grant update on table "public"."inventory_movements" to "authenticated";

grant delete on table "public"."inventory_movements" to "service_role";

grant insert on table "public"."inventory_movements" to "service_role";

grant references on table "public"."inventory_movements" to "service_role";

grant select on table "public"."inventory_movements" to "service_role";

grant trigger on table "public"."inventory_movements" to "service_role";

grant truncate on table "public"."inventory_movements" to "service_role";

grant update on table "public"."inventory_movements" to "service_role";

grant delete on table "public"."membership_benefit_products" to "anon";

grant insert on table "public"."membership_benefit_products" to "anon";

grant references on table "public"."membership_benefit_products" to "anon";

grant select on table "public"."membership_benefit_products" to "anon";

grant trigger on table "public"."membership_benefit_products" to "anon";

grant truncate on table "public"."membership_benefit_products" to "anon";

grant update on table "public"."membership_benefit_products" to "anon";

grant delete on table "public"."membership_benefit_products" to "authenticated";

grant insert on table "public"."membership_benefit_products" to "authenticated";

grant references on table "public"."membership_benefit_products" to "authenticated";

grant select on table "public"."membership_benefit_products" to "authenticated";

grant trigger on table "public"."membership_benefit_products" to "authenticated";

grant truncate on table "public"."membership_benefit_products" to "authenticated";

grant update on table "public"."membership_benefit_products" to "authenticated";

grant delete on table "public"."membership_benefit_products" to "service_role";

grant insert on table "public"."membership_benefit_products" to "service_role";

grant references on table "public"."membership_benefit_products" to "service_role";

grant select on table "public"."membership_benefit_products" to "service_role";

grant trigger on table "public"."membership_benefit_products" to "service_role";

grant truncate on table "public"."membership_benefit_products" to "service_role";

grant update on table "public"."membership_benefit_products" to "service_role";

grant delete on table "public"."membership_benefit_usage" to "anon";

grant insert on table "public"."membership_benefit_usage" to "anon";

grant references on table "public"."membership_benefit_usage" to "anon";

grant select on table "public"."membership_benefit_usage" to "anon";

grant trigger on table "public"."membership_benefit_usage" to "anon";

grant truncate on table "public"."membership_benefit_usage" to "anon";

grant update on table "public"."membership_benefit_usage" to "anon";

grant delete on table "public"."membership_benefit_usage" to "authenticated";

grant insert on table "public"."membership_benefit_usage" to "authenticated";

grant references on table "public"."membership_benefit_usage" to "authenticated";

grant select on table "public"."membership_benefit_usage" to "authenticated";

grant trigger on table "public"."membership_benefit_usage" to "authenticated";

grant truncate on table "public"."membership_benefit_usage" to "authenticated";

grant update on table "public"."membership_benefit_usage" to "authenticated";

grant delete on table "public"."membership_benefit_usage" to "service_role";

grant insert on table "public"."membership_benefit_usage" to "service_role";

grant references on table "public"."membership_benefit_usage" to "service_role";

grant select on table "public"."membership_benefit_usage" to "service_role";

grant trigger on table "public"."membership_benefit_usage" to "service_role";

grant truncate on table "public"."membership_benefit_usage" to "service_role";

grant update on table "public"."membership_benefit_usage" to "service_role";

grant delete on table "public"."membership_plan_benefits" to "anon";

grant insert on table "public"."membership_plan_benefits" to "anon";

grant references on table "public"."membership_plan_benefits" to "anon";

grant select on table "public"."membership_plan_benefits" to "anon";

grant trigger on table "public"."membership_plan_benefits" to "anon";

grant truncate on table "public"."membership_plan_benefits" to "anon";

grant update on table "public"."membership_plan_benefits" to "anon";

grant delete on table "public"."membership_plan_benefits" to "authenticated";

grant insert on table "public"."membership_plan_benefits" to "authenticated";

grant references on table "public"."membership_plan_benefits" to "authenticated";

grant select on table "public"."membership_plan_benefits" to "authenticated";

grant trigger on table "public"."membership_plan_benefits" to "authenticated";

grant truncate on table "public"."membership_plan_benefits" to "authenticated";

grant update on table "public"."membership_plan_benefits" to "authenticated";

grant delete on table "public"."membership_plan_benefits" to "service_role";

grant insert on table "public"."membership_plan_benefits" to "service_role";

grant references on table "public"."membership_plan_benefits" to "service_role";

grant select on table "public"."membership_plan_benefits" to "service_role";

grant trigger on table "public"."membership_plan_benefits" to "service_role";

grant truncate on table "public"."membership_plan_benefits" to "service_role";

grant update on table "public"."membership_plan_benefits" to "service_role";

grant delete on table "public"."membership_plans" to "anon";

grant insert on table "public"."membership_plans" to "anon";

grant references on table "public"."membership_plans" to "anon";

grant select on table "public"."membership_plans" to "anon";

grant trigger on table "public"."membership_plans" to "anon";

grant truncate on table "public"."membership_plans" to "anon";

grant update on table "public"."membership_plans" to "anon";

grant delete on table "public"."membership_plans" to "authenticated";

grant insert on table "public"."membership_plans" to "authenticated";

grant references on table "public"."membership_plans" to "authenticated";

grant select on table "public"."membership_plans" to "authenticated";

grant trigger on table "public"."membership_plans" to "authenticated";

grant truncate on table "public"."membership_plans" to "authenticated";

grant update on table "public"."membership_plans" to "authenticated";

grant delete on table "public"."membership_plans" to "service_role";

grant insert on table "public"."membership_plans" to "service_role";

grant references on table "public"."membership_plans" to "service_role";

grant select on table "public"."membership_plans" to "service_role";

grant trigger on table "public"."membership_plans" to "service_role";

grant truncate on table "public"."membership_plans" to "service_role";

grant update on table "public"."membership_plans" to "service_role";

grant delete on table "public"."payments" to "anon";

grant insert on table "public"."payments" to "anon";

grant references on table "public"."payments" to "anon";

grant select on table "public"."payments" to "anon";

grant trigger on table "public"."payments" to "anon";

grant truncate on table "public"."payments" to "anon";

grant update on table "public"."payments" to "anon";

grant delete on table "public"."payments" to "authenticated";

grant insert on table "public"."payments" to "authenticated";

grant references on table "public"."payments" to "authenticated";

grant select on table "public"."payments" to "authenticated";

grant trigger on table "public"."payments" to "authenticated";

grant truncate on table "public"."payments" to "authenticated";

grant update on table "public"."payments" to "authenticated";

grant delete on table "public"."payments" to "service_role";

grant insert on table "public"."payments" to "service_role";

grant references on table "public"."payments" to "service_role";

grant select on table "public"."payments" to "service_role";

grant trigger on table "public"."payments" to "service_role";

grant truncate on table "public"."payments" to "service_role";

grant update on table "public"."payments" to "service_role";

grant delete on table "public"."product_allowed_mixers" to "anon";

grant insert on table "public"."product_allowed_mixers" to "anon";

grant references on table "public"."product_allowed_mixers" to "anon";

grant select on table "public"."product_allowed_mixers" to "anon";

grant trigger on table "public"."product_allowed_mixers" to "anon";

grant truncate on table "public"."product_allowed_mixers" to "anon";

grant update on table "public"."product_allowed_mixers" to "anon";

grant delete on table "public"."product_allowed_mixers" to "authenticated";

grant insert on table "public"."product_allowed_mixers" to "authenticated";

grant references on table "public"."product_allowed_mixers" to "authenticated";

grant select on table "public"."product_allowed_mixers" to "authenticated";

grant trigger on table "public"."product_allowed_mixers" to "authenticated";

grant truncate on table "public"."product_allowed_mixers" to "authenticated";

grant update on table "public"."product_allowed_mixers" to "authenticated";

grant delete on table "public"."product_allowed_mixers" to "service_role";

grant insert on table "public"."product_allowed_mixers" to "service_role";

grant references on table "public"."product_allowed_mixers" to "service_role";

grant select on table "public"."product_allowed_mixers" to "service_role";

grant trigger on table "public"."product_allowed_mixers" to "service_role";

grant truncate on table "public"."product_allowed_mixers" to "service_role";

grant update on table "public"."product_allowed_mixers" to "service_role";

grant delete on table "public"."product_recipes" to "anon";

grant insert on table "public"."product_recipes" to "anon";

grant references on table "public"."product_recipes" to "anon";

grant select on table "public"."product_recipes" to "anon";

grant trigger on table "public"."product_recipes" to "anon";

grant truncate on table "public"."product_recipes" to "anon";

grant update on table "public"."product_recipes" to "anon";

grant delete on table "public"."product_recipes" to "authenticated";

grant insert on table "public"."product_recipes" to "authenticated";

grant references on table "public"."product_recipes" to "authenticated";

grant select on table "public"."product_recipes" to "authenticated";

grant trigger on table "public"."product_recipes" to "authenticated";

grant truncate on table "public"."product_recipes" to "authenticated";

grant update on table "public"."product_recipes" to "authenticated";

grant delete on table "public"."product_recipes" to "service_role";

grant insert on table "public"."product_recipes" to "service_role";

grant references on table "public"."product_recipes" to "service_role";

grant select on table "public"."product_recipes" to "service_role";

grant trigger on table "public"."product_recipes" to "service_role";

grant truncate on table "public"."product_recipes" to "service_role";

grant update on table "public"."product_recipes" to "service_role";

grant delete on table "public"."products" to "anon";

grant insert on table "public"."products" to "anon";

grant references on table "public"."products" to "anon";

grant select on table "public"."products" to "anon";

grant trigger on table "public"."products" to "anon";

grant truncate on table "public"."products" to "anon";

grant update on table "public"."products" to "anon";

grant delete on table "public"."products" to "authenticated";

grant insert on table "public"."products" to "authenticated";

grant references on table "public"."products" to "authenticated";

grant select on table "public"."products" to "authenticated";

grant trigger on table "public"."products" to "authenticated";

grant truncate on table "public"."products" to "authenticated";

grant update on table "public"."products" to "authenticated";

grant delete on table "public"."products" to "service_role";

grant insert on table "public"."products" to "service_role";

grant references on table "public"."products" to "service_role";

grant select on table "public"."products" to "service_role";

grant trigger on table "public"."products" to "service_role";

grant truncate on table "public"."products" to "service_role";

grant update on table "public"."products" to "service_role";

grant delete on table "public"."shifts" to "anon";

grant insert on table "public"."shifts" to "anon";

grant references on table "public"."shifts" to "anon";

grant select on table "public"."shifts" to "anon";

grant trigger on table "public"."shifts" to "anon";

grant truncate on table "public"."shifts" to "anon";

grant update on table "public"."shifts" to "anon";

grant delete on table "public"."shifts" to "authenticated";

grant insert on table "public"."shifts" to "authenticated";

grant references on table "public"."shifts" to "authenticated";

grant select on table "public"."shifts" to "authenticated";

grant trigger on table "public"."shifts" to "authenticated";

grant truncate on table "public"."shifts" to "authenticated";

grant update on table "public"."shifts" to "authenticated";

grant delete on table "public"."shifts" to "service_role";

grant insert on table "public"."shifts" to "service_role";

grant references on table "public"."shifts" to "service_role";

grant select on table "public"."shifts" to "service_role";

grant trigger on table "public"."shifts" to "service_role";

grant truncate on table "public"."shifts" to "service_role";

grant update on table "public"."shifts" to "service_role";

grant delete on table "public"."units" to "anon";

grant insert on table "public"."units" to "anon";

grant references on table "public"."units" to "anon";

grant select on table "public"."units" to "anon";

grant trigger on table "public"."units" to "anon";

grant truncate on table "public"."units" to "anon";

grant update on table "public"."units" to "anon";

grant delete on table "public"."units" to "authenticated";

grant insert on table "public"."units" to "authenticated";

grant references on table "public"."units" to "authenticated";

grant select on table "public"."units" to "authenticated";

grant trigger on table "public"."units" to "authenticated";

grant truncate on table "public"."units" to "authenticated";

grant update on table "public"."units" to "authenticated";

grant delete on table "public"."units" to "service_role";

grant insert on table "public"."units" to "service_role";

grant references on table "public"."units" to "service_role";

grant select on table "public"."units" to "service_role";

grant trigger on table "public"."units" to "service_role";

grant truncate on table "public"."units" to "service_role";

grant update on table "public"."units" to "service_role";

grant delete on table "public"."users" to "anon";

grant insert on table "public"."users" to "anon";

grant references on table "public"."users" to "anon";

grant select on table "public"."users" to "anon";

grant trigger on table "public"."users" to "anon";

grant truncate on table "public"."users" to "anon";

grant update on table "public"."users" to "anon";

grant delete on table "public"."users" to "authenticated";

grant insert on table "public"."users" to "authenticated";

grant references on table "public"."users" to "authenticated";

grant select on table "public"."users" to "authenticated";

grant trigger on table "public"."users" to "authenticated";

grant truncate on table "public"."users" to "authenticated";

grant update on table "public"."users" to "authenticated";

grant delete on table "public"."users" to "service_role";

grant insert on table "public"."users" to "service_role";

grant references on table "public"."users" to "service_role";

grant select on table "public"."users" to "service_role";

grant trigger on table "public"."users" to "service_role";

grant truncate on table "public"."users" to "service_role";

grant update on table "public"."users" to "service_role";


  create policy "cash_movements_insert"
  on "public"."cash_movements"
  as permissive
  for insert
  to anon
with check (true);



  create policy "cash_movements_select"
  on "public"."cash_movements"
  as permissive
  for select
  to anon
using (true);



  create policy "categories_delete"
  on "public"."categories"
  as permissive
  for delete
  to anon
using (true);



  create policy "categories_insert"
  on "public"."categories"
  as permissive
  for insert
  to anon
with check (true);



  create policy "categories_select"
  on "public"."categories"
  as permissive
  for select
  to anon
using (true);



  create policy "categories_update"
  on "public"."categories"
  as permissive
  for update
  to anon
using (true);



  create policy "comanda_events_insert"
  on "public"."comanda_events"
  as permissive
  for insert
  to anon
with check (true);



  create policy "comanda_events_select"
  on "public"."comanda_events"
  as permissive
  for select
  to anon
using (true);



  create policy "allow_public_insert"
  on "public"."comanda_items"
  as permissive
  for insert
  to public
with check (true);



  create policy "allow_public_select"
  on "public"."comanda_items"
  as permissive
  for select
  to public
using (true);



  create policy "allow_public_update"
  on "public"."comanda_items"
  as permissive
  for update
  to public
using (true)
with check (true);



  create policy "comanda_items_delete"
  on "public"."comanda_items"
  as permissive
  for delete
  to anon
using (true);



  create policy "comanda_items_insert"
  on "public"."comanda_items"
  as permissive
  for insert
  to anon
with check (true);



  create policy "comanda_items_select"
  on "public"."comanda_items"
  as permissive
  for select
  to anon
using (true);



  create policy "comanda_items_update"
  on "public"."comanda_items"
  as permissive
  for update
  to anon
using (true);



  create policy "allow_public_insert"
  on "public"."comandas"
  as permissive
  for insert
  to public
with check (true);



  create policy "allow_public_select"
  on "public"."comandas"
  as permissive
  for select
  to public
using (true);



  create policy "comandas_insert"
  on "public"."comandas"
  as permissive
  for insert
  to anon
with check (true);



  create policy "comandas_select"
  on "public"."comandas"
  as permissive
  for select
  to anon
using (true);



  create policy "comandas_update"
  on "public"."comandas"
  as permissive
  for update
  to anon
using (true);



  create policy "memberships_insert"
  on "public"."customer_memberships"
  as permissive
  for insert
  to anon
with check (true);



  create policy "memberships_select"
  on "public"."customer_memberships"
  as permissive
  for select
  to anon
using (true);



  create policy "memberships_update"
  on "public"."customer_memberships"
  as permissive
  for update
  to anon
using (true);



  create policy "customers_insert"
  on "public"."customers"
  as permissive
  for insert
  to anon
with check (true);



  create policy "customers_select"
  on "public"."customers"
  as permissive
  for select
  to anon
using (true);



  create policy "customers_update"
  on "public"."customers"
  as permissive
  for update
  to anon
using (true);



  create policy "allow_all_schedule_shifts"
  on "public"."employee_schedule_shifts"
  as permissive
  for all
  to public
using (true)
with check (true);



  create policy "allow_all_employee_time_logs"
  on "public"."employee_time_logs"
  as permissive
  for all
  to public
using (true)
with check (true);



  create policy "allow_all_employees"
  on "public"."employees"
  as permissive
  for all
  to public
using (true)
with check (true);



  create policy "inventory_items_insert"
  on "public"."inventory_items"
  as permissive
  for insert
  to anon
with check (true);



  create policy "inventory_items_select"
  on "public"."inventory_items"
  as permissive
  for select
  to anon
using (true);



  create policy "inventory_items_update"
  on "public"."inventory_items"
  as permissive
  for update
  to anon
using (true);



  create policy "allow_public_insert"
  on "public"."inventory_movements"
  as permissive
  for insert
  to public
with check (true);



  create policy "inventory_movements_insert"
  on "public"."inventory_movements"
  as permissive
  for insert
  to anon
with check (true);



  create policy "inventory_movements_select"
  on "public"."inventory_movements"
  as permissive
  for select
  to anon
using (true);



  create policy "benefit_products_delete"
  on "public"."membership_benefit_products"
  as permissive
  for delete
  to anon
using (true);



  create policy "benefit_products_insert"
  on "public"."membership_benefit_products"
  as permissive
  for insert
  to anon
with check (true);



  create policy "benefit_products_select"
  on "public"."membership_benefit_products"
  as permissive
  for select
  to anon
using (true);



  create policy "benefit_usage_insert"
  on "public"."membership_benefit_usage"
  as permissive
  for insert
  to anon
with check (true);



  create policy "benefit_usage_select"
  on "public"."membership_benefit_usage"
  as permissive
  for select
  to anon
using (true);



  create policy "plan_benefits_delete"
  on "public"."membership_plan_benefits"
  as permissive
  for delete
  to anon
using (true);



  create policy "plan_benefits_insert"
  on "public"."membership_plan_benefits"
  as permissive
  for insert
  to anon
with check (true);



  create policy "plan_benefits_select"
  on "public"."membership_plan_benefits"
  as permissive
  for select
  to anon
using (true);



  create policy "plan_benefits_update"
  on "public"."membership_plan_benefits"
  as permissive
  for update
  to anon
using (true);



  create policy "plans_insert"
  on "public"."membership_plans"
  as permissive
  for insert
  to anon
with check (true);



  create policy "plans_select"
  on "public"."membership_plans"
  as permissive
  for select
  to anon
using (true);



  create policy "plans_update"
  on "public"."membership_plans"
  as permissive
  for update
  to anon
using (true);



  create policy "allow_public_insert"
  on "public"."payments"
  as permissive
  for insert
  to public
with check (true);



  create policy "allow_public_select"
  on "public"."payments"
  as permissive
  for select
  to public
using (true);



  create policy "allow_public_update"
  on "public"."payments"
  as permissive
  for update
  to public
using (true)
with check (true);



  create policy "payments_insert"
  on "public"."payments"
  as permissive
  for insert
  to anon
with check (true);



  create policy "payments_select"
  on "public"."payments"
  as permissive
  for select
  to anon
using (true);



  create policy "mixers_delete"
  on "public"."product_allowed_mixers"
  as permissive
  for delete
  to anon
using (true);



  create policy "mixers_insert"
  on "public"."product_allowed_mixers"
  as permissive
  for insert
  to anon
with check (true);



  create policy "mixers_select"
  on "public"."product_allowed_mixers"
  as permissive
  for select
  to anon
using (true);



  create policy "mixers_update"
  on "public"."product_allowed_mixers"
  as permissive
  for update
  to anon
using (true);



  create policy "recipes_delete"
  on "public"."product_recipes"
  as permissive
  for delete
  to anon
using (true);



  create policy "recipes_insert"
  on "public"."product_recipes"
  as permissive
  for insert
  to anon
with check (true);



  create policy "recipes_select"
  on "public"."product_recipes"
  as permissive
  for select
  to anon
using (true);



  create policy "recipes_update"
  on "public"."product_recipes"
  as permissive
  for update
  to anon
using (true);



  create policy "allow_public_select"
  on "public"."products"
  as permissive
  for select
  to public
using (true);



  create policy "products_delete"
  on "public"."products"
  as permissive
  for delete
  to anon
using (true);



  create policy "products_insert"
  on "public"."products"
  as permissive
  for insert
  to anon
with check (true);



  create policy "products_select"
  on "public"."products"
  as permissive
  for select
  to anon
using (true);



  create policy "products_update"
  on "public"."products"
  as permissive
  for update
  to anon
using (true);



  create policy "shifts_insert"
  on "public"."shifts"
  as permissive
  for insert
  to anon
with check (true);



  create policy "shifts_select"
  on "public"."shifts"
  as permissive
  for select
  to anon
using (true);



  create policy "shifts_update"
  on "public"."shifts"
  as permissive
  for update
  to anon
using (true);



  create policy "allow_public_select"
  on "public"."units"
  as permissive
  for select
  to public
using (true);



  create policy "units_delete"
  on "public"."units"
  as permissive
  for delete
  to anon
using (true);



  create policy "units_insert"
  on "public"."units"
  as permissive
  for insert
  to anon
with check (true);



  create policy "units_select"
  on "public"."units"
  as permissive
  for select
  to anon
using (true);



  create policy "units_update"
  on "public"."units"
  as permissive
  for update
  to anon
using (true);



  create policy "allow_public_select_users"
  on "public"."users"
  as permissive
  for select
  to public
using (true);



  create policy "users_insert"
  on "public"."users"
  as permissive
  for insert
  to anon
with check (true);



  create policy "users_select"
  on "public"."users"
  as permissive
  for select
  to anon
using (true);



  create policy "users_update"
  on "public"."users"
  as permissive
  for update
  to anon
using (true);


CREATE TRIGGER trg_assign_comanda_folio BEFORE INSERT ON public.comandas FOR EACH ROW EXECUTE FUNCTION public.assign_comanda_folio();


