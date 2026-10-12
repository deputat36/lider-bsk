#!/usr/bin/env python3
"""Parse the real SQLite DDL from SmsDatabase.java and smoke-test integrity and FK behavior."""
from pathlib import Path
import re
import sqlite3

source=Path("android/sms-card-v060/SmsDatabase.java").read_text(encoding="utf-8")
statements=[]
for match in re.finditer(r'db\.execSQL\((.*?)\);',source,flags=re.S):
    pieces=re.findall(r'"((?:\\.|[^"\\])*)"',match.group(1))
    sql="".join(piece.replace("\\\"","\"") for piece in pieces)
    if sql.startswith("CREATE TABLE") or sql.startswith("CREATE INDEX"):
        statements.append(sql)
assert len(statements)>=9, f"Missing SQL schema declarations ({len(statements)})"
db=sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
for sql in statements:
    db.execute(sql)
tables={row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
required={"meta","campaigns","campaign_recipients","sms_history","prepared_ledger","stoplist","diagnostic_events"}
assert required.issubset(tables), f"Missing tables: {required-tables}"

db.execute("""INSERT INTO campaigns
(id,title,message,created_at,finished_at,paused,current_index,state,total,prepared,skipped)
VALUES ('t1','Тест','Добрый день',1,0,0,0,'active',2,0,0)""")
db.execute("""INSERT INTO campaign_recipients(campaign_id,seq,name,phone,status)
VALUES('t1',0,'Тест','79990000000','pending')""")
db.execute("""INSERT INTO campaign_recipients(campaign_id,seq,name,phone,status)
VALUES('t1',1,'Тест2','79990000001','pending')""")
db.commit()

db.execute("BEGIN")
db.execute("UPDATE campaign_recipients SET status='prepared' WHERE campaign_id='t1' AND seq=0")
db.rollback()
assert db.execute("SELECT status FROM campaign_recipients WHERE campaign_id='t1' AND seq=0").fetchone()[0]=="pending"

db.execute("UPDATE campaign_recipients SET status='prepared' WHERE campaign_id='t1' AND seq=0")
db.commit()
assert db.execute("SELECT COUNT(*) FROM campaign_recipients WHERE status='prepared'").fetchone()[0]==1

db.execute("DELETE FROM campaigns WHERE id='t1'")
db.commit()
assert db.execute("SELECT COUNT(*) FROM campaign_recipients").fetchone()[0]==0, "FK cascade failed"
assert db.execute("PRAGMA quick_check").fetchone()[0]=="ok"
print(f"SQLITE SCHEMA SMOKE: OK, {len(statements)} declarations, {len(required)} required tables")
