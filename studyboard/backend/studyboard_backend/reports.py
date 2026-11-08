"""Readable, bounded daily/weekly reports. All dates use Europe/Moscow."""
from datetime import date, timedelta
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Europe/Moscow")
STATUS = {"todo":"○ Не начато","progress":"◐ В работе","done":"✓ Выполнено"}


def task_lines(tasks, subjects, limit=26, with_date=False):
    names={s.get("id"):s.get("name","Предмет") for s in subjects}
    ordered=sorted(tasks,key=lambda t:(t.get("due") or "9999",t.get("time") or "",t.get("title") or ""))
    result=[]
    for t in ordered[:limit]:
        prefix=("("+t["due"][8:10]+"."+t["due"][5:7]+") " if with_date and t.get("due") else "")
        label=(t.get("title") or "Задание").replace("\n"," ").strip()[:72]
        name=names.get(t.get("subjectId"),"Предмет")[:44]
        result.append(prefix+label+" — "+name+"\n   "+STATUS.get(t.get("status"),STATUS["todo"]))
    if len(ordered)>limit:
        result.append("… и ещё "+str(len(ordered)-limit)+" заданий. Полный список — в StudyBoard.")
    return "\n".join(result) if result else "Заданий нет."


def summary(payload):
    tasks=payload.get("tasks",[])
    done=sum(t.get("status")=="done" for t in tasks)
    overdue=sum(t.get("status")!="done" and t.get("due") and t["due"]<date.today().isoformat() for t in tasks)
    return "Всего: "+str(len(tasks))+" · Выполнено: "+str(done)+" · В работе: "+str(sum(t.get("status")=="progress" for t in tasks))


def daily(payload, day: date):
    tasks=payload.get("tasks",[])
    subjects=payload.get("subjects",[])
    ds=day.isoformat()
    today=[t for t in tasks if t.get("due")==ds]
    overdue=[t for t in tasks if t.get("due") and t["due"]<ds and t.get("status")!="done"]
    open_count=sum(t.get("status")!="done" for t in tasks)
    done_count=sum(t.get("status")=="done" for t in tasks)
    head=("StudyBoard · план на "+day.strftime("%d.%m.%Y")+
          "\nНезакрытых заданий: "+str(open_count)+" · Выполнено: "+str(done_count))
    body="\n\nСегодня ("+str(len(today))+")\n"+task_lines(today,subjects,18)
    if overdue:
        body+="\n\nПросрочено ("+str(len(overdue))+")\n"+task_lines(overdue,subjects,8)
    body+="\n\nКоманды: /today · /week · /overdue · /progress"
    return (head+body)[:3900]


def weekly(payload, day: date):
    start=day-timedelta(days=day.weekday())
    end=start+timedelta(days=6)
    tasks=[t for t in payload.get("tasks",[]) if t.get("due") and start.isoformat()<=t["due"]<=end.isoformat()]
    completed=sum(t.get("status")=="done" for t in tasks)
    intro=("StudyBoard · неделя "+start.strftime("%d.%m")+"–"+end.strftime("%d.%m")+
           "\nЗаданий: "+str(len(tasks))+" · Выполнено: "+str(completed)+" · Осталось: "+str(len(tasks)-completed))
    return (intro+"\n\n"+task_lines(tasks,payload.get("subjects",[]),35,True))[:3900]


def overdue(payload, day: date):
    tasks=[t for t in payload.get("tasks",[]) if t.get("due") and t["due"]<day.isoformat() and t.get("status")!="done"]
    return ("Просроченные задания · "+str(len(tasks))+"\n\n"+task_lines(tasks,payload.get("subjects",[]),30,True))[:3900]


def progress(payload):
    tasks=payload.get("tasks",[])
    lines=["StudyBoard · выполнение по предметам"]
    for subject in payload.get("subjects",[]):
        group=[t for t in tasks if t.get("subjectId")==subject.get("id")]
        if group:
            done=sum(t.get("status")=="done" for t in group)
            lines.append(subject.get("name","Предмет")[:64]+": "+str(done)+"/"+str(len(group)))
    if len(lines)==1:
        lines.append("Пока нет заданий.")
    return "\n".join(lines)[:3900]


def reminders(payload, day: date):
    tasks=payload.get("tasks",[])
    subjects=payload.get("subjects",[])
    parts=[]
    for span,label in ((0,"Сегодня"),(1,"Завтра"),(3,"Через три дня")):
        ds=(day+timedelta(days=span)).isoformat()
        due=[t for t in tasks if t.get("due")==ds and t.get("status")!="done"]
        if due:
            parts.append(label+" · "+str(len(due))+"\n"+task_lines(due,subjects,9))
    if not parts:
        return ""
    return ("Напоминание о дедлайнах\n\n"+"\n\n".join(parts))[:3900]


def inline_actions(payload, day: date):
    tasks=[t for t in payload.get("tasks",[]) if t.get("due")==day.isoformat() and t.get("status")!="done"]
    rows=[]
    for task in tasks[:4]:
        task_id=task.get("id","")
        if len(task_id.encode("utf-8"))>53:
            continue
        rows.append([{"text":"✓ "+(task.get("title") or "Задание")[:37],"callback_data":"done:"+task_id}])
    return {"inline_keyboard":rows} if rows else None
