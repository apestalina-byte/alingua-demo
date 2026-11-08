import unittest
from datetime import date

from studyboard_backend import reports
from studyboard_backend.core import validate_snapshot


class TestReports(unittest.TestCase):
    def setUp(self):
        self.payload={
            "subjects":[{"id":"physics","name":"Физкультура","color":"#4f5bb5"}],
            "tasks":[
                {"id":"a1","title":"Посещение №1","subjectId":"physics","due":"2026-11-09","time":"",
                 "type":"other","status":"todo","priority":"normal","notes":"","link":"",
                 "createdAt":"2026-11-01T12:00:00Z","completedAt":"","updatedAt":""},
                {"id":"a2","title":"Посещение №2","subjectId":"physics","due":"2026-11-10","time":"",
                 "type":"other","status":"done","priority":"normal","notes":"","link":"",
                 "createdAt":"2026-11-01T12:00:00Z","completedAt":"2026-11-05T12:00:00Z","updatedAt":""}
            ]
        }

    def test_daily_includes_states(self):
        report=reports.daily(self.payload,date(2026,11,9))
        self.assertIn("Посещение №1",report)
        self.assertIn("Не начато",report)

    def test_weekly_counts_completed(self):
        report=reports.weekly(self.payload,date(2026,11,9))
        self.assertIn("Заданий: 2",report)
        self.assertIn("Выполнено: 1",report)

    def test_reminder_windows(self):
        text=reports.reminders(self.payload,date(2026,11,8))
        self.assertIn("Завтра",text)
        self.assertNotIn("Посещение №2",text) # already completed

    def test_validation(self):
        validated=validate_snapshot(self.payload)
        self.assertEqual(len(validated["tasks"]),2)

    def test_duplicate_rejected(self):
        self.payload["tasks"].append(dict(self.payload["tasks"][0]))
        with self.assertRaises(ValueError):
            validate_snapshot(self.payload)

    def test_inline_buttons_are_short(self):
        keyboard=reports.inline_actions(self.payload,date(2026,11,9))
        self.assertEqual(keyboard["inline_keyboard"][0][0]["callback_data"],"done:a1")


if __name__=="__main__":
    unittest.main()
