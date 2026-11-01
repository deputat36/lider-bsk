"""Scoped Leader snapshot/data drill. Never a whole-project restore or deployment.

All generated data SQL is private. No business triggers, workers, RPCs, Auth or
production grants are installed in the drill namespace. Only explicit number
sequences are remapped; other source defaults are deliberately omitted.
"""
from __future__ import annotations
import argparse
import base64
import hashlib
import json
import re
from pathlib import Path

PRODUCTION = 'ofewxuqfjhamgerwzull'
FORMAT = 'leader-scoped-snapshot-v1'
TYPES = {'uuid', 'text', 'text[]', 'boolean', 'integer', 'bigint', 'numeric',
         'numeric(14,2)', 'date', 'time without time zone', 'timestamp with time zone'}
EXCLUDED = {
    'public.leader_backups': 'Historical nested backups, kept in the encrypted snapshot only',
    'leader_private.leader_rollout_backups': 'Historical nested backups, kept encrypted only',
    'leader_private.leader_notification_config': 'Live keys and outbound configuration',
    'leader_private.leader_public_intake_config': 'Live intake salt',
    'leader_private.leader_push_subscriptions': 'Live endpoints and delivery keys',
    'leader_private.leader_notification_events': 'Live notification workflow',
    'leader_private.leader_notification_outbox': 'Live notification workflow',
    'leader_private.leader_notification_wakeups': 'Live notification workflow',
    'leader_private.leader_public_intake_rate_limit_receipts': 'Live rate-limit state',
}
FUNCTIONS = {'check', 'char_length', 'length', 'jsonb_typeof', 'cardinality',
             'position', 'any', 'all', 'in', 'array', 'not', 'or', 'and'}


def ident(value):
    if not re.fullmatch(r'[a-z_][a-z_0-9]{0,62}', value):
        raise ValueError('Unsafe identifier')
    return '"' + value + '"'


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def dollar(value):
    tag = '$leader_' + hashlib.sha256(value.encode()).hexdigest()[:24] + '$'
    if tag in value:
        raise ValueError('Unexpected SQL delimiter collision')
    return tag + value + tag


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def table_key(t):
    return t['schema'] + '.' + t['name']


def scope_key(key):
    schema, name = key.split('.')
    if not ((schema == 'public' and name.startswith('leader_')) or schema == 'leader_private'):
        raise ValueError('Object outside Leader scope')
    ident(schema); ident(name)
    return schema, name


def target_schema(schema):
    if not re.fullmatch(r'leader_restore_drill_[0-9]{8}(?:_[a-z0-9]{6,12})?', schema):
        raise ValueError('A fresh dedicated Leader drill namespace is required')
    return ident(schema)


def normalized_sql(sql):
    return sql.strip().removesuffix(';')


def snapshot_sql(tables, sequences, metadata_sql=None, structure_sql=None):
    """One MVCC SELECT. A random one-time data key is wrapped offline by RSA.

    No persistent data or schema changes. Sequence state is non-MVCC and is
    recorded separately; both the order and IDENTITY offer counters are included.
    The result MUST NOT be printed or committed: it contains a transient data key.
    """
    root = Path(__file__).parent
    metadata_sql = metadata_sql or (root / 'inventory.sql').read_text()
    structure_sql = structure_sql or (root / 'structure.sql').read_text()
    rows = []
    for t in tables:
        key = table_key(t); schema, name = scope_key(key)
        rows.append(f"select {literal(key)} name, count(*) n, coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text data_json from {ident(schema)}.{ident(name)} t")
    seqrows = []
    for seq in sequences:
        key = table_key(seq); schema, name = scope_key(key)
        seqrows.append(f"select jsonb_build_object('schema',{literal(schema)},'name',{literal(name)},'last_value',v.last_value::text,'is_called',v.is_called,'type',format_type(s.seqtypid,null),'start',s.seqstart::text,'increment',s.seqincrement::text,'min',s.seqmin::text,'max',s.seqmax::text,'cache',s.seqcache::text,'cycle',s.seqcycle,'owned_schema',tn.nspname,'owned_table',c.relname,'owned_column',a.attname,'dependency_type',d.deptype) value from {ident(schema)}.{ident(name)} v join pg_sequence s on s.seqrelid={literal(key)}::regclass left join pg_depend d on d.objid=s.seqrelid and d.classid='pg_class'::regclass and d.refclassid='pg_class'::regclass and d.deptype in ('a','i') left join pg_class c on c.oid=d.refobjid left join pg_namespace tn on tn.oid=c.relnamespace left join pg_attribute a on a.attrelid=c.oid and a.attnum=d.refobjsubid")
    sequence_sql = ' union all '.join(seqrows) or "select null::jsonb value where false"
    return f"""with rows as materialized ({' union all '.join(rows)}),
metadata as materialized ({normalized_sql(metadata_sql)}),
structure as materialized ({normalized_sql(structure_sql)}),
sequence_rows as materialized ({sequence_sql}),
payload as materialized (select jsonb_build_object(
 'format',{literal(FORMAT)},'project',{literal(PRODUCTION)},'captured_at',statement_timestamp(),
 'consistency','Single MVCC SELECT; sequences are non-MVCC',
 'data',(select jsonb_object_agg(name,jsonb_build_object('rows',n,'data_json',data_json,'sha256',encode(extensions.digest(data_json,'sha256'),'hex'))) from rows),
 'metadata',(select result from metadata),'structure',(select result from structure),
 'sequences',(select coalesce(jsonb_agg(value),'[]') from sequence_rows),
 'function_sources',(select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'definition',pg_get_functiondef(p.oid))),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind in ('f','p') and ((n.nspname='public' and left(p.proname,7)='leader_') or n.nspname='leader_private')),
 'cron',(select coalesce(jsonb_agg(to_jsonb(j)),'[]') from cron.job j where lower(jobname) like '%leader%'),
 'migration_versions',(select coalesce(jsonb_agg(jsonb_build_object('version',version,'name',name)),'[]') from supabase_migrations.schema_migrations where name ilike '%leader%')
 )::text value),
secret as materialized (select encode(extensions.gen_random_bytes(32),'hex') value),
sealed as materialized (select extensions.pgp_sym_encrypt(payload.value,secret.value,'cipher-algo=aes256,compress-algo=1,unicode-mode=1') cipher,secret.value data_key,payload.value cleartext from payload cross join secret)
select jsonb_build_object('ciphertext',encode(cipher,'base64'),'data_key',data_key,
 'plaintext_sha256',encode(extensions.digest(cleartext,'sha256'),'hex'),
 'plaintext_bytes',octet_length(cleartext),
 'ciphertext_sha256',encode(extensions.digest(cipher,'sha256'),'hex'),
 'captured_at',(cleartext::jsonb)->>'captured_at',
 'counts',(select jsonb_object_agg(name,n) from rows)) result from sealed;"""


def validate(snapshot, schema):
    ns = target_schema(schema)
    if snapshot['format'] != FORMAT or snapshot['project'] != PRODUCTION:
        raise ValueError('Wrong snapshot scope/format')
    tables = snapshot['metadata']['tables']
    keys = [table_key(t) for t in tables]
    if len(set(t['name'] for t in tables)) != len(tables):
        raise ValueError('Source namespace collision; do not flatten implicitly')
    if set(keys) != set(snapshot['data']):
        raise ValueError('Metadata/data scope changed during preparation')
    for t in tables:
        key = table_key(t); scope_key(key)
        row = snapshot['data'][key]
        if digest(row['data_json']) != row['sha256']:
            raise ValueError('Snapshot table digest mismatch')
        # Preserve numeric lexical data_json. Never parse/reencode floats here.
        count = len(json.loads(row['data_json'], parse_float=str))
        if count != row['rows']:
            raise ValueError('Snapshot row count mismatch')
        for col in t['columns']:
            ident(col['name'])
            if col['type'] not in TYPES or col['generated']:
                raise ValueError('Unsupported generated column/type')
        for c in t['constraints']:
            ident(c['name'])
            if c['type'] == 'f':
                target = c['target_schema'] + '.' + c['target_table']
                if target not in keys or not c['validated']:
                    raise ValueError('External or unvalidated source FK')
                if not c['columns'] or len(c['columns']) != len(c['target_columns']):
                    raise ValueError('Invalid FK metadata')
            elif c['type'] == 'c':
                # Only immutable built-in expressions; no source object calls.
                expression = re.sub(r"'(?:[^']|'')*'", "''", c['definition'])
                if re.search(r'\b[a-z_][a-z_0-9]*\s*\.', expression, re.I) or ';' in expression or '--' in expression:
                    raise ValueError('Qualified/unsafe CHECK expression')
                calls = {m.lower() for m in re.findall(r'\b([a-z_][a-z_0-9]*)\s*\(', expression, re.I)}
                if calls - FUNCTIONS:
                    raise ValueError('Unsupported CHECK function: ' + ','.join(calls - FUNCTIONS))
            elif c['type'] not in {'p', 'u'}:
                raise ValueError('Unsupported constraint')
    for s in snapshot['sequences']:
        scope_key(table_key(s))
        if s['type'] not in {'integer', 'bigint'} or s['cycle'] or int(s['increment']) <= 0:
            raise ValueError('Unsupported sequence')
    return ns, tables


def marker(snapshot):
    return 'Leader data restore drill v1; ' + snapshot['captured_at']


def begin():
    return "BEGIN;\nSET LOCAL lock_timeout='3s';\nSET LOCAL statement_timeout='45s';\nSET LOCAL timezone='UTC';\nSET LOCAL search_path=pg_catalog;\n"


def guard(snapshot, schema):
    return f"DO $guard$ BEGIN IF obj_description(to_regnamespace({literal(schema)}),'pg_namespace') IS DISTINCT FROM {literal(marker(snapshot))} THEN RAISE EXCEPTION 'drill_namespace_identity_mismatch'; END IF; END $guard$;\n"


def prepare(snapshot, schema):
    ns, tables = validate(snapshot, schema)
    out = [begin(), f'CREATE SCHEMA {ns};\n', f'COMMENT ON SCHEMA {ns} IS {literal(marker(snapshot))};\n',
           f'REVOKE ALL ON SCHEMA {ns} FROM PUBLIC,anon,authenticated,service_role;\n',
           f'ALTER DEFAULT PRIVILEGES IN SCHEMA {ns} REVOKE ALL ON TABLES FROM PUBLIC,anon,authenticated,service_role;\n',
           f'ALTER DEFAULT PRIVILEGES IN SCHEMA {ns} REVOKE ALL ON SEQUENCES FROM PUBLIC,anon,authenticated,service_role;\n']
    sequences = {table_key(s): s for s in snapshot['sequences']}
    identity_sequences = {(s['owned_schema'], s['owned_table'], s['owned_column']): s for s in sequences.values() if s['dependency_type'] == 'i'}
    for s in sequences.values():
        if s['dependency_type'] != 'i':
            out.append(f"CREATE SEQUENCE {ns}.{ident(s['name'])} AS {s['type']} START WITH {int(s['start'])} INCREMENT BY {int(s['increment'])} MINVALUE {int(s['min'])} MAXVALUE {int(s['max'])} CACHE {int(s['cache'])};\n")
    for t in tables:
        cols = []
        for c in t['columns']:
            decl = f"{ident(c['name'])} {c['type']}"
            if c['identity']:
                seq = identity_sequences.get((t['schema'], t['name'], c['name']))
                if not seq:
                    raise ValueError('Missing IDENTITY sequence')
                kind = {'d': 'BY DEFAULT', 'a': 'ALWAYS'}[c['identity']]
                decl += f" GENERATED {kind} AS IDENTITY (SEQUENCE NAME {ns}.{ident(seq['name'])} START WITH {int(seq['start'])} INCREMENT BY {int(seq['increment'])})"
            elif c['default'] and c['default'].startswith('nextval('):
                m = re.fullmatch(r"nextval\('(?:public\.)?([a-z_][a-z_0-9]*)'::regclass\)", c['default'])
                if not m or ('public.' + m[1]) not in sequences:
                    raise ValueError('Unmapped sequence default')
                decl += f" DEFAULT nextval({literal(schema + '.' + m[1])}::regclass)"
            if c['not_null']:
                decl += ' NOT NULL'
            cols.append(decl)
        out.append(f"CREATE TABLE {ns}.{ident(t['name'])} (" + ','.join(cols) + ');\n')
        for c in t['constraints']:
            if c['type'] == 'f':
                continue
            definition = c['definition'] if c['type'] == 'c' else ('PRIMARY KEY' if c['type'] == 'p' else 'UNIQUE') + ' (' + ','.join(ident(x) for x in c['columns']) + ')'
            out.append(f"ALTER TABLE {ns}.{ident(t['name'])} ADD CONSTRAINT {ident(c['name'])} {definition};\n")
        out.append(f"ALTER TABLE {ns}.{ident(t['name'])} ENABLE ROW LEVEL SECURITY;\n")
    out += [f'REVOKE ALL ON ALL TABLES IN SCHEMA {ns} FROM PUBLIC,anon,authenticated,service_role;\n',
            f'REVOKE ALL ON ALL SEQUENCES IN SCHEMA {ns} FROM PUBLIC,anon,authenticated,service_role;\n', 'COMMIT;\n']
    return ''.join(out)


def load(snapshot, schema):
    ns, tables = validate(snapshot, schema)
    out = [begin(), guard(snapshot, schema)]
    for t in tables:
        key = table_key(t)
        if key in EXCLUDED:
            continue
        columns = ','.join(ident(c['name']) for c in t['columns'])
        overriding = ' OVERRIDING SYSTEM VALUE' if any(c['identity'] for c in t['columns']) else ''
        out.append(f"INSERT INTO {ns}.{ident(t['name'])} ({columns}){overriding} SELECT {columns} FROM jsonb_populate_recordset(NULL::{ns}.{ident(t['name'])},{dollar(snapshot['data'][key]['data_json'])}::jsonb);\n")
    for s in snapshot['sequences']:
        out.append(f"SELECT setval({literal(schema + '.' + s['name'])}::regclass,{int(s['last_value'])},{str(s['is_called']).lower()});\n")
    out.append('COMMIT;\n')
    return ''.join(out)


def finalize(snapshot, schema):
    ns, tables = validate(snapshot, schema)
    out = [begin(), guard(snapshot, schema)]
    actions = {'a': 'NO ACTION', 'r': 'RESTRICT', 'c': 'CASCADE', 'n': 'SET NULL', 'd': 'SET DEFAULT'}
    for t in tables:
        for c in t['constraints']:
            if c['type'] != 'f':
                continue
            if c['match'] not in {'s', 'f'}:
                raise ValueError('Unsupported FK match')
            definition = 'FOREIGN KEY (' + ','.join(ident(x) for x in c['columns']) + ') REFERENCES ' + ns + '.' + ident(c['target_table']) + ' (' + ','.join(ident(x) for x in c['target_columns']) + ')'
            definition += ' MATCH ' + {'s': 'SIMPLE', 'f': 'FULL'}[c['match']]
            definition += ' ON UPDATE ' + actions[c['on_update']] + ' ON DELETE ' + actions[c['on_delete']]
            definition += (' DEFERRABLE INITIALLY ' + ('DEFERRED' if c['initially_deferred'] else 'IMMEDIATE')) if c['deferrable'] else ' NOT DEFERRABLE'
            out.append(f"ALTER TABLE {ns}.{ident(t['name'])} ADD CONSTRAINT {ident(c['name'])} {definition};\n")
    out.append('COMMIT;\n')
    return ''.join(out)


def verify(snapshot, schema):
    ns, tables = validate(snapshot, schema)
    checks = []
    for t in tables:
        key = table_key(t); row = snapshot['data'][key]
        n, sha = (0, digest('[]')) if key in EXCLUDED else (row['rows'], row['sha256'])
        checks.append(f"SELECT {literal(key)} name,count(*)={int(n)} count_ok,encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text,'sha256'),'hex')={literal(sha)} digest_ok FROM {ns}.{ident(t['name'])} t")
    return "SET timezone='UTC';\n" + guard(snapshot, schema) + f"WITH checks AS ({' UNION ALL '.join(checks)}), objects AS (SELECT c.* FROM pg_class c WHERE c.relnamespace={literal(schema)}::regnamespace) SELECT jsonb_build_object('tables',(select jsonb_agg(to_jsonb(checks)) from checks),'all_rows_exact',(select bool_and(count_ok and digest_ok) from checks),'table_count',(select count(*) from objects where relkind='r'),'rls_enabled',(select bool_and(relrowsecurity) from objects where relkind='r'),'fk_count',(select count(*) from pg_constraint c join objects o on o.oid=c.conrelid where c.contype='f'),'fk_validated',(select bool_and(c.convalidated and cr.relnamespace={literal(schema)}::regnamespace) from pg_constraint c join objects o on o.oid=c.conrelid join pg_class cr on cr.oid=c.confrelid where c.contype='f'),'business_triggers',(select count(*) from pg_trigger t join objects o on o.oid=t.tgrelid where not t.tgisinternal),'policies',(select count(*) from pg_policies where schemaname={literal(schema)}),'role_access',(select jsonb_object_agg(role,jsonb_build_object('schema_usage',has_schema_privilege(role,{literal(schema)},'USAGE'),'table_access',(select count(*) from objects o where relkind='r' and (has_table_privilege(role,o.oid,'SELECT') or has_table_privilege(role,o.oid,'INSERT') or has_table_privilege(role,o.oid,'UPDATE') or has_table_privilege(role,o.oid,'DELETE'))),'sequence_access',(select count(*) from objects o where relkind='S' and (has_sequence_privilege(role,o.oid,'USAGE') or has_sequence_privilege(role,o.oid,'SELECT') or has_sequence_privilege(role,o.oid,'UPDATE'))))) from (values ('anon'),('authenticated'),('service_role')) r(role))) result;\n"


def cleanup(snapshot, schema):
    ns, _ = validate(snapshot, schema)
    return begin() + guard(snapshot, schema) + f"""DO $cleanup$ BEGIN
IF EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_class target ON target.oid=c.confrelid JOIN pg_class origin ON origin.oid=c.conrelid WHERE target.relnamespace={literal(schema)}::regnamespace AND origin.relnamespace<>{literal(schema)}::regnamespace)
OR EXISTS(SELECT 1 FROM pg_depend d JOIN pg_rewrite r ON r.oid=d.objid AND d.classid='pg_rewrite'::regclass JOIN pg_class origin ON origin.oid=r.ev_class JOIN pg_class target ON d.refclassid='pg_class'::regclass AND target.oid=d.refobjid WHERE target.relnamespace={literal(schema)}::regnamespace AND origin.relnamespace<>{literal(schema)}::regnamespace)
OR EXISTS(SELECT 1 FROM pg_depend d JOIN pg_proc p ON p.oid=d.objid AND d.classid='pg_proc'::regclass JOIN pg_type ty ON d.refclassid='pg_type'::regclass AND ty.oid=d.refobjid WHERE ty.typnamespace={literal(schema)}::regnamespace AND p.pronamespace<>{literal(schema)}::regnamespace)
THEN RAISE EXCEPTION 'external_dependencies_prevent_cleanup'; END IF;
END $cleanup$;
DROP SCHEMA {ns} CASCADE;
COMMIT;
"""


def seal_response(response, destination):
    """Offline RSA-OAEP wraps the one-time PGP data key. Private key never SQL."""
    from cryptography.hazmat.primitives.asymmetric import rsa, padding
    from cryptography.hazmat.primitives import hashes, serialization
    import os
    destination.mkdir(parents=True, exist_ok=True)
    if any((destination / n).exists() for n in ('snapshot.pgp', 'envelope.json', 'recovery-private-key.pem')):
        raise ValueError('Never replace a sealed bundle/key implicitly')
    ciphertext = base64.b64decode(response['ciphertext'], validate=False)
    if hashlib.sha256(ciphertext).hexdigest() != response['ciphertext_sha256']:
        raise ValueError('Truncated/corrupt encrypted response')
    private = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    pem = private.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    public = private.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
    wrapped = private.public_key().encrypt(response['data_key'].encode(), padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
    receipt = {k: v for k, v in response.items() if k not in {'ciphertext', 'data_key'}}
    receipt.update({'format': FORMAT, 'project': PRODUCTION, 'wrapping': 'RSA-3072-OAEP-SHA256', 'data_encryption': 'OpenPGP AES256 with MDC', 'public_key_sha256': hashlib.sha256(public).hexdigest(), 'wrapped_data_key': base64.b64encode(wrapped).decode()})
    for name, data in [('snapshot.pgp', ciphertext), ('envelope.json', (json.dumps(receipt, indent=2)+'\n').encode()), ('recovery-private-key.pem', pem)]:
        p=destination/name;p.write_bytes(data);os.chmod(p,0o600)
    return receipt


def decrypt_bundle(directory, output):
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding
    import os, subprocess, tempfile
    if output.exists():
        raise ValueError('Decryption output must be a fresh private path')
    envelope = json.loads((directory/'envelope.json').read_text())
    cipher = (directory/'snapshot.pgp').read_bytes()
    if hashlib.sha256(cipher).hexdigest() != envelope['ciphertext_sha256']:
        raise ValueError('Ciphertext digest mismatch')
    private = serialization.load_pem_private_key((directory/'recovery-private-key.pem').read_bytes(),password=None)
    data_key = private.decrypt(base64.b64decode(envelope['wrapped_data_key']),padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),algorithm=hashes.SHA256(),label=None))
    with tempfile.TemporaryDirectory(prefix='ldr-decrypt-') as home:
        secret = Path(home)/'passphrase';secret.write_bytes(data_key);secret.chmod(0o600)
        result = subprocess.run(['gpg','--homedir',home,'--batch','--pinentry-mode','loopback','--no-symkey-cache','--passphrase-file',str(secret),'--output',str(output),'--decrypt',str(directory/'snapshot.pgp')],capture_output=True,timeout=45)
        if result.returncode:
            output.unlink(missing_ok=True)
            raise ValueError('GPG integrity/decryption verification failed')
    os.chmod(output,0o600)
    if hashlib.sha256(output.read_bytes()).hexdigest()!=envelope['plaintext_sha256']:
        output.unlink(missing_ok=True)
        raise ValueError('Decrypted snapshot digest mismatch')
    return envelope


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('action',choices=['build','seal','decrypt'])
    p.add_argument('--input',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--schema')
    a=p.parse_args()
    if a.action=='seal':
        result=seal_response(json.loads(a.input.read_text()),a.output)
        print(json.dumps({k:v for k,v in result.items() if k not in {'wrapped_data_key','counts'}}))
    elif a.action=='decrypt':
        result=decrypt_bundle(a.input,a.output)
        print(json.dumps({'plaintext_sha256':result['plaintext_sha256'],'verified':True}))
    else:
        snapshot=json.loads(a.input.read_text());validate(snapshot,a.schema)
        a.output.mkdir(parents=True,exist_ok=True)
        for name,fn in [('prepare',prepare),('load',load),('finalize',finalize),('verify',verify),('cleanup',cleanup)]:
            path=a.output/(name+'.sql');path.write_text(fn(snapshot,a.schema));path.chmod(0o600)
        print(json.dumps({'tables':len(snapshot['metadata']['tables']),'copied_tables':len(set(snapshot['data'])-set(EXCLUDED)),'excluded':{k:v for k,v in EXCLUDED.items() if k in snapshot['data']},'fk':sum(c['type']=='f' for t in snapshot['metadata']['tables'] for c in t['constraints'])}))

if __name__=='__main__':
    main()
