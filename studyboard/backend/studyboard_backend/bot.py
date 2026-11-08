"""Telegram long-polling worker. Only private chats are handled."""
import logging
import os
import time
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

from . import core, reports

LOG=logging.getLogger("studyboard.bot")
TOKEN=os.environ.get("TELEGRAM_BOT_TOKEN","")
BASE="https://api.telegram.org/bot"+TOKEN
TZ=ZoneInfo("Europe/Moscow")


def call(method: str, payload: dict, client: httpx.Client):
    response=client.post(BASE+"/"+method,json=payload,timeout=40)
    response.raise_for_status()
    result=response.json()
    if not result.get("ok"):
        raise RuntimeError("Telegram API rejected "+method+": "+str(result.get("error_code")))
    return result["result"]


def send(client, chat_id: int, text: str, reply_markup: dict | None = None):
    body={"chat_id":chat_id,"text":text[:3900],"disable_web_page_preview":True}
    if reply_markup:
        body["reply_markup"]=reply_markup
    return call("sendMessage",body,client)


def process_message(message: dict, client: httpx.Client):
    sender=message.get("from",{})
    chat=message.get("chat",{})
    if chat.get("type")!="private" or sender.get("is_bot"):
        return
    user_id=sender.get("id")
    chat_id=chat.get("id")
    if not isinstance(user_id,int) or not isinstance(chat_id,int):
        return
    content=(message.get("text") or "").strip()
    command=(content.split(maxsplit=1)[0].split("@")[0].lower() if content else "")
    if command not in ("/start","/help","/connect","/today","/week","/overdue","/progress","/mute","/unmute"):
        if content.startswith("/"):
            send(client,chat_id,"Неизвестная команда. Используй /help.")
        return
    account_id=core.upsert_account(user_id,chat_id)
    day=datetime.now(TZ).date()
    if command in ("/start","/help"):
        send(client,chat_id,
             "StudyBoard — задания и дедлайны.\n\n"
             "/connect — одноразовый код привязки сайта\n"
             "/today — задачи на сегодня\n"
             "/week — задания на текущую неделю\n"
             "/overdue — просроченные\n"
             "/progress — выполнение по предметам\n"
             "/mute — отключить автоматические отчёты\n"
             "/unmute — возобновить отчёты\n\n"
             "Автоматически: каждый день в 08:00 по Москве; "
             "по понедельникам — недельная сводка и напоминания по дедлайнам.")
        return
    if command=="/connect":
        code=core.new_pair_code(account_id)
        send(client,chat_id,
             "Код подключения StudyBoard (действителен 10 минут):\n\n"+code+
             "\n\nВведи его в разделе «Синхронизация» на сайте. "
             "Не отправляй этот код другим людям.")
        return
    if command=="/mute":
        core.set_notifications(user_id,False)
        send(client,chat_id,"Автоматические отчёты отключены. Команды работают. /unmute — включить обратно.")
        return
    if command=="/unmute":
        core.set_notifications(user_id,True)
        send(client,chat_id,"Автоматические отчёты включены: 08:00 по московскому времени.")
        return
    payload=core.account_snapshot_for_telegram(user_id)
    if command=="/today":
        send(client,chat_id,reports.daily(payload,day),reports.inline_actions(payload,day))
    elif command=="/week":
        send(client,chat_id,reports.weekly(payload,day))
    elif command=="/overdue":
        send(client,chat_id,reports.overdue(payload,day))
    elif command=="/progress":
        send(client,chat_id,reports.progress(payload))


def process_callback(query: dict, client: httpx.Client):
    sender=query.get("from",{})
    message=query.get("message") or {}
    chat=message.get("chat") or {}
    callback_id=query.get("id","")
    user_id=sender.get("id")
    data=query.get("data","")
    if chat.get("type")!="private" or not isinstance(user_id,int):
        return
    if not (data.startswith("done:") and len(data)<=64):
        call("answerCallbackQuery",{"callback_query_id":callback_id,"text":"Неизвестное действие"},client)
        return
    ok=core.change_task_status(user_id,data[5:],True)
    call("answerCallbackQuery",
         {"callback_query_id":callback_id,"text":"Задание выполнено ✓" if ok else "Задание не найдено"},client)


def process_update(update: dict, client: httpx.Client):
    if "message" in update:
        process_message(update["message"],client)
    elif "callback_query" in update:
        process_callback(update["callback_query"],client)


def run():
    if not TOKEN or ":" not in TOKEN:
        raise RuntimeError("TELEGRAM_BOT_TOKEN must be configured")
    core.init_db()
    logging.basicConfig(level=logging.INFO,format="%(asctime)s %(levelname)s %(message)s")
    offset=core.get_bot_offset()
    with httpx.Client() as client:
        # Long polling and webhooks cannot run simultaneously.
        call("deleteWebhook",{"drop_pending_updates":False},client)
        while True:
            try:
                updates=call("getUpdates",{"offset":offset,"timeout":25,
                                         "allowed_updates":["message","callback_query"]},client)
                for update in updates:
                    new_offset=update["update_id"]+1
                    try:
                        process_update(update,client)
                    except Exception:
                        LOG.exception("Failed to process Telegram update %s",update.get("update_id"))
                    # A failed action should not freeze the queue indefinitely.
                    offset=new_offset
                    core.set_bot_offset(offset)
            except (httpx.HTTPError,RuntimeError,KeyError):
                LOG.exception("Telegram polling error; retrying")
                time.sleep(5)


if __name__=="__main__":
    run()
