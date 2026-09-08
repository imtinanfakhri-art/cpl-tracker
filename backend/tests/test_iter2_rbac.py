"""RBAC, scope enforcement, user management, and bulk grades tests (iteration 2)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://competency-hub-35.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("imtinan.fakhri@gmail.com", "uinsa2024")
KAPRODI = ("kaprodi.ti@uinsa.ac.id", "kaprodi123")
DOSEN = ("dosen.ti@uinsa.ac.id", "dosen123")


def login_session(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    body = r.json()
    s.headers.update({"Authorization": f"Bearer {body['token']}"})
    s._me = body
    return s


@pytest.fixture(scope="module")
def admin_s():
    return login_session(*ADMIN)


@pytest.fixture(scope="module")
def kaprodi_s():
    return login_session(*KAPRODI)


@pytest.fixture(scope="module")
def dosen_s():
    return login_session(*DOSEN)


@pytest.fixture(scope="module")
def ti_ids(admin_s):
    fak = next(f for f in admin_s.get(f"{API}/fakultas", timeout=15).json() if f["code"] == "FST")
    ti = next(p for p in admin_s.get(f"{API}/prodi", timeout=15).json() if p["code"] == "TI")
    si = next(p for p in admin_s.get(f"{API}/prodi", timeout=15).json() if p["code"] == "SI")
    return {"fakultas": fak, "ti": ti, "si": si}


# ---- RBAC: user list is admin-only ----
class TestUsersRBAC:
    def test_dosen_cannot_list_users(self, dosen_s):
        assert dosen_s.get(f"{API}/users", timeout=15).status_code == 403

    def test_kaprodi_cannot_list_users(self, kaprodi_s):
        assert kaprodi_s.get(f"{API}/users", timeout=15).status_code == 403

    def test_admin_can_list_users(self, admin_s):
        r = admin_s.get(f"{API}/users", timeout=15)
        assert r.status_code == 200
        emails = [u["email"] for u in r.json()]
        assert ADMIN[0] in emails and KAPRODI[0] in emails and DOSEN[0] in emails


# ---- RBAC: master data guards ----
class TestMasterDataRBAC:
    def test_dosen_cannot_create_fakultas(self, dosen_s):
        assert dosen_s.post(f"{API}/fakultas", json={"name": "X", "code": "X"}, timeout=15).status_code == 403

    def test_dosen_cannot_create_prodi(self, dosen_s, ti_ids):
        assert dosen_s.post(f"{API}/prodi", json={"name": "X", "code": "X", "fakultas_id": ti_ids["fakultas"]["id"]}, timeout=15).status_code == 403

    def test_dosen_cannot_create_matakuliah(self, dosen_s, ti_ids):
        payload = {"name": "X", "code": "XX", "sks": 3,
                   "fakultas_id": ti_ids["fakultas"]["id"], "prodi_id": ti_ids["ti"]["id"], "cpl_codes": []}
        assert dosen_s.post(f"{API}/matakuliah", json=payload, timeout=15).status_code == 403

    def test_kaprodi_cannot_create_fakultas(self, kaprodi_s):
        assert kaprodi_s.post(f"{API}/fakultas", json={"name": "X", "code": "X"}, timeout=15).status_code == 403

    def test_kaprodi_can_create_matakuliah_own_prodi(self, kaprodi_s, ti_ids, admin_s):
        code = f"TESTKP{uuid.uuid4().hex[:5].upper()}"
        payload = {"name": "TEST_MK_KP", "code": code, "sks": 3,
                   "fakultas_id": ti_ids["fakultas"]["id"], "prodi_id": ti_ids["ti"]["id"],
                   "cpl_codes": ["CPL-S1"]}
        r = kaprodi_s.post(f"{API}/matakuliah", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        mid = r.json()["id"]
        # cleanup
        admin_s.delete(f"{API}/matakuliah/{mid}", timeout=15)

    def test_kaprodi_cannot_create_matakuliah_other_prodi(self, kaprodi_s, ti_ids):
        payload = {"name": "TEST_MK_OTH", "code": f"TESTSI{uuid.uuid4().hex[:5]}", "sks": 3,
                   "fakultas_id": ti_ids["fakultas"]["id"], "prodi_id": ti_ids["si"]["id"], "cpl_codes": []}
        r = kaprodi_s.post(f"{API}/matakuliah", json=payload, timeout=15)
        assert r.status_code == 403


# ---- Scope enforcement on GET & POST grades ----
class TestScopeEnforcement:
    def test_dosen_matakuliah_scoped(self, dosen_s, ti_ids):
        r = dosen_s.get(f"{API}/matakuliah", timeout=15)
        assert r.status_code == 200
        for m in r.json():
            assert m["prodi_id"] == ti_ids["ti"]["id"], f"leak: {m}"

    def test_kaprodi_matakuliah_scoped(self, kaprodi_s, ti_ids):
        r = kaprodi_s.get(f"{API}/matakuliah", timeout=15)
        assert r.status_code == 200
        for m in r.json():
            assert m["prodi_id"] == ti_ids["ti"]["id"]

    def test_dosen_create_grade_other_prodi_forbidden(self, dosen_s, ti_ids, admin_s):
        # find SI matakuliah
        si_mks = admin_s.get(f"{API}/matakuliah", params={"prodi_id": ti_ids["si"]["id"]}, timeout=15).json()
        assert si_mks
        payload = {"fakultas_id": ti_ids["fakultas"]["id"], "prodi_id": ti_ids["si"]["id"],
                   "mata_kuliah_id": si_mks[0]["id"], "tahun_akademik": "2024-2025",
                   "semester_type": "Ganjil", "kelas": "A", "semester_number": "V",
                   "scores": {"CPL-S1": 80}}
        assert dosen_s.post(f"{API}/grades", json=payload, timeout=15).status_code == 403

    def test_grades_list_scoped_for_dosen(self, dosen_s, ti_ids):
        r = dosen_s.get(f"{API}/grades", timeout=15)
        assert r.status_code == 200
        for g in r.json():
            assert g["prodi_id"] == ti_ids["ti"]["id"]


# ---- User management CRUD (admin) ----
class TestUserManagement:
    def test_full_user_lifecycle(self, admin_s, ti_ids):
        email = f"test_user_{uuid.uuid4().hex[:6]}@uinsa.ac.id"
        payload = {"email": email, "password": "pass1234", "name": "Test Dosen",
                   "role": "dosen", "fakultas_id": ti_ids["fakultas"]["id"], "prodi_id": ti_ids["ti"]["id"]}
        r = admin_s.post(f"{API}/users", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        uid = r.json()["id"]
        assert r.json()["role"] == "dosen"
        assert r.json()["is_active"] is True

        # duplicate email -> 409
        r2 = admin_s.post(f"{API}/users", json=payload, timeout=15)
        assert r2.status_code == 409

        # update: deactivate
        r = admin_s.put(f"{API}/users/{uid}", json={"is_active": False}, timeout=15)
        assert r.status_code == 200 and r.json()["is_active"] is False

        # login should fail now
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "pass1234"}, timeout=15)
        # Either 401 on login (verify_password ok, but user inactive) — get_current_user rejects; login itself may still succeed because seed rehash path...
        # Login flow doesn't check is_active, but /auth/me will 401. Accept either behaviour.
        if r.status_code == 200:
            s2 = requests.Session()
            s2.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
            me = s2.get(f"{API}/auth/me", timeout=15)
            assert me.status_code == 401

        # delete
        r = admin_s.delete(f"{API}/users/{uid}", timeout=15)
        assert r.status_code == 200

    def test_admin_cannot_delete_self(self, admin_s):
        me = admin_s.get(f"{API}/auth/me", timeout=15).json()
        r = admin_s.delete(f"{API}/users/{me['id']}", timeout=15)
        assert r.status_code == 400

    def test_admin_cannot_deactivate_self(self, admin_s):
        me = admin_s.get(f"{API}/auth/me", timeout=15).json()
        r = admin_s.put(f"{API}/users/{me['id']}", json={"is_active": False}, timeout=15)
        assert r.status_code == 400


# ---- Bulk grades ----
class TestBulkGrades:
    def test_bulk_admin_creates_and_reports_errors(self, admin_s):
        rows = [
            {"mata_kuliah_code": "TI301", "tahun_akademik": "2024-2025", "semester_type": "Ganjil",
             "kelas": "A", "semester_number": "V", "scores": {"CPL-S1": 80, "CPL-KU1": 90, "CPL-KK1": 100}},
            {"mata_kuliah_code": "TI202", "tahun_akademik": "2024-2025", "semester_type": "Ganjil",
             "kelas": "A", "semester_number": "IV", "scores": {"CPL-P1": 75, "CPL-KU1": 75}},
            {"mata_kuliah_code": "NOTEXIST", "tahun_akademik": "2024-2025", "semester_type": "Ganjil",
             "kelas": "A", "semester_number": "V", "scores": {"CPL-S1": 80}},
        ]
        r = admin_s.post(f"{API}/grades/bulk", json={"rows": rows}, timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["created"] == 2
        assert any("NOTEXIST" in e for e in j["errors"])

        # cleanup 2 newly created grades matching TI301/TI202 + kelas A + 2024-2025 (fresh)
        grades = admin_s.get(f"{API}/grades", params={"tahun_akademik": "2024-2025", "kelas": "A"}, timeout=15).json()
        for g in grades:
            if g.get("mata_kuliah_code") in ("TI301", "TI202") and g.get("semester_number") in ("V", "IV"):
                admin_s.delete(f"{API}/grades/{g['id']}", timeout=15)

    def test_bulk_kaprodi_own_scope_only(self, kaprodi_s, admin_s):
        # Try bulk with mixed codes: TI301 (own) and SI210 (other)
        rows = [
            {"mata_kuliah_code": "TI301", "tahun_akademik": "2024-2025", "semester_type": "Genap",
             "kelas": "Z", "semester_number": "V", "scores": {"CPL-S1": 60}},
            {"mata_kuliah_code": "SI210", "tahun_akademik": "2024-2025", "semester_type": "Genap",
             "kelas": "Z", "semester_number": "V", "scores": {"CPL-S1": 60}},
        ]
        r = kaprodi_s.post(f"{API}/grades/bulk", json={"rows": rows}, timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert j["created"] == 1
        assert any("SI210" in e for e in j["errors"])
        # cleanup
        gs = admin_s.get(f"{API}/grades", params={"tahun_akademik": "2024-2025", "kelas": "Z"}, timeout=15).json()
        for g in gs:
            admin_s.delete(f"{API}/grades/{g['id']}", timeout=15)
