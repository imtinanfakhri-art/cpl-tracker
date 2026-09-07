"""Backend API tests for UINSA CPL app."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://competency-hub-35.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "imtinan.fakhri@gmail.com"
ADMIN_PASSWORD = "uinsa2024"


@pytest.fixture(scope="session")
def auth_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    body = r.json()
    assert "token" in body and body["email"] == ADMIN_EMAIL
    # Also add bearer as fallback
    s.headers.update({"Authorization": f"Bearer {body['token']}"})
    return s


# ---- Auth ----
class TestAuth:
    def test_login_ok(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j["email"] == ADMIN_EMAIL
        assert j["role"] == "admin"
        assert isinstance(j["token"], str) and len(j["token"]) > 20
        # httpOnly cookies set
        assert "access_token" in r.cookies
        assert "refresh_token" in r.cookies

    def test_login_bad_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_me_with_token(self, auth_session):
        r = auth_session.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_protected_endpoints_401(self):
        for path in ["/fakultas", "/prodi", "/matakuliah", "/grades", "/reports/dashboard"]:
            r = requests.get(f"{API}{path}", timeout=15)
            assert r.status_code == 401, f"{path} should be 401"


# ---- Meta ----
class TestMeta:
    def test_cpl_meta(self):
        r = requests.get(f"{API}/meta/cpl", timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert set(j["categories"].keys()) == {"sikap", "pengetahuan", "keterampilan_umum", "keterampilan_khusus"}
        assert j["categories"]["sikap"]["weight"] == 20
        assert j["categories"]["pengetahuan"]["weight"] == 10
        assert j["categories"]["keterampilan_umum"]["weight"] == 30
        assert j["categories"]["keterampilan_khusus"]["weight"] == 40
        assert len(j["criteria"]) == 12


# ---- Seed data / Master data ----
class TestSeedData:
    def test_fakultas_seed(self, auth_session):
        r = auth_session.get(f"{API}/fakultas", timeout=15)
        assert r.status_code == 200
        names = [x["name"] for x in r.json()]
        assert "Fakultas Sains dan Teknologi" in names
        assert "Fakultas Tarbiyah dan Keguruan" in names

    def test_prodi_seed(self, auth_session):
        r = auth_session.get(f"{API}/prodi", timeout=15)
        assert r.status_code == 200
        names = [x["name"] for x in r.json()]
        for n in ["Teknik Informatika", "Sistem Informasi", "Pendidikan Agama Islam"]:
            assert n in names

    def test_matakuliah_seed(self, auth_session):
        r = auth_session.get(f"{API}/matakuliah", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 4
        names = [x["name"] for x in data]
        for n in ["Pemrograman Web", "Basis Data", "Analisis Sistem Informasi", "Ilmu Pendidikan Islam"]:
            assert n in names


# ---- CRUD Fakultas ----
class TestFakultasCRUD:
    def test_crud(self, auth_session):
        # create
        r = auth_session.post(f"{API}/fakultas", json={"name": "TEST_FAK", "code": "TFK"}, timeout=15)
        assert r.status_code == 200
        fid = r.json()["id"]
        # update
        r = auth_session.put(f"{API}/fakultas/{fid}", json={"name": "TEST_FAK_UPD", "code": "TFK2"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_FAK_UPD"
        # list contains
        r = auth_session.get(f"{API}/fakultas", timeout=15)
        assert any(x["id"] == fid and x["name"] == "TEST_FAK_UPD" for x in r.json())
        # delete
        r = auth_session.delete(f"{API}/fakultas/{fid}", timeout=15)
        assert r.status_code == 200
        r = auth_session.get(f"{API}/fakultas", timeout=15)
        assert not any(x["id"] == fid for x in r.json())


# ---- CRUD Prodi ----
class TestProdiCRUD:
    def test_crud(self, auth_session):
        fak = auth_session.get(f"{API}/fakultas", timeout=15).json()[0]
        r = auth_session.post(f"{API}/prodi", json={"name": "TEST_PRODI", "code": "TPR", "fakultas_id": fak["id"]}, timeout=15)
        assert r.status_code == 200
        pid = r.json()["id"]
        # filter by fakultas
        r = auth_session.get(f"{API}/prodi", params={"fakultas_id": fak["id"]}, timeout=15)
        assert any(x["id"] == pid for x in r.json())
        # update
        r = auth_session.put(f"{API}/prodi/{pid}", json={"name": "TEST_PRODI_U", "code": "TPR", "fakultas_id": fak["id"]}, timeout=15)
        assert r.json()["name"] == "TEST_PRODI_U"
        # delete
        assert auth_session.delete(f"{API}/prodi/{pid}", timeout=15).status_code == 200


# ---- CRUD MataKuliah ----
class TestMataKuliahCRUD:
    def test_crud(self, auth_session):
        fak = auth_session.get(f"{API}/fakultas", timeout=15).json()[0]
        prodi = auth_session.get(f"{API}/prodi", params={"fakultas_id": fak["id"]}, timeout=15).json()[0]
        payload = {"name": "TEST_MK", "code": "TMK001", "sks": 3,
                   "fakultas_id": fak["id"], "prodi_id": prodi["id"],
                   "cpl_codes": ["CPL-S1", "CPL-KU1", "CPL-KK1"]}
        r = auth_session.post(f"{API}/matakuliah", json=payload, timeout=15)
        assert r.status_code == 200
        mid = r.json()["id"]
        # update
        payload["name"] = "TEST_MK_U"
        r = auth_session.put(f"{API}/matakuliah/{mid}", json=payload, timeout=15)
        assert r.json()["name"] == "TEST_MK_U"
        # delete
        assert auth_session.delete(f"{API}/matakuliah/{mid}", timeout=15).status_code == 200


# ---- Grades: weighted average correctness ----
class TestGrades:
    def test_create_grade_weighted_avg(self, auth_session):
        fak = auth_session.get(f"{API}/fakultas", timeout=15).json()[0]
        prodi = auth_session.get(f"{API}/prodi", params={"fakultas_id": fak["id"]}, timeout=15).json()[0]
        mks = auth_session.get(f"{API}/matakuliah", params={"prodi_id": prodi["id"]}, timeout=15).json()
        assert mks, "No matakuliah for prodi"
        mk = mks[0]
        # example from problem: S1=80 (sikap w20), KU1=90 (KU w30), KK1=100 (KK w40) -> 92.22
        payload = {
            "fakultas_id": fak["id"], "prodi_id": prodi["id"], "mata_kuliah_id": mk["id"],
            "tahun_akademik": "2024-2025", "semester_type": "Ganjil",
            "kelas": "A", "semester_number": "V",
            "scores": {"CPL-S1": 80, "CPL-KU1": 90, "CPL-KK1": 100},
        }
        r = auth_session.post(f"{API}/grades", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["total_score"] == 92.22
        assert j["grade"] == "A"
        assert j["category_averages"]["sikap"] == 80.0
        assert j["category_averages"]["keterampilan_umum"] == 90.0
        assert j["category_averages"]["keterampilan_khusus"] == 100.0
        assert j["category_averages"]["pengetahuan"] is None
        gid = j["id"]

        # verify list contains and persisted with enrichment
        r = auth_session.get(f"{API}/grades", timeout=15)
        assert any(x["id"] == gid and x.get("mata_kuliah_name") for x in r.json())

        # update - change one score
        payload["scores"] = {"CPL-S1": 50, "CPL-KU1": 50, "CPL-KK1": 50}
        r = auth_session.put(f"{API}/grades/{gid}", json=payload, timeout=15)
        assert r.status_code == 200
        assert r.json()["total_score"] == 50.0
        assert r.json()["grade"] == "D"

        # delete
        assert auth_session.delete(f"{API}/grades/{gid}", timeout=15).status_code == 200
        r = auth_session.get(f"{API}/grades", timeout=15)
        assert not any(x["id"] == gid for x in r.json())

    def test_grade_multiple_criteria_per_category(self, auth_session):
        fak = auth_session.get(f"{API}/fakultas", timeout=15).json()[0]
        prodi = auth_session.get(f"{API}/prodi", params={"fakultas_id": fak["id"]}, timeout=15).json()[0]
        mk = auth_session.get(f"{API}/matakuliah", params={"prodi_id": prodi["id"]}, timeout=15).json()[0]
        # sikap avg=(80+70+60)/3=70; pengetahuan=(90+80+70+100)/4=85 ; KU=(60+80)/2=70; KK=(90+80+70)/3=80
        # weighted = (70*20+85*10+70*30+80*40)/(20+10+30+40) = (1400+850+2100+3200)/100 = 7550/100 = 75.5
        scores = {"CPL-S1": 80, "CPL-S2": 70, "CPL-S3": 60,
                  "CPL-P1": 90, "CPL-P2": 80, "CPL-P3": 70, "CPL-P4": 100,
                  "CPL-KU1": 60, "CPL-KU2": 80,
                  "CPL-KK1": 90, "CPL-KK2": 80, "CPL-KK3": 70}
        payload = {"fakultas_id": fak["id"], "prodi_id": prodi["id"], "mata_kuliah_id": mk["id"],
                   "tahun_akademik": "2024-2025", "semester_type": "Genap",
                   "kelas": "B", "semester_number": "VI", "scores": scores}
        r = auth_session.post(f"{API}/grades", json=payload, timeout=15)
        j = r.json()
        assert j["total_score"] == 75.5
        assert j["grade"] == "B"
        auth_session.delete(f"{API}/grades/{j['id']}", timeout=15)


# ---- Dashboard ----
class TestDashboard:
    def test_dashboard_shape(self, auth_session):
        r = auth_session.get(f"{API}/reports/dashboard", timeout=15)
        assert r.status_code == 200
        j = r.json()
        for k in ["counts", "overall_average", "overall_predicate", "category_averages", "criteria_averages", "grade_distribution"]:
            assert k in j, f"missing {k}"
        assert set(j["counts"].keys()) >= {"fakultas", "prodi", "matakuliah", "grades"}
        assert len(j["category_averages"]) == 4
        assert len(j["criteria_averages"]) == 12
        assert len(j["grade_distribution"]) == 5
