import os
import unittest
from unittest.mock import patch

os.environ.setdefault("CORS_ORIGINS","https://apestalina-byte.github.io")
from fastapi.testclient import TestClient
from studyboard_backend import api, core


class TestAPI(unittest.TestCase):
    def setUp(self):
        self.db=patch.object(core,"init_db")
        self.db.start()
        self.addCleanup(self.db.stop)
        self.client=TestClient(api.app)
        self.client.__enter__()
        self.addCleanup(self.client.__exit__,None,None,None)

    def test_unauthorized_snapshot(self):
        response=self.client.get("/api/v1/snapshot")
        self.assertEqual(response.status_code,401)

    def test_pair_code_exchange(self):
        with patch.object(core,"claim_pair_code",return_value="x"*48):
            response=self.client.post("/api/v1/pair",json={"code":"example-one-time-code"})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()["token"],"x"*48)

    def test_authenticated_snapshot(self):
        value={"revision":2,"subjects":[],"tasks":[]}
        with patch.object(core,"account_for_token",return_value=7):
            with patch.object(core,"get_snapshot",return_value=value):
                response=self.client.get("/api/v1/snapshot",headers={"Authorization":"Bearer abc123"})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json(),value)

    def test_revision_conflict_returns_409(self):
        with patch.object(core,"account_for_token",return_value=7):
            with patch.object(core,"put_snapshot",side_effect=core.RevisionConflict()):
                response=self.client.put("/api/v1/snapshot",
                    headers={"Authorization":"Bearer abc123"},
                    json={"revision":1,"subjects":[],"tasks":[]})
        self.assertEqual(response.status_code,409)

    def test_allowed_origin(self):
        response=self.client.options("/api/v1/snapshot",
            headers={"Origin":"https://apestalina-byte.github.io",
                     "Access-Control-Request-Method":"GET"})
        self.assertEqual(response.headers.get("access-control-allow-origin"),
                         "https://apestalina-byte.github.io")


if __name__=="__main__":
    unittest.main()
