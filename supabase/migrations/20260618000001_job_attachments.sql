-- Job-level photos/receipts captured by a worker in the field. Per-worker
-- ownership; store-only (no OCR). Files live in the private 'job-files' bucket.
create table job_attachments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  job_id          uuid not null references jobs (id) on delete cascade,
  worker_user_id  uuid not null references auth.users (id) on delete cascade,
  storage_path    text not null,
  label           text not null,
  filename        text,
  mime_type       text,
  size_bytes      bigint,
  status          text not null default 'queued' check (status in ('queued', 'uploaded')),
  added_at        timestamptz not null default now(),
  uploaded_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index on job_attachments (organization_id, job_id);

alter table job_attachments enable row level security;

-- Worker manages only their own photos; admin can read all (for the pre-invoice).
create policy worker_rw on job_attachments for all to authenticated
  using (worker_user_id = auth.uid() and is_tb_member(organization_id))
  with check (worker_user_id = auth.uid() and is_tb_member(organization_id));
create policy admin_read on job_attachments for select to authenticated
  using (is_tb_admin(organization_id));

-- Private bucket for T&B job files (photos/receipts).
insert into storage.buckets (id, name, public)
values ('job-files', 'job-files', false)
on conflict (id) do nothing;

-- Any T&B member may read/write/delete objects within their org's top-level folder.
-- Per-worker ownership of the metadata is enforced on job_attachments (above).
create policy "tb member rw job files" on storage.objects for all to authenticated
  using (
    bucket_id = 'job-files'
    and is_tb_member(nullif((storage.foldername(name))[1], '')::uuid)
  )
  with check (
    bucket_id = 'job-files'
    and is_tb_member(nullif((storage.foldername(name))[1], '')::uuid)
  );
