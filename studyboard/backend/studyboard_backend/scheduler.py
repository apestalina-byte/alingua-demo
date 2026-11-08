"""Idempotent notification scheduler, Europe/Moscow, 08:00 local time."""
import logging
import time
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

from . import core, reports
from .bot import send

LOG=logging.getLogger("studyboard.scheduler")
TZ=ZoneInfo("Europe/Moscow")


def run_once(client, now=None):
    now=now or datetime.now(TZ)
    # If host rebooted during 08:00, send within that hour, never repeatedly.
    if now.hour!=8:
        return 0
    sent=0
    day=now.date()
    for account in core.accounts_for_notifications():
        account_id=account["id"]
        chat_id=account["chat_id"]
        payload=account["payload"]
        events=[
            ("daily",reports.daily(payload,day),reports.inline_actions(payload,day)),
            ("reminder",reports.reminders(payload,day),None),
        ]
        if day.weekday()==0:
            events.append(("weekly",reports.weekly(payload,day),None))
        for kind,text,markup in events:
            if not text or not core.claim_notification(account_id,kind,day):
                continue
            try:
                send(client,chat_id,text,markup)
                sent+=1
            except Exception:
                core.unclaim_notification(account_id,kind,day)
                LOG.exception("Failed to send %s notification for account %s",kind,account_id)
    return sent


def run():
    import os
    if not os.environ.get("TELEGRAM_BOT_TOKEN"):
        raise RuntimeError("TELEGRAM_BOT_TOKEN is required")
    core.init_db()
    logging.basicConfig(level=logging.INFO,format="%(asctime)s %(levelname)s %(message)s")
    with httpx.Client() as client:
        while True:
            try:
                run_once(client)
            except Exception:
                LOG.exception("Scheduler iteration failed")
            time.sleep(30)


if __name__=="__main__":
    run()
