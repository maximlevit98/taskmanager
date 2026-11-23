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

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  await ensureDb();
  return pool.query<T>(text, params);
}

export function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
