from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict
import uuid
import logging
import bcrypt
import jwt
import re
import ipaddress
import secrets
import httpx
from html import escape as html_escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from datetime import datetime, timezone, timedelta

# ---------------------------------------------------------------------------
# DB
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

JWT_ALGORITHM = "HS256"


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


# ---------------------------------------------------------------------------
# CPL definition
# ---------------------------------------------------------------------------
CATEGORIES = {
    "sikap": {"name": "Sikap", "weight": 20, "chart_color": "#059669"},
    "pengetahuan": {"name": "Pengetahuan", "weight": 10, "chart_color": "#D97706"},
    "keterampilan_umum": {"name": "Keterampilan Umum", "weight": 30, "chart_color": "#0D9488"},
    "keterampilan_khusus": {"name": "Keterampilan Khusus", "weight": 40, "chart_color": "#EAB308"},
}

CRITERIA = [
    {"code": "CPL-S1", "category_key": "sikap", "label": "Bertaqwa kepada Tuhan YME dan menunjukkan sikap religius"},
    {"code": "CPL-S2", "category_key": "sikap", "label": "Menjunjung tinggi nilai kemanusiaan, etika, dan integritas akademik"},
    {"code": "CPL-S3", "category_key": "sikap", "label": "Berkontribusi dalam peningkatan mutu kehidupan bermasyarakat"},
    {"code": "CPL-P1", "category_key": "pengetahuan", "label": "Menguasai konsep teoritis bidang keilmuan secara mendalam"},
    {"code": "CPL-P2", "category_key": "pengetahuan", "label": "Menguasai metodologi penelitian dan pemikiran logis, kritis"},
    {"code": "CPL-P3", "category_key": "pengetahuan", "label": "Menguasai standar nasional & internasional pengembangan program"},
    {"code": "CPL-P4", "category_key": "pengetahuan", "label": "Menguasai prinsip integrasi keilmuan Islam dan sains modern"},
    {"code": "CPL-KU1", "category_key": "keterampilan_umum", "label": "Mampu menerapkan pemikiran logis, kritis, sistematis, inovatif"},
    {"code": "CPL-KU2", "category_key": "keterampilan_umum", "label": "Mampu mengambil keputusan tepat dalam penyelesaian masalah"},
    {"code": "CPL-KK1", "category_key": "keterampilan_khusus", "label": "Mampu merancang & mengimplementasikan karya keahlian prodi"},
    {"code": "CPL-KK2", "category_key": "keterampilan_khusus", "label": "Mampu evaluasi & supervisi kualitas hasil kerja bidang studi"},
    {"code": "CPL-KK3", "category_key": "keterampilan_khusus", "label": "Mampu beradaptasi dengan inovasi teknologi & industri global"},
]

CODES_BY_CATEGORY: Dict[str, List[str]] = {k: [] for k in CATEGORIES}
for c in CRITERIA:
    CODES_BY_CATEGORY[c["category_key"]].append(c["code"])


def predicate_for(score: Optional[float]):
    if score is None:
        return {"grade": "-", "predicate": "-"}
    if score >= 85:
        return {"grade": "A", "predicate": "Sangat Memuaskan"}
    if score >= 75:
        return {"grade": "B", "predicate": "Memuaskan"}
    if score >= 65:
        return {"grade": "C", "predicate": "Cukup"}
    if score >= 50:
        return {"grade": "D", "predicate": "Kurang"}
    return {"grade": "E", "predicate": "Gagal"}


def compute_scores(scores: Dict[str, float]):
    """Compute per-category averages and weighted total (renormalized over present categories)."""
    category_averages: Dict[str, Optional[float]] = {}
    present_weight = 0.0
    weighted_sum = 0.0
    for key, meta in CATEGORIES.items():
        vals = [scores[code] for code in CODES_BY_CATEGORY[key] if code in scores and scores.get(code) is not None]
        if vals:
            avg = round(sum(vals) / len(vals), 2)
            category_averages[key] = avg
            present_weight += meta["weight"]
            weighted_sum += avg * meta["weight"]
        else:
            category_averages[key] = None
    total = round(weighted_sum / present_weight, 2) if present_weight > 0 else None
    pred = predicate_for(total)
    return category_averages, total, pred["grade"], pred["predicate"]


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "exp": datetime.now(timezone.utc) + timedelta(hours=12), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=43200, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=604800, path="/")


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Tidak terautentikasi")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token tidak valid")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User tidak ditemukan")
        if not user.get("is_active", True):
            raise HTTPException(status_code=401, detail="Akun dinonaktifkan")
        user["id"] = str(user["_id"])
        user.pop("_id", None)
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token kedaluwarsa")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token tidak valid")


# ---------------------------------------------------------------------------
# Email (Resend managed) + Audit log helpers
# ---------------------------------------------------------------------------
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "SI-CPL UINSA")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str):
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    try:
        async with httpx.AsyncClient(timeout=30) as http_client:
            resp = await http_client.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json=payload,
            )
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        logger.error(f"Email send failed: {e.response.status_code} {e.response.text}")
        raise HTTPException(status_code=502, detail="Gagal mengirim email")
    except Exception as e:
        logger.error(f"Email send error: {str(e)}")
        raise HTTPException(status_code=500, detail="Gagal mengirim email")


async def log_audit(user: Optional[dict], action: str, entity: str, entity_id: str = "", summary: str = ""):
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "actor_id": (user or {}).get("id"),
        "actor_email": (user or {}).get("email", "sistem"),
        "actor_role": (user or {}).get("role", "-"),
        "action": action, "entity": entity, "entity_id": str(entity_id),
        "summary": summary, "timestamp": datetime.now(timezone.utc).isoformat(),
    })


# ---------------------------------------------------------------------------
# Authorization (RBAC + scope)
# ---------------------------------------------------------------------------
ROLE_ADMIN = "admin"
ROLE_KAPRODI = "kaprodi"
ROLE_DOSEN = "dosen"


def require_role(*allowed):
    async def checker(user: dict = Depends(get_current_user)):
        if user.get("role") not in allowed:
            raise HTTPException(status_code=403, detail="Anda tidak memiliki akses untuk aksi ini")
        return user
    return checker


def scoped_query(user: dict, base: Optional[dict] = None) -> dict:
    """Force fakultas/prodi scope for non-admin roles into a Mongo query."""
    q = dict(base or {})
    if user.get("role") in (ROLE_KAPRODI, ROLE_DOSEN):
        if user.get("prodi_id"):
            q["prodi_id"] = user["prodi_id"]
        elif user.get("fakultas_id"):
            q["fakultas_id"] = user["fakultas_id"]
    return q


def enforce_scope(user: dict, fakultas_id: str, prodi_id: str):
    if user.get("role") in (ROLE_KAPRODI, ROLE_DOSEN):
        if user.get("prodi_id") and prodi_id != user["prodi_id"]:
            raise HTTPException(status_code=403, detail="Di luar cakupan prodi Anda")
        if user.get("fakultas_id") and not user.get("prodi_id") and fakultas_id != user["fakultas_id"]:
            raise HTTPException(status_code=403, detail="Di luar cakupan fakultas Anda")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class LoginInput(BaseModel):
    email: EmailStr
    password: str


class Fakultas(BaseModel):
    name: str
    code: str = ""


class Prodi(BaseModel):
    name: str
    code: str = ""
    fakultas_id: str


class MataKuliah(BaseModel):
    name: str
    code: str = ""
    sks: int = 3
    fakultas_id: str
    prodi_id: str
    cpl_codes: List[str] = Field(default_factory=list)


class GradeInput(BaseModel):
    fakultas_id: str
    prodi_id: str
    mata_kuliah_id: str
    tahun_akademik: str
    semester_type: str
    kelas: str
    semester_number: str
    scores: Dict[str, float]


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
@api_router.post("/auth/login")
async def login(data: LoginInput, response: Response):
    email = data.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email atau kata sandi salah")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Akun Anda dinonaktifkan. Hubungi admin.")
    uid = str(user["_id"])
    access = create_access_token(uid, email)
    refresh = create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    return {"id": uid, "email": user["email"], "name": user.get("name", ""), "role": user.get("role", "admin"),
            "fakultas_id": user.get("fakultas_id"), "prodi_id": user.get("prodi_id"), "token": access}


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logout berhasil"}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api_router.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Tidak ada refresh token")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Token tidak valid")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User tidak ditemukan")
        access = create_access_token(str(user["_id"]), user["email"])
        response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=43200, path="/")
        return {"message": "ok"}
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token tidak valid")


# ---------------------------------------------------------------------------
# Meta
# ---------------------------------------------------------------------------
@api_router.get("/meta/cpl")
async def get_cpl_meta():
    return {"categories": CATEGORIES, "criteria": CRITERIA, "codes_by_category": CODES_BY_CATEGORY}


# ---------------------------------------------------------------------------
# Fakultas CRUD
# ---------------------------------------------------------------------------
@api_router.get("/fakultas")
async def list_fakultas(user: dict = Depends(get_current_user)):
    return await db.fakultas.find({}, {"_id": 0}).sort("name", 1).to_list(1000)


@api_router.post("/fakultas")
async def create_fakultas(data: Fakultas, user: dict = Depends(require_role(ROLE_ADMIN))):
    doc = data.model_dump()
    doc["id"] = str(uuid.uuid4())
    await db.fakultas.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/fakultas/{fid}")
async def update_fakultas(fid: str, data: Fakultas, user: dict = Depends(require_role(ROLE_ADMIN))):
    await db.fakultas.update_one({"id": fid}, {"$set": data.model_dump()})
    return await db.fakultas.find_one({"id": fid}, {"_id": 0})


@api_router.delete("/fakultas/{fid}")
async def delete_fakultas(fid: str, user: dict = Depends(require_role(ROLE_ADMIN))):
    await db.fakultas.delete_one({"id": fid})
    await db.prodi.delete_many({"fakultas_id": fid})
    await db.matakuliah.delete_many({"fakultas_id": fid})
    return {"message": "Fakultas dihapus"}


# ---------------------------------------------------------------------------
# Prodi CRUD
# ---------------------------------------------------------------------------
@api_router.get("/prodi")
async def list_prodi(fakultas_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"fakultas_id": fakultas_id} if fakultas_id else {}
    return await db.prodi.find(q, {"_id": 0}).sort("name", 1).to_list(1000)


@api_router.post("/prodi")
async def create_prodi(data: Prodi, user: dict = Depends(require_role(ROLE_ADMIN))):
    doc = data.model_dump()
    doc["id"] = str(uuid.uuid4())
    await db.prodi.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/prodi/{pid}")
async def update_prodi(pid: str, data: Prodi, user: dict = Depends(require_role(ROLE_ADMIN))):
    await db.prodi.update_one({"id": pid}, {"$set": data.model_dump()})
    return await db.prodi.find_one({"id": pid}, {"_id": 0})


@api_router.delete("/prodi/{pid}")
async def delete_prodi(pid: str, user: dict = Depends(require_role(ROLE_ADMIN))):
    await db.prodi.delete_one({"id": pid})
    await db.matakuliah.delete_many({"prodi_id": pid})
    return {"message": "Prodi dihapus"}


# ---------------------------------------------------------------------------
# Mata Kuliah CRUD
# ---------------------------------------------------------------------------
@api_router.get("/matakuliah")
async def list_matakuliah(fakultas_id: Optional[str] = None, prodi_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    if fakultas_id:
        q["fakultas_id"] = fakultas_id
    if prodi_id:
        q["prodi_id"] = prodi_id
    q = scoped_query(user, q)
    return await db.matakuliah.find(q, {"_id": 0}).sort("name", 1).to_list(1000)


@api_router.post("/matakuliah")
async def create_matakuliah(data: MataKuliah, user: dict = Depends(require_role(ROLE_ADMIN, ROLE_KAPRODI))):
    enforce_scope(user, data.fakultas_id, data.prodi_id)
    doc = data.model_dump()
    doc["id"] = str(uuid.uuid4())
    await db.matakuliah.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/matakuliah/{mid}")
async def update_matakuliah(mid: str, data: MataKuliah, user: dict = Depends(require_role(ROLE_ADMIN, ROLE_KAPRODI))):
    enforce_scope(user, data.fakultas_id, data.prodi_id)
    await db.matakuliah.update_one({"id": mid}, {"$set": data.model_dump()})
    return await db.matakuliah.find_one({"id": mid}, {"_id": 0})


@api_router.delete("/matakuliah/{mid}")
async def delete_matakuliah(mid: str, user: dict = Depends(require_role(ROLE_ADMIN, ROLE_KAPRODI))):
    await db.matakuliah.delete_one({"id": mid})
    return {"message": "Mata kuliah dihapus"}


# ---------------------------------------------------------------------------
# Grades
# ---------------------------------------------------------------------------
async def enrich_grade(doc: dict):
    mk = await db.matakuliah.find_one({"id": doc.get("mata_kuliah_id")}, {"_id": 0})
    fk = await db.fakultas.find_one({"id": doc.get("fakultas_id")}, {"_id": 0})
    pr = await db.prodi.find_one({"id": doc.get("prodi_id")}, {"_id": 0})
    doc["mata_kuliah_name"] = mk["name"] if mk else "-"
    doc["mata_kuliah_code"] = mk.get("code", "") if mk else ""
    doc["fakultas_name"] = fk["name"] if fk else "-"
    doc["prodi_name"] = pr["name"] if pr else "-"
    return doc


@api_router.get("/grades")
async def list_grades(
    fakultas_id: Optional[str] = None,
    prodi_id: Optional[str] = None,
    mata_kuliah_id: Optional[str] = None,
    tahun_akademik: Optional[str] = None,
    semester_type: Optional[str] = None,
    kelas: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    q = {}
    for k, v in [("fakultas_id", fakultas_id), ("prodi_id", prodi_id), ("mata_kuliah_id", mata_kuliah_id),
                 ("tahun_akademik", tahun_akademik), ("semester_type", semester_type), ("kelas", kelas)]:
        if v:
            q[k] = v
    q = scoped_query(user, q)
    docs = await db.grades.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    for d in docs:
        await enrich_grade(d)
    return docs


@api_router.post("/grades")
async def create_grade(data: GradeInput, user: dict = Depends(require_role(ROLE_ADMIN, ROLE_KAPRODI, ROLE_DOSEN))):
    enforce_scope(user, data.fakultas_id, data.prodi_id)
    cat_avg, total, grade, predicate = compute_scores(data.scores)
    doc = data.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["category_averages"] = cat_avg
    doc["total_score"] = total
    doc["grade"] = grade
    doc["predicate"] = predicate
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["updated_at"] = doc["created_at"]
    await db.grades.insert_one(doc)
    doc.pop("_id", None)
    await enrich_grade(doc)
    await log_audit(user, "buat", "nilai", doc["id"], f"{doc['mata_kuliah_name']} · {data.tahun_akademik} {data.semester_type} · Kelas {data.kelas}")
    return doc


@api_router.put("/grades/{gid}")
async def update_grade(gid: str, data: GradeInput, user: dict = Depends(require_role(ROLE_ADMIN, ROLE_KAPRODI, ROLE_DOSEN))):
    enforce_scope(user, data.fakultas_id, data.prodi_id)
    cat_avg, total, grade, predicate = compute_scores(data.scores)
    upd = data.model_dump()
    upd["category_averages"] = cat_avg
    upd["total_score"] = total
    upd["grade"] = grade
    upd["predicate"] = predicate
    upd["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.grades.update_one({"id": gid}, {"$set": upd})
    doc = await db.grades.find_one({"id": gid}, {"_id": 0})
    await enrich_grade(doc)
    await log_audit(user, "ubah", "nilai", gid, f"{doc['mata_kuliah_name']} · total {doc.get('total_score')}")
    return doc


@api_router.delete("/grades/{gid}")
async def delete_grade(gid: str, user: dict = Depends(require_role(ROLE_ADMIN, ROLE_KAPRODI, ROLE_DOSEN))):
    target = await db.grades.find_one({"id": gid}, {"_id": 0})
    if target:
        await enrich_grade(target)
    await db.grades.delete_one({"id": gid})
    await log_audit(user, "hapus", "nilai", gid, target.get("mata_kuliah_name", "") if target else "")
    return {"message": "Data nilai dihapus"}


class BulkRow(BaseModel):
    mata_kuliah_code: str
    tahun_akademik: str
    semester_type: str
    kelas: str
    semester_number: str
    scores: Dict[str, float]


class BulkInput(BaseModel):
    rows: List[BulkRow]


@api_router.post("/grades/bulk")
async def bulk_grades(data: BulkInput, user: dict = Depends(require_role(ROLE_ADMIN, ROLE_KAPRODI, ROLE_DOSEN))):
    created = 0
    errors = []
    now = datetime.now(timezone.utc).isoformat()
    for i, row in enumerate(data.rows):
        mk = await db.matakuliah.find_one({"code": row.mata_kuliah_code}, {"_id": 0})
        if not mk:
            errors.append(f"Baris {i + 1}: kode mata kuliah '{row.mata_kuliah_code}' tidak ditemukan")
            continue
        try:
            enforce_scope(user, mk["fakultas_id"], mk["prodi_id"])
        except HTTPException:
            errors.append(f"Baris {i + 1}: mata kuliah '{row.mata_kuliah_code}' di luar cakupan Anda")
            continue
        clean = {k: float(v) for k, v in (row.scores or {}).items() if k in {c["code"] for c in CRITERIA} and v not in (None, "")}
        if not clean:
            errors.append(f"Baris {i + 1}: tidak ada nilai kriteria CPL yang valid")
            continue
        cat_avg, total, grade, predicate = compute_scores(clean)
        doc = {
            "id": str(uuid.uuid4()), "fakultas_id": mk["fakultas_id"], "prodi_id": mk["prodi_id"],
            "mata_kuliah_id": mk["id"], "tahun_akademik": row.tahun_akademik, "semester_type": row.semester_type,
            "kelas": row.kelas, "semester_number": row.semester_number, "scores": clean,
            "category_averages": cat_avg, "total_score": total, "grade": grade, "predicate": predicate,
            "created_at": now, "updated_at": now,
        }
        await db.grades.insert_one(doc)
        created += 1
    await log_audit(user, "impor", "nilai", "", f"{created} data via CSV")
    return {"created": created, "errors": errors}


# ---------------------------------------------------------------------------
# Reports / Dashboard
# ---------------------------------------------------------------------------
@api_router.get("/reports/dashboard")
async def dashboard(
    fakultas_id: Optional[str] = None,
    prodi_id: Optional[str] = None,
    tahun_akademik: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    q = {}
    if fakultas_id:
        q["fakultas_id"] = fakultas_id
    if prodi_id:
        q["prodi_id"] = prodi_id
    if tahun_akademik:
        q["tahun_akademik"] = tahun_akademik
    q = scoped_query(user, q)
    grades = await db.grades.find(q, {"_id": 0}).to_list(5000)

    counts = {
        "fakultas": await db.fakultas.count_documents({}),
        "prodi": await db.prodi.count_documents({}),
        "matakuliah": await db.matakuliah.count_documents(scoped_query(user, {})),
        "grades": len(grades),
    }

    # per-category averages
    cat_sums = {k: [] for k in CATEGORIES}
    crit_sums = {c["code"]: [] for c in CRITERIA}
    grade_dist = {"A": 0, "B": 0, "C": 0, "D": 0, "E": 0}
    totals = []
    for g in grades:
        for k in CATEGORIES:
            v = (g.get("category_averages") or {}).get(k)
            if v is not None:
                cat_sums[k].append(v)
        for code, val in (g.get("scores") or {}).items():
            if code in crit_sums and val is not None:
                crit_sums[code].append(val)
        if g.get("grade") in grade_dist:
            grade_dist[g["grade"]] += 1
        if g.get("total_score") is not None:
            totals.append(g["total_score"])

    category_avg = [
        {"key": k, "name": CATEGORIES[k]["name"], "weight": CATEGORIES[k]["weight"],
         "color": CATEGORIES[k]["chart_color"],
         "average": round(sum(v) / len(v), 2) if v else 0}
        for k, v in cat_sums.items()
    ]
    criteria_avg = [
        {"code": c["code"], "label": c["label"], "category_key": c["category_key"],
         "average": round(sum(crit_sums[c["code"]]) / len(crit_sums[c["code"]]), 2) if crit_sums[c["code"]] else 0}
        for c in CRITERIA
    ]
    overall = round(sum(totals) / len(totals), 2) if totals else 0
    grade_distribution = [{"grade": k, "count": v} for k, v in grade_dist.items()]

    scope = {"role": user.get("role"), "prodi_name": None, "fakultas_name": None}
    if user.get("prodi_id"):
        pr = await db.prodi.find_one({"id": user["prodi_id"]}, {"_id": 0})
        scope["prodi_name"] = pr["name"] if pr else None
    if user.get("fakultas_id"):
        fk = await db.fakultas.find_one({"id": user["fakultas_id"]}, {"_id": 0})
        scope["fakultas_name"] = fk["name"] if fk else None

    return {
        "counts": counts,
        "overall_average": overall,
        "overall_predicate": predicate_for(overall if totals else None),
        "category_averages": category_avg,
        "criteria_averages": criteria_avg,
        "grade_distribution": grade_distribution,
        "scope": scope,
    }


# ---------------------------------------------------------------------------
# User management (admin only)
# ---------------------------------------------------------------------------
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str = ""
    role: str
    fakultas_id: Optional[str] = None
    prodi_id: Optional[str] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    fakultas_id: Optional[str] = None
    prodi_id: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


def public_user(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]), "email": doc["email"], "name": doc.get("name", ""),
        "role": doc.get("role", "dosen"), "fakultas_id": doc.get("fakultas_id"),
        "prodi_id": doc.get("prodi_id"), "is_active": doc.get("is_active", True),
    }


@api_router.get("/users")
async def list_users(admin: dict = Depends(require_role(ROLE_ADMIN))):
    docs = await db.users.find({}).sort("email", 1).to_list(1000)
    return [public_user(d) for d in docs]


@api_router.post("/users")
async def create_user(data: UserCreate, admin: dict = Depends(require_role(ROLE_ADMIN))):
    if data.role not in (ROLE_ADMIN, ROLE_KAPRODI, ROLE_DOSEN):
        raise HTTPException(status_code=400, detail="Role tidak valid")
    email = data.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email sudah terdaftar")
    doc = {
        "email": email, "password_hash": hash_password(data.password), "name": data.name,
        "role": data.role,
        "fakultas_id": data.fakultas_id if data.role != ROLE_ADMIN else None,
        "prodi_id": data.prodi_id if data.role != ROLE_ADMIN else None,
        "is_active": True, "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.users.insert_one(doc)
    doc["_id"] = res.inserted_id
    await log_audit(admin, "buat", "pengguna", str(res.inserted_id), f"{email} ({data.role})")
    return public_user(doc)


@api_router.put("/users/{uid}")
async def update_user(uid: str, data: UserUpdate, admin: dict = Depends(require_role(ROLE_ADMIN))):
    existing = await db.users.find_one({"_id": ObjectId(uid)})
    if not existing:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    if str(existing["_id"]) == admin["id"] and data.is_active is False:
        raise HTTPException(status_code=400, detail="Tidak dapat menonaktifkan akun sendiri")
    upd = {}
    for f in ("name", "role", "fakultas_id", "prodi_id", "is_active"):
        v = getattr(data, f)
        if v is not None:
            upd[f] = v
    if data.password:
        upd["password_hash"] = hash_password(data.password)
    if upd.get("role") == ROLE_ADMIN:
        upd["fakultas_id"] = None
        upd["prodi_id"] = None
    await db.users.update_one({"_id": ObjectId(uid)}, {"$set": upd})
    doc = await db.users.find_one({"_id": ObjectId(uid)})
    await log_audit(admin, "ubah", "pengguna", uid, f"{existing['email']}")
    return public_user(doc)


@api_router.delete("/users/{uid}")
async def delete_user(uid: str, admin: dict = Depends(require_role(ROLE_ADMIN))):
    target = await db.users.find_one({"_id": ObjectId(uid)})
    if not target:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    if str(target["_id"]) == admin["id"]:
        raise HTTPException(status_code=400, detail="Tidak dapat menghapus akun sendiri")
    if target.get("role") == ROLE_ADMIN and await db.users.count_documents({"role": ROLE_ADMIN, "is_active": True}) <= 1:
        raise HTTPException(status_code=400, detail="Tidak dapat menghapus admin terakhir")
    await db.users.delete_one({"_id": ObjectId(uid)})
    await log_audit(admin, "hapus", "pengguna", uid, target.get("email", ""))
    return {"message": "User dihapus"}


# ---------------------------------------------------------------------------
# Password reset (email link) + Audit log
# ---------------------------------------------------------------------------
class ResetPasswordInput(BaseModel):
    token: str
    new_password: str


@api_router.post("/users/{uid}/send-reset")
async def send_reset(uid: str, admin: dict = Depends(require_role(ROLE_ADMIN))):
    target = await db.users.find_one({"_id": ObjectId(uid)})
    if not target:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(hours=2)
    await db.password_resets.insert_one({
        "token": token, "user_id": str(target["_id"]), "email": target["email"],
        "expires_at": expires.isoformat(), "used": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    link = f"{FRONTEND_URL}/reset-password?token={token}"
    name = html_escape(target.get("name") or target["email"])
    html = (
        f'<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif;color:#0f172a">'
        f'<h2 style="color:#064E3B;margin:0 0 8px">Atur Ulang Kata Sandi</h2>'
        f'<p>Halo {name},</p>'
        f'<p>Admin {html_escape(EMAIL_FROM_NAME)} membuatkan tautan untuk mengatur ulang kata sandi akun Anda. '
        f'Klik tombol di bawah untuk membuat kata sandi baru. Tautan berlaku selama 2 jam.</p>'
        f'<p style="margin:24px 0"><a href="{link}" style="background:#064E3B;color:#ffffff;padding:12px 22px;'
        f'border-radius:8px;text-decoration:none;font-weight:bold">Atur Ulang Kata Sandi</a></p>'
        f'<p style="font-size:12px;color:#64748b">Jika tombol tidak berfungsi, salin dan tempel tautan berikut di peramban Anda:<br>{link}</p>'
        f'<p style="font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px;margin-top:16px">'
        f'Dikirim oleh {html_escape(EMAIL_FROM_NAME)}. Kami tidak pernah meminta kata sandi Anda melalui email. '
        f'Abaikan email ini bila Anda tidak merasa memintanya.</p></td></tr></table>'
    )
    email_sent = False
    email_error = None
    if EMAIL_KEY:
        try:
            await send_email(to=target["email"], subject=f"Atur Ulang Kata Sandi — {EMAIL_FROM_NAME}", html=html)
            email_sent = True
        except HTTPException:
            email_error = "Email gagal terkirim (alamat mungkin tidak valid). Bagikan tautan di bawah secara manual."
    await log_audit(admin, "kirim_reset", "pengguna", uid, f"reset sandi -> {target['email']} ({'email' if email_sent else 'manual'})")
    return {"status": "success", "email_sent": email_sent, "email": target["email"], "reset_link": link, "email_error": email_error, "expires_at": expires.isoformat()}


@api_router.get("/auth/reset-info")
async def reset_info(token: str):
    rec = await db.password_resets.find_one({"token": token}, {"_id": 0})
    if not rec or rec.get("used"):
        raise HTTPException(status_code=400, detail="Tautan tidak valid atau sudah digunakan")
    if datetime.now(timezone.utc) > datetime.fromisoformat(rec["expires_at"]):
        raise HTTPException(status_code=400, detail="Tautan sudah kedaluwarsa")
    return {"email": rec["email"], "valid": True}


@api_router.post("/auth/reset-password")
async def do_reset_password(data: ResetPasswordInput):
    rec = await db.password_resets.find_one({"token": data.token})
    if not rec or rec.get("used"):
        raise HTTPException(status_code=400, detail="Tautan tidak valid atau sudah digunakan")
    if datetime.now(timezone.utc) > datetime.fromisoformat(rec["expires_at"]):
        raise HTTPException(status_code=400, detail="Tautan sudah kedaluwarsa")
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Kata sandi minimal 6 karakter")
    await db.users.update_one({"_id": ObjectId(rec["user_id"])}, {"$set": {"password_hash": hash_password(data.new_password)}})
    await db.password_resets.update_one({"token": data.token}, {"$set": {"used": True, "used_at": datetime.now(timezone.utc).isoformat()}})
    await log_audit({"id": rec["user_id"], "email": rec["email"], "role": "-"}, "reset_sandi", "pengguna", rec["user_id"], "via tautan email")
    return {"status": "success", "email": rec["email"]}


@api_router.get("/audit")
async def list_audit(entity: Optional[str] = None, limit: int = 200, admin: dict = Depends(require_role(ROLE_ADMIN))):
    q = {}
    if entity:
        q["entity"] = entity
    return await db.audit_logs.find(q, {"_id": 0}).sort("timestamp", -1).to_list(min(limit, 500))


# ---------------------------------------------------------------------------
# Startup: seed admin + sample data + indexes
# ---------------------------------------------------------------------------
async def seed_admin():
    email = os.environ["ADMIN_EMAIL"].lower()
    password = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": email})
    if existing is None:
        await db.users.insert_one({
            "email": email, "password_hash": hash_password(password),
            "name": "Administrator UINSA", "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Admin seeded")
    elif not verify_password(password, existing["password_hash"]):
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(password)}})


async def seed_sample_data():
    if await db.fakultas.count_documents({}) > 0:
        return
    all_codes = [c["code"] for c in CRITERIA]
    fst = {"id": str(uuid.uuid4()), "name": "Fakultas Sains dan Teknologi", "code": "FST"}
    ftk = {"id": str(uuid.uuid4()), "name": "Fakultas Tarbiyah dan Keguruan", "code": "FTK"}
    await db.fakultas.insert_many([dict(fst), dict(ftk)])

    ti = {"id": str(uuid.uuid4()), "name": "Teknik Informatika", "code": "TI", "fakultas_id": fst["id"]}
    si = {"id": str(uuid.uuid4()), "name": "Sistem Informasi", "code": "SI", "fakultas_id": fst["id"]}
    pai = {"id": str(uuid.uuid4()), "name": "Pendidikan Agama Islam", "code": "PAI", "fakultas_id": ftk["id"]}
    await db.prodi.insert_many([dict(ti), dict(si), dict(pai)])

    matkul = [
        {"name": "Pemrograman Web", "code": "TI301", "sks": 3, "fakultas_id": fst["id"], "prodi_id": ti["id"], "cpl_codes": ["CPL-S1", "CPL-P1", "CPL-KU1", "CPL-KK1", "CPL-KK2"]},
        {"name": "Basis Data", "code": "TI202", "sks": 3, "fakultas_id": fst["id"], "prodi_id": ti["id"], "cpl_codes": ["CPL-P1", "CPL-P2", "CPL-KU1", "CPL-KK1"]},
        {"name": "Analisis Sistem Informasi", "code": "SI210", "sks": 3, "fakultas_id": fst["id"], "prodi_id": si["id"], "cpl_codes": ["CPL-S2", "CPL-P3", "CPL-KU2", "CPL-KK1", "CPL-KK3"]},
        {"name": "Ilmu Pendidikan Islam", "code": "PAI101", "sks": 2, "fakultas_id": ftk["id"], "prodi_id": pai["id"], "cpl_codes": ["CPL-S1", "CPL-S2", "CPL-S3", "CPL-P4", "CPL-KU1"]},
    ]
    for m in matkul:
        m["id"] = str(uuid.uuid4())
    await db.matakuliah.insert_many([dict(m) for m in matkul])
    logger.info("Sample academic data seeded")


async def seed_demo_users():
    if await db.users.count_documents({"role": {"$in": [ROLE_KAPRODI, ROLE_DOSEN]}}) > 0:
        return
    ti = await db.prodi.find_one({"code": "TI"})
    if not ti:
        return
    now = datetime.now(timezone.utc).isoformat()
    await db.users.insert_many([
        {"email": "kaprodi.ti@uinsa.ac.id", "password_hash": hash_password("kaprodi123"),
         "name": "Kaprodi Teknik Informatika", "role": ROLE_KAPRODI,
         "fakultas_id": ti["fakultas_id"], "prodi_id": ti["id"], "is_active": True, "created_at": now},
        {"email": "dosen.ti@uinsa.ac.id", "password_hash": hash_password("dosen123"),
         "name": "Dosen Teknik Informatika", "role": ROLE_DOSEN,
         "fakultas_id": ti["fakultas_id"], "prodi_id": ti["id"], "is_active": True, "created_at": now},
    ])
    logger.info("Demo kaprodi & dosen users seeded")


@app.on_event("startup")
async def on_startup():
    try:
        await db.users.create_index("email", unique=True)
    except Exception:
        pass
    await seed_admin()
    await seed_sample_data()
    await seed_demo_users()


@api_router.get("/")
async def root():
    return {"message": "Sistem Informasi CPL UINSA API"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000"), "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
