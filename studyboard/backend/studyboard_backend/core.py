"""StudyBoard backend: PostgreSQL persistence and authenticated snapshots."""
import hashlib
import hmac
import json
import os
import secrets
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

import psycopg
from psycopg.rows import dict_row

DATABASE_URL = os.environ.get("DATABASE_URL", "")
PAIRING_SECRET = os.environ.get("PAIRING_SECRET", "")
ALLOWED_TELEGRAM_USER_ID = os.environ.get("STUDYBOARD_TELEGRAM_USER_ID", "").strip()


def is_allowed_telegram_user(user_id: int) -> bool:
    # Fail closed until the owner explicitly selects an allowed Telegram account.
    return bool(ALLOWED_TELEGRAM_USER_ID.isdecimal() and int(ALLOWED_TELEGRAM_USER_ID) == user_id)



def connection():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is required")
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def ensure_environment():
    if len(PAIRING_SECRET) < 32:
        raise RuntimeError("PAIRING_SECRET must contain at least 32 random characters")


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def code_digest(code: str) -> str:
    ensure_environment()
    return hmac.new(PAIRING_SECRET.encode("utf-8"), code.encode("ascii"), hashlib.sha256).hexdigest()


EMPTY = {"subjects": [], "tasks": []}


def init_db():
    ensure_environment()
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_xact_lock(596284910)")
            cur.execute("""CREATE TABLE IF NOT EXISTS sb_accounts (
                id BIGSERIAL PRIMARY KEY,
                telegram_user_id BIGINT UNIQUE NOT NULL,
                chat_id BIGINT NOT NULL,
                notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE
            )""")
            cur.execute("""CREATE TABLE IF NOT EXISTS sb_codes (
                account_id BIGINT PRIMARY KEY REFERENCES sb_accounts(id) ON DELETE CASCADE,
                digest CHAR(64) UNIQUE NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL
            )""")
            cur.execute("""CREATE TABLE IF NOT EXISTS sb_devices (
                token_hash CHAR(64) PRIMARY KEY,
                account_id BIGINT NOT NULL REFERENCES sb_accounts(id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )""")
            cur.execute("""CREATE TABLE IF NOT EXISTS sb_snapshots (
                account_id BIGINT PRIMARY KEY REFERENCES sb_accounts(id) ON DELETE CASCADE,
                revision BIGINT NOT NULL DEFAULT 0,
                payload JSONB NOT NULL DEFAULT '{"subjects":[],"tasks":[]}'::jsonb,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )""")
            cur.execute("""CREATE TABLE IF NOT EXISTS sb_notifications (
                account_id BIGINT NOT NULL REFERENCES sb_accounts(id) ON DELETE CASCADE,
                kind VARCHAR(32) NOT NULL,
                day DATE NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY(account_id,kind,day)
            )""")
            cur.execute("""CREATE TABLE IF NOT EXISTS sb_bot_cursor (
                id INTEGER PRIMARY KEY CHECK (id=1),
                next_update_id BIGINT NOT NULL DEFAULT 0
            )""")
            cur.execute("INSERT INTO sb_bot_cursor(id,next_update_id) VALUES (1,0) ON CONFLICT DO NOTHING")


def upsert_account(user_id: int, chat_id: int) -> int:
    if not is_allowed_telegram_user(user_id):
        raise PermissionError('Telegram account is not allowed')
    with connection() as conn:
        row = conn.execute(
            """INSERT INTO sb_accounts(telegram_user_id,chat_id) VALUES (%s,%s)
            ON CONFLICT(telegram_user_id) DO UPDATE SET chat_id=excluded.chat_id RETURNING id""",
            (user_id,chat_id)
        ).fetchone()
        conn.execute("""INSERT INTO sb_snapshots(account_id,payload)
            VALUES (%s,%s::jsonb) ON CONFLICT(account_id) DO NOTHING""",
            (row["id"], json.dumps(EMPTY)))
        return row["id"]


def new_pair_code(account_id: int) -> str:
    code = secrets.token_urlsafe(18)
    with connection() as conn:
        conn.execute("""INSERT INTO sb_codes(account_id,digest,expires_at) VALUES (%s,%s,now()+interval '10 minutes')
            ON CONFLICT(account_id) DO UPDATE SET digest=excluded.digest, expires_at=excluded.expires_at""",
            (account_id,code_digest(code)))
    return code


def claim_pair_code(code: str) -> str | None:
    # 144-bit codes from Telegram, one-time and short-lived.
    if not (12 <= len(code) <= 80) or not code.isascii():
        return None
    digest = code_digest(code.strip())
    with connection() as conn:
        row = conn.execute("""DELETE FROM sb_codes
            WHERE digest=%s AND expires_at>now() RETURNING account_id""",(digest,)).fetchone()
        if not row:
            return None
        token = secrets.token_urlsafe(32)
        conn.execute("INSERT INTO sb_devices(token_hash,account_id) VALUES (%s,%s)",
                     (token_digest(token),row["account_id"]))
        return token


def account_for_token(token: str) -> int | None:
    if not token or len(token) > 200:
        return None
    with connection() as conn:
        row=conn.execute("""SELECT d.account_id, a.telegram_user_id
            FROM sb_devices d JOIN sb_accounts a ON a.id=d.account_id
            WHERE d.token_hash=%s""",(token_digest(token),)).fetchone()
        return row["account_id"] if row and is_allowed_telegram_user(row["telegram_user_id"]) else None


def revoke_token(token: str):
    with connection() as conn:
        conn.execute("DELETE FROM sb_devices WHERE token_hash=%s", (token_digest(token),))


def validate_snapshot(snapshot: dict) -> dict:
    if not isinstance(snapshot,dict) or not isinstance(snapshot.get("subjects"),list) or not isinstance(snapshot.get("tasks"),list):
        raise ValueError("Expected subjects and tasks arrays")
    subjects=snapshot["subjects"]
    tasks=snapshot["tasks"]
    if len(subjects)>2000 or len(tasks)>15000:
        raise ValueError("Too many records")
    ids=set()
    tids=set()
    subject_result=[]
    task_result=[]
    for s in subjects:
        if not isinstance(s,dict) or not isinstance(s.get("id"),str) or not isinstance(s.get("name"),str):
            raise ValueError("Invalid subject")
        sid=s["id"]; name=s["name"].strip()
        if not sid or len(sid)>120 or sid in ids or not name or len(name)>90:
            raise ValueError("Invalid or duplicate subject")
        ids.add(sid)
        color=s.get("color","#4f5bb5")
        if not isinstance(color,str) or len(color)!=7 or color[0]!="#" or any(x not in "0123456789abcdefABCDEF" for x in color[1:]):
            color="#4f5bb5"
        subject_result.append({"id":sid,"name":name,"color":color})
    allowed_type={"lab","homework","test","project","other"}
    allowed_status={"todo","progress","done"}
    allowed_priority={"normal","high","urgent"}
    from datetime import date
    for t in tasks:
        if not isinstance(t,dict) or not isinstance(t.get("id"),str) or not isinstance(t.get("title"),str):
            raise ValueError("Invalid task")
        tid=t["id"]; title=t["title"].strip()
        if not tid or len(tid)>120 or tid in tids or not title or len(title)>180 or t.get("subjectId") not in ids:
            raise ValueError("Invalid, duplicate or orphan task")
        tids.add(tid)
        due=t.get("due") or ""
        if not isinstance(due,str) or (due and (len(due)!=10 or date.fromisoformat(due).isoformat()!=due)):
            raise ValueError("Invalid due date")
        ttime=t.get("time") or ""
        if not isinstance(ttime,str) or (ttime and (len(ttime)!=5 or not ttime[:2].isdigit() or not ttime[3:].isdigit() or ttime[2]!=":" or int(ttime[:2])>23 or int(ttime[3:])>59)):
            raise ValueError("Invalid time")
        def string_value(key,maxlen):
            value=t.get(key,"")
            if not isinstance(value,str) or len(value)>maxlen:
                raise ValueError("Invalid "+key)
            return value
        typ=t.get("type","other")
        status=t.get("status","todo")
        priority=t.get("priority","normal")
        if typ not in allowed_type or status not in allowed_status or priority not in allowed_priority:
            raise ValueError("Invalid task properties")
        link=string_value("link",1000)
        if link and not link.startswith(("http://","https://")):
            raise ValueError("Invalid link")
        task_result.append({
          "id":tid,"title":title,"subjectId":t["subjectId"],"type":typ,"status":status,
          "priority":priority,"due":due,"time":ttime,"notes":string_value("notes",4000),"link":link,
          "createdAt":string_value("createdAt",100),"completedAt":string_value("completedAt",100),
          "updatedAt":string_value("updatedAt",100)
        })
    return {"subjects":subject_result,"tasks":task_result}


def get_snapshot(account_id: int) -> dict:
    with connection() as conn:
        row=conn.execute("SELECT revision,payload FROM sb_snapshots WHERE account_id=%s",
                         (account_id,)).fetchone()
        if not row:
            return {"revision":0,**EMPTY}
        payload=row["payload"]
        return {"revision":row["revision"],"subjects":payload["subjects"],"tasks":payload["tasks"]}


class RevisionConflict(Exception):
    pass


def put_snapshot(account_id: int, expected_revision: int, payload: dict) -> int:
    data=validate_snapshot(payload)
    if len(json.dumps(data,ensure_ascii=False)) > 2_000_000:
        raise ValueError("Snapshot too large")
    with connection() as conn:
        row=conn.execute("SELECT revision FROM sb_snapshots WHERE account_id=%s FOR UPDATE",
                         (account_id,)).fetchone()
        if not row:
            raise ValueError("Account not initialized")
        if row["revision"] != expected_revision:
            raise RevisionConflict()
        new_revision=expected_revision+1
        conn.execute("""UPDATE sb_snapshots SET revision=%s, payload=%s::jsonb, updated_at=now()
            WHERE account_id=%s""", (new_revision,json.dumps(data,ensure_ascii=False),account_id))
        return new_revision


def change_task_status(telegram_user_id: int, task_id: str, done: bool):
    with connection() as conn:
        user=conn.execute("SELECT id FROM sb_accounts WHERE telegram_user_id=%s",
                          (telegram_user_id,)).fetchone()
        if not user:
            return False
        row=conn.execute("SELECT revision,payload FROM sb_snapshots WHERE account_id=%s FOR UPDATE",
                         (user["id"],)).fetchone()
        if not row:
            return False
        tasks=row["payload"].get("tasks",[])
        task=next((t for t in tasks if t.get("id")==task_id),None)
        if not task:
            return False
        task["status"]="done" if done else "todo"
        stamp=datetime.now(timezone.utc).isoformat()
        task["completedAt"]=stamp if done else ""
        task["updatedAt"]=stamp
        conn.execute("""UPDATE sb_snapshots SET revision=revision+1,payload=%s::jsonb,updated_at=now()
            WHERE account_id=%s""", (json.dumps(row["payload"],ensure_ascii=False),user["id"]))
        return True


def get_bot_offset() -> int:
    with connection() as conn:
        return conn.execute("SELECT next_update_id FROM sb_bot_cursor WHERE id=1").fetchone()["next_update_id"]


def set_bot_offset(offset: int):
    with connection() as conn:
        conn.execute("UPDATE sb_bot_cursor SET next_update_id=GREATEST(next_update_id,%s) WHERE id=1",(offset,))


def accounts_for_notifications():
    if not ALLOWED_TELEGRAM_USER_ID.isdecimal():
        return []
    with connection() as conn:
        return conn.execute("""SELECT a.id,a.telegram_user_id,a.chat_id,s.payload FROM sb_accounts a
            JOIN sb_snapshots s ON s.account_id=a.id
            WHERE a.notifications_enabled=TRUE AND a.telegram_user_id=%s""",
            (int(ALLOWED_TELEGRAM_USER_ID),)).fetchall()


def account_snapshot_for_telegram(user_id: int):
    with connection() as conn:
        row=conn.execute("""SELECT s.payload FROM sb_snapshots s
            JOIN sb_accounts a ON a.id=s.account_id WHERE a.telegram_user_id=%s""",(user_id,)).fetchone()
        return row["payload"] if row else EMPTY


def set_notifications(user_id: int, enabled: bool):
    with connection() as conn:
        conn.execute("UPDATE sb_accounts SET notifications_enabled=%s WHERE telegram_user_id=%s",
                     (enabled,user_id))


def claim_notification(account_id: int, kind: str, day) -> bool:
    with connection() as conn:
        row=conn.execute("""INSERT INTO sb_notifications(account_id,kind,day) VALUES (%s,%s,%s)
            ON CONFLICT DO NOTHING RETURNING kind""",(account_id,kind,day)).fetchone()
        return bool(row)


def unclaim_notification(account_id: int, kind: str, day):
    with connection() as conn:
        conn.execute("DELETE FROM sb_notifications WHERE account_id=%s AND kind=%s AND day=%s",
                     (account_id,kind,day))
