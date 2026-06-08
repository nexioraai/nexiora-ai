create table if not exists customers (
id uuid primary key default gen_random_uuid(),
company_name text,
contact_name text,
phone text,
email text,
address text,
city text,
country text,
created_at timestamp default now()
);

create table if not exists suppliers (
id uuid primary key default gen_random_uuid(),
company_name text,
contact_name text,
phone text,
email text,
country text,
payment_terms text,
created_at timestamp default now()
);

create table if not exists products (
id uuid primary key default gen_random_uuid(),
part_number text,
part_name text,
category text,
purchase_price numeric,
selling_price numeric,
stock_quantity integer default 0,
created_at timestamp default now()
);

create table if not exists inventory (
id uuid primary key default gen_random_uuid(),
product_id uuid,
warehouse_location text,
quantity_on_hand integer,

quantity_reserved integer,
created_at timestamp default now()
);

create table if not exists invoices (
id uuid primary key default gen_random_uuid(),
invoice_number text,
customer_id uuid,
total_amount numeric,
payment_status text,
due_date date,
created_at timestamp default now()
);

