-- Cinderblock — step-up brute-force cap (migration 0160). Green = fixed.
-- Uses max_attempts = 3 to keep the loop short. Self-contained seed.

begin;
select plan(7);

select tests.reset_auth();
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('aaaa1111-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stepup-init@example.test', now(), now()),
  ('aaaa1111-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stepup-target@example.test', now(), now());
insert into public.workspaces (id, slug, name, created_by) values
  ('bbbb2222-0000-0000-0000-0000000000d1','stepup','StepUp','aaaa1111-0000-0000-0000-0000000000d1');

-- code #1 — correct hash verifies and is consumed
insert into public.step_up_codes (workspace_id, initiated_by, target_user_id, purpose, code_hash, expires_at)
  values ('bbbb2222-0000-0000-0000-0000000000d1','aaaa1111-0000-0000-0000-0000000000d1',
          'aaaa1111-0000-0000-0000-0000000000d2','impersonation', '\x1111'::bytea, now() + interval '5 min');
select is(
  public.verify_step_up_code('bbbb2222-0000-0000-0000-0000000000d1','aaaa1111-0000-0000-0000-0000000000d1',
    'aaaa1111-0000-0000-0000-0000000000d2','impersonation', '\x1111'::bytea, 3),
  'ok', '0160: correct code verifies');
select is(
  (select count(*)::int from public.step_up_codes
     where code_hash = '\x1111'::bytea and used_at is not null),
  1, '0160: a verified code is consumed (used_at set)');

-- code #2 — wrong guesses are counted and the code is BURNED at the cap
insert into public.step_up_codes (workspace_id, initiated_by, target_user_id, purpose, code_hash, expires_at)
  values ('bbbb2222-0000-0000-0000-0000000000d1','aaaa1111-0000-0000-0000-0000000000d1',
          'aaaa1111-0000-0000-0000-0000000000d2','impersonation', '\x2222'::bytea, now() + interval '5 min');
select is(
  public.verify_step_up_code('bbbb2222-0000-0000-0000-0000000000d1','aaaa1111-0000-0000-0000-0000000000d1',
    'aaaa1111-0000-0000-0000-0000000000d2','impersonation', '\x9999'::bytea, 3),
  'bad_code', '0160: wrong guess #1 -> bad_code');
select is(
  public.verify_step_up_code('bbbb2222-0000-0000-0000-0000000000d1','aaaa1111-0000-0000-0000-0000000000d1',
    'aaaa1111-0000-0000-0000-0000000000d2','impersonation', '\x9999'::bytea, 3),
  'bad_code', '0160: wrong guess #2 -> bad_code');
select is(
  public.verify_step_up_code('bbbb2222-0000-0000-0000-0000000000d1','aaaa1111-0000-0000-0000-0000000000d1',
    'aaaa1111-0000-0000-0000-0000000000d2','impersonation', '\x9999'::bytea, 3),
  'locked', '0160: wrong guess #3 (cap) -> locked, code burned');

-- the correct code no longer works once burned — brute force can't outlast the cap
select is(
  public.verify_step_up_code('bbbb2222-0000-0000-0000-0000000000d1','aaaa1111-0000-0000-0000-0000000000d1',
    'aaaa1111-0000-0000-0000-0000000000d2','impersonation', '\x2222'::bytea, 3),
  'no_code', '0160: burned code is gone even for the correct hash');

select ok(
  not has_function_privilege('authenticated',
    'public.verify_step_up_code(uuid,uuid,uuid,text,bytea,int)', 'execute'),
  '0160: verify_step_up_code is not callable by authenticated');

select * from finish();
rollback;
