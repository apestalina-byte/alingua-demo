"""FastAPI service for StudyBoard's opt-in multi-device synchronization."""
import os
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import core


@asynccontextmanager
async def lifespan(app):
    core.init_db()
    yield


app = FastAPI(title="StudyBoard Sync API", version="1.0.0", lifespan=lifespan,
              docs_url=None, redoc_url=None, openapi_url=None)
origins = [x.strip().rstrip("/") for x in os.environ.get("CORS_ORIGINS","").split(",") if x.strip()]
if not origins or "*" in origins:
    raise RuntimeError("CORS_ORIGINS must explicitly list trusted frontend origins")
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=False,
                   allow_methods=["GET","PUT","POST"], allow_headers=["Authorization","Content-Type"])
attempts = defaultdict(deque)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    length=request.headers.get("content-length","0")
    if request.method in ("PUT","POST"):
        if not length.isdigit():
            return JSONResponse({"detail":"Invalid Content-Length"},status_code=400)
        if int(length)>2_500_000:
            return JSONResponse({"detail":"Request too large"},status_code=413)
    response = await call_next(request)
    response.headers["Cache-Control"]="no-store"
    response.headers["X-Content-Type-Options"]="nosniff"
    response.headers["Referrer-Policy"]="no-referrer"
    return response


class PairRequest(BaseModel):
    code: str = Field(min_length=12, max_length=80)


class SnapshotRequest(BaseModel):
    revision: int = Field(ge=0)
    subjects: list
    tasks: list


def auth(authorization: str | None = Header(default=None)) -> int:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401,"Pair this device with Telegram first")
    account_id=core.account_for_token(authorization[7:].strip())
    if account_id is None:
        raise HTTPException(401,"This device is not authorized")
    return account_id


@app.get("/health")
def health():
    return {"ok":True}


@app.post("/api/v1/pair")
def pair(body: PairRequest, request: Request):
    # Rate limiting supplements the high entropy and 10-minute life of Telegram pairing codes.
    ip=request.client.host if request.client else "unknown"
    now=time.monotonic()
    queue=attempts[ip]
    while queue and queue[0]<now-600:
        queue.popleft()
    if len(queue)>=12:
        raise HTTPException(429,"Too many attempts. Try again in 10 minutes.")
    queue.append(now)
    token=core.claim_pair_code(body.code)
    if not token:
        raise HTTPException(400,"The code is incorrect or expired. Request a new /connect code.")
    return {"token":token,"token_type":"Bearer"}


@app.get("/api/v1/snapshot")
def snapshot(account_id: int = Depends(auth)):
    return core.get_snapshot(account_id)


@app.put("/api/v1/snapshot")
def save_snapshot(body: SnapshotRequest, account_id: int = Depends(auth)):
    try:
        revision=core.put_snapshot(account_id,body.revision,
                                   {"subjects":body.subjects,"tasks":body.tasks})
    except core.RevisionConflict:
        raise HTTPException(409,"The remote data changed; refresh and merge before retrying")
    except (ValueError,TypeError) as error:
        raise HTTPException(422,str(error))
    return {"revision":revision}


@app.post("/api/v1/revoke")
def revoke(authorization: str | None = Header(default=None),
           account_id: int = Depends(auth)):
    core.revoke_token(authorization[7:].strip())
    return {"ok":True}
