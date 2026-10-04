#!/usr/bin/env python3
"""Two real PostgreSQL sessions in a fresh disposable CI database only."""
import json
import os
import subprocess
import time

from build_operational_replay_test import setup, scenarios

if os.environ.get('CI') != 'true' or os.environ.get('PGHOST') != 'localhost':
    raise SystemExit('Requires CI=true and PGHOST=localhost; never run against Supabase.')

DB = 'operational_lock_test'


def sql(query):
    return subprocess.check_output(['psql', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-d', DB, '-c', query], text=True).strip()


subprocess.run(['createdb', DB], check=True)
try:
    # Existing acceptance fixtures, committed only in this separate ephemeral database.
    fixture = setup() + scenarios().replace('ROLLBACK;', 'COMMIT;')
    subprocess.run(['psql', '-Xq', '-v', 'ON_ERROR_STOP=1', '-d', DB], input=fixture, text=True, check=True, stdout=subprocess.DEVNULL)
    sql("UPDATE public.leader_user_profiles SET role='manager' WHERE user_id='b7311000-0000-4000-8000-000000000001'")
    for kind, prefix in [('production', 'b7311000'), ('installation', 'b7313000')]:
        order = prefix + '-0000-4000-8000-000000000003'
        actor = prefix + '-0000-4000-8000-000000000001'
        job, revision = sql(f"SELECT id,updated_at FROM public.leader_{kind}_jobs WHERE order_id='{order}'").split('|')
        request = json.dumps({'actor_id': actor, 'request': {'action': kind + '_job.update',
            'request_id': prefix + '-0000-4000-8000-000000000099', 'expected_updated_at': revision,
            'payload': {'job_id': job, 'idempotency_key': 'lock-order-' + kind,
                        'patch': {'title': 'LIDER concurrency proof'}}}})
        # Session A models a create/close command: it holds order, then needs job.
        a = subprocess.Popen(['psql', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-d', DB],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        b = None
        try:
            a.stdin.write(f"BEGIN; SELECT id FROM public.leader_orders WHERE id='{order}' FOR UPDATE;\n")
            a.stdin.flush()
            assert a.stdout.readline().strip() == order, 'order lock was not acquired'
            env = dict(os.environ, PGAPPNAME='operational-lock-' + kind)
            # Session B runs the actual upgraded update RPC, not a hand-written lock imitation.
            b = subprocess.Popen(['psql', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-d', DB,
                '-c', f"SELECT public.leader_update_{kind}_job_rpc('{request}'::jsonb)"],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
            deadline = time.monotonic() + 10
            while sql(f"SELECT count(*) FROM pg_stat_activity WHERE application_name='operational-lock-{kind}' AND wait_event_type='Lock'") != '1':
                if time.monotonic() > deadline or b.poll() is not None:
                    raise AssertionError('update did not wait for the order lock')
                time.sleep(0.05)
            # Old job-first update holds job while waiting for order: this statement times out.
            a.stdin.write(f"SET LOCAL lock_timeout='2s'; SELECT id FROM public.leader_{kind}_jobs WHERE id='{job}' FOR UPDATE; COMMIT;\n")
            a.stdin.flush()
            assert a.stdout.readline().strip() == job, 'order/job lock inversion'
            a.stdin.close()
            assert a.wait(timeout=5) == 0, a.stderr.read()
            output, error = b.communicate(timeout=10)
            assert b.returncode == 0, error
            response = json.loads(output)
            assert response.get('ok') is True, response
            print(kind + ': actual concurrent order → job lock PASS')
        finally:
            for process in [a, b]:
                if process is not None and process.poll() is None:
                    process.kill()
                    process.wait()
finally:
    subprocess.run(['dropdb', '--force', DB], check=True)
