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
        user["id"] = str(user["_id"])
        user.pop("_id", None)
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token kedaluwarsa")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token tidak valid")


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
    uid = str(user["_id"])
    access = create_access_token(uid, email)
    refresh = create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    return {"id": uid, "email": user["email"], "name": user.get("name", ""), "role": user.get("role", "admin"), "token": access}


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
async def create_fakultas(data: Fakultas, user: dict = Depends(get_current_user)):
    doc = data.model_dump()
    doc["id"] = str(uuid.uuid4())
    await db.fakultas.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/fakultas/{fid}")
async def update_fakultas(fid: str, data: Fakultas, user: dict = Depends(get_current_user)):
    await db.fakultas.update_one({"id": fid}, {"$set": data.model_dump()})
    return await db.fakultas.find_one({"id": fid}, {"_id": 0})


@api_router.delete("/fakultas/{fid}")
async def delete_fakultas(fid: str, user: dict = Depends(get_current_user)):
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
async def create_prodi(data: Prodi, user: dict = Depends(get_current_user)):
    doc = data.model_dump()
    doc["id"] = str(uuid.uuid4())
    await db.prodi.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/prodi/{pid}")
async def update_prodi(pid: str, data: Prodi, user: dict = Depends(get_current_user)):
    await db.prodi.update_one({"id": pid}, {"$set": data.model_dump()})
    return await db.prodi.find_one({"id": pid}, {"_id": 0})


@api_router.delete("/prodi/{pid}")
async def delete_prodi(pid: str, user: dict = Depends(get_current_user)):
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
    return await db.matakuliah.find(q, {"_id": 0}).sort("name", 1).to_list(1000)


@api_router.post("/matakuliah")
async def create_matakuliah(data: MataKuliah, user: dict = Depends(get_current_user)):
    doc = data.model_dump()
    doc["id"] = str(uuid.uuid4())
    await db.matakuliah.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/matakuliah/{mid}")
async def update_matakuliah(mid: str, data: MataKuliah, user: dict = Depends(get_current_user)):
    await db.matakuliah.update_one({"id": mid}, {"$set": data.model_dump()})
    return await db.matakuliah.find_one({"id": mid}, {"_id": 0})


@api_router.delete("/matakuliah/{mid}")
async def delete_matakuliah(mid: str, user: dict = Depends(get_current_user)):
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
    docs = await db.grades.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    for d in docs:
        await enrich_grade(d)
    return docs


@api_router.post("/grades")
async def create_grade(data: GradeInput, user: dict = Depends(get_current_user)):
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
    return doc


@api_router.put("/grades/{gid}")
async def update_grade(gid: str, data: GradeInput, user: dict = Depends(get_current_user)):
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
    return doc


@api_router.delete("/grades/{gid}")
async def delete_grade(gid: str, user: dict = Depends(get_current_user)):
    await db.grades.delete_one({"id": gid})
    return {"message": "Data nilai dihapus"}


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
    grades = await db.grades.find(q, {"_id": 0}).to_list(5000)

    counts = {
        "fakultas": await db.fakultas.count_documents({}),
        "prodi": await db.prodi.count_documents({}),
        "matakuliah": await db.matakuliah.count_documents({}),
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

    return {
        "counts": counts,
        "overall_average": overall,
        "overall_predicate": predicate_for(overall if totals else None),
        "category_averages": category_avg,
        "criteria_averages": criteria_avg,
        "grade_distribution": grade_distribution,
    }


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


@app.on_event("startup")
async def on_startup():
    try:
        await db.users.create_index("email", unique=True)
    except Exception:
        pass
    await seed_admin()
    await seed_sample_data()


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
