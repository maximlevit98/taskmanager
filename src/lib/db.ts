import { Pool, type QueryResult, type QueryResultRow } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});

const schema = `
create table if not exists users (
  id uuid primary key,
  name text not null,
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('owner', 'member', 'approver', 'publisher')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create unique index if not exists one_approver_per_project
  on project_members (project_id)
  where role = 'approver';

create table if not exists accounts (
  id uuid primary key,
  project_id uuid not null references projects(id) on delete cascade,
  platform text not null,
  handle text not null,
  kind text not null default '',
  owner_user_id uuid references users(id) on delete set null,
  connected boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists units (
  id uuid primary key,
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  body text not null default '',
  content_type text,
  account_id uuid references accounts(id) on delete set null,
  slot_at timestamptz,
  tone text not null default 'sand',
  status text not null default 'idea',
  gate text not null default 'none',
  version int not null default 1,
  approved_version int,
  approved_by uuid references users(id),
  approved_at timestamptz,
  return_reason text,
  outcome text,
  outcome_reason text,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table if not exists unit_people (
  unit_id uuid not null references units(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  task text not null default '',
  primary key (unit_id, user_id)
);

create table if not exists unit_comments (
  id uuid primary key,
  unit_id uuid not null references units(id) on delete cascade,
  user_id uuid not null references users(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists unit_links (
  id uuid primary key,
  unit_id uuid not null references units(id) on delete cascade,
  url text not null,
  label text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists unit_events (
  id uuid primary key,
  unit_id uuid not null references units(id) on delete cascade,
  user_id uuid references users(id),
  kind text not null,
  note text not null default '',
  version int not null,
  created_at timestamptz not null default now()
);

create table if not exists project_invites (
  id uuid primary key,
  project_id uuid not null references projects(id) on delete cascade,
  email text not null,
  role text not null check (role in ('member', 'approver', 'publisher')),
  created_at timestamptz not null default now(),
  unique (project_id, email)
);
`;

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(schema);
  } finally {
    client.release();
  }
}

let ready: Promise<void> | null = null;

export function ensureDb() {
  if (!ready) {
    ready = (async () => {
      let last: unknown;
      for (let i = 0; i < 30; i++) {
        try {
          await migrate();
          return;
        } catch (error) {
          last = error;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      throw last;
    })();
  }
  return ready;
}

export type Sql = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) => Promise<QueryResult<T>>;

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  await ensureDb();
  return pool.query<T>(text, params);
}

export async function transaction<T>(run: (sql: Sql) => Promise<T>): Promise<T> {
  await ensureDb();
  const client = await pool.connect();
  const sql: Sql = (text, params = []) => client.query(text, params);
  try {
    await client.query("begin");
    const value = await run(sql);
    await client.query("commit");
    return value;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
