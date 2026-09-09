"""Iteration 3: prodi summary scope, password reset flow, audit log."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://competency-hub-35.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("imtinan.fakhri@gmail.com", "uinsa2024")
KAPRODI = ("kaprodi.ti@uinsa.ac.id", "kaprodi123")
DOSEN = ("dosen.ti@uinsa.ac.id", "dosen123")


def login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


@pytest.fixture(scope="module")
def admin_s():
    return login(*ADMIN)


@pytest.fixture(scope="module")
def kaprodi_s():
    return login(*KAPRODI)


@pytest.fixture(scope="module")
def dosen_s():
    return login(*DOSEN)


# ---- Dashboard scope object ----
class TestDashboardScope:
    def test_admin_scope_no_prodi(self, admin_s):
        j = admin_s.get(f"{API}/reports/dashboard", timeout=15).json()
        assert "scope" in j
        assert j["scope"]["role"] == "admin"
        assert j["scope"].get("prodi_name") in (None, "")

    def test_kaprodi_scope_has_prodi(self, kaprodi_s):
        j = kaprodi_s.get(f"{API}/reports/dashboard", timeout=15).json()
        assert j["scope"]["role"] == "kaprodi"
        assert j["scope"]["prodi_name"] == "Teknik Informatika"
        assert j["scope"]["fakultas_name"] and "Sains" in j["scope"]["fakultas_name"]

    def test_dosen_scope_has_prodi(self, dosen_s):
        j = dosen_s.get(f"{API}/reports/dashboard", timeout=15).json()
        assert j["scope"]["role"] == "dosen"
        assert j["scope"]["prodi_name"] == "Teknik Informatika"


# ---- Password reset ----
@pytest.fixture(scope="module")
def test_user(admin_s):
    fak = next(f for f in admin_s.get(f"{API}/fakultas", timeout=15).json() if f["code"] == "FST")
    ti = next(p for p in admin_s.get(f"{API}/prodi", timeout=15).json() if p["code"] == "TI")
    email = f"test_reset_{uuid.uuid4().hex[:6]}@uinsa.ac.id"
    r = admin_s.post(f"{API}/users", json={
        "email": email, "password": "initial123", "name": "TEST Reset User",
        "role": "dosen", "fakultas_id": fak["id"], "prodi_id": ti["id"],
    }, timeout=15)
    assert r.status_code == 200, r.text
    uid = r.json()["id"]
    yield {"id": uid, "email": email}
    admin_s.delete(f"{API}/users/{uid}", timeout=15)


class TestPasswordReset:
    def test_non_admin_cannot_send_reset(self, dosen_s, test_user):
        assert dosen_s.post(f"{API}/users/{test_user['id']}/send-reset", timeout=15).status_code == 403

    def test_kaprodi_cannot_send_reset(self, kaprodi_s, test_user):
        assert kaprodi_s.post(f"{API}/users/{test_user['id']}/send-reset", timeout=15).status_code == 403

    def test_admin_send_reset_returns_link(self, admin_s, test_user):
        r = admin_s.post(f"{API}/users/{test_user['id']}/send-reset", timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "reset_link" in j and "token=" in j["reset_link"]
        assert "expires_at" in j
        assert "email_sent" in j
        # store on test_user for downstream tests
        test_user["reset_link"] = j["reset_link"]
        test_user["token"] = j["reset_link"].split("token=")[1]

    def test_reset_info_valid(self, test_user):
        r = requests.get(f"{API}/auth/reset-info", params={"token": test_user["token"]}, timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == test_user["email"]

    def test_reset_info_invalid_token(self):
        r = requests.get(f"{API}/auth/reset-info", params={"token": "bogus_token_xyz"}, timeout=15)
        assert r.status_code == 400

    def test_reset_password_short(self, test_user):
        r = requests.post(f"{API}/auth/reset-password",
                          json={"token": test_user["token"], "new_password": "abc"}, timeout=15)
        assert r.status_code == 400

    def test_reset_password_success_and_login(self, test_user):
        new_pw = "NewPass123!"
        r = requests.post(f"{API}/auth/reset-password",
                          json={"token": test_user["token"], "new_password": new_pw}, timeout=15)
        assert r.status_code == 200
        # login with new password
        r2 = requests.post(f"{API}/auth/login",
                           json={"email": test_user["email"], "password": new_pw}, timeout=15)
        assert r2.status_code == 200, r2.text
        assert r2.json()["email"] == test_user["email"]

    def test_reset_token_reuse_fails(self, test_user):
        r = requests.post(f"{API}/auth/reset-password",
                          json={"token": test_user["token"], "new_password": "AnotherPass1"}, timeout=15)
        assert r.status_code == 400


# ---- Audit log ----
class TestAuditLog:
    def test_non_admin_forbidden(self, dosen_s):
        assert dosen_s.get(f"{API}/audit", timeout=15).status_code == 403

    def test_kaprodi_forbidden(self, kaprodi_s):
        assert kaprodi_s.get(f"{API}/audit", timeout=15).status_code == 403

    def test_admin_list_audit(self, admin_s):
        r = admin_s.get(f"{API}/audit", timeout=15)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list)
        # should contain kirim_reset entries from earlier tests, and user create entries
        actions = {a.get("action") for a in arr}
        entities = {a.get("entity") for a in arr}
        assert "pengguna" in entities
        # every entry has required fields
        for a in arr[:5]:
            for k in ("actor_email", "action", "entity", "timestamp"):
                assert k in a, f"missing {k} in {a}"

    def test_audit_entity_filter(self, admin_s):
        r = admin_s.get(f"{API}/audit", params={"entity": "pengguna"}, timeout=15)
        assert r.status_code == 200
        for a in r.json():
            assert a["entity"] == "pengguna"

    def test_audit_records_grade_mutation(self, admin_s):
        # create a grade -> should audit "buat" on entity "nilai"
        fak = next(f for f in admin_s.get(f"{API}/fakultas", timeout=15).json() if f["code"] == "FST")
        ti = next(p for p in admin_s.get(f"{API}/prodi", timeout=15).json() if p["code"] == "TI")
        mk = admin_s.get(f"{API}/matakuliah", params={"prodi_id": ti["id"]}, timeout=15).json()[0]
        payload = {
            "fakultas_id": fak["id"], "prodi_id": ti["id"], "mata_kuliah_id": mk["id"],
            "tahun_akademik": "2024-2025", "semester_type": "Ganjil",
            "kelas": "AUDIT", "semester_number": "V",
            "scores": {"CPL-S1": 70, "CPL-KU1": 80},
        }
        r = admin_s.post(f"{API}/grades", json=payload, timeout=15)
        assert r.status_code == 200
        gid = r.json()["id"]
        # fetch audit filtered
        entries = admin_s.get(f"{API}/audit", params={"entity": "nilai"}, timeout=15).json()
        assert any(e.get("entity_id") == gid and e.get("action") == "buat" for e in entries)
        # cleanup
        admin_s.delete(f"{API}/grades/{gid}", timeout=15)
        entries2 = admin_s.get(f"{API}/audit", params={"entity": "nilai"}, timeout=15).json()
        assert any(e.get("entity_id") == gid and e.get("action") == "hapus" for e in entries2)
