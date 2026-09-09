# PRD — Sistem Informasi CPL UINSA

## Problem Statement
Aplikasi penghitungan pencapaian Capaian Kompetensi Lulusan (CPL) untuk UIN Sunan Ampel Surabaya. 12 kriteria CPL dalam 4 kategori berbobot: Sikap 20% (3 kriteria), Pengetahuan 10% (4), Keterampilan Umum 30% (2), Keterampilan Khusus 40% (3). Nilai skala 0-100, 2 desimal.

## Architecture
- Backend: FastAPI + MongoDB (motor). JWT httpOnly cookie auth (bcrypt). Routes prefixed `/api`.
- Frontend: React 19 + CRA/craco, Tailwind + shadcn/ui, recharts, jsPDF. Alias `@`→src.
- Weighted total = Σ(avg_kategori × bobot) / Σ(bobot kategori yang ada nilainya) — renormalisasi.

## User Personas
- Admin/Dosen pengelola CPL (single role).

## Core Requirements (static)
1. Dropdown Semester (Ganjil/Genap), Tahun Akademik (2020-2021 dst), Kategori & kriteria CPL, Kelas A-D, Semester I-VIII.
2. Input nilai tiap kriteria CPL per mata kuliah/tahun/kelas.
3. Rata-rata terbobot 20/10/30/40.
4. Laporan diagram + tabel; cetak per tahun akademik / mata kuliah / CPL.
5. CRUD Fakultas & Prodi; CRUD Mata Kuliah dikelompokkan per fakultas/prodi.
6. Warna: putih, hijau gelap, gold, hitam. Logo UINSA.

## Implemented (2026-06-07)
- JWT login (admin: imtinan.fakhri@gmail.com), seed admin + sample data (2 fakultas, 3 prodi, 4 matakuliah).
- Dashboard: KPI, banner rata-rata terbobot, Bar/Pie/Radar charts.
- Input Nilai CPL dengan pratinjau perhitungan live + tabel data tersimpan (edit/hapus).
- CRUD Fakultas/Prodi (master-detail), CRUD Mata Kuliah (dialog + pilih kriteria CPL).
- Laporan 3 jenis (tahun/mata kuliah/CPL) dengan chart+tabel, cetak browser & unduh PDF (jsPDF).
- Verified: 15/15 backend tests pass; E2E flows pass. Weighted calc 92.22 (A) verified.

## Implemented (2026-06-08) — Iterasi 2
- RBAC 3 peran: admin (penuh), kaprodi (kelola MK + nilai + laporan, scoped prodi), dosen (nilai + laporan, scoped prodi). require_role + scoped_query + enforce_scope di backend, nav berbasis role di frontend. Login menolak akun nonaktif.
- Manajemen Pengguna (admin): CRUD user + toggle aktif + proteksi hapus/nonaktif diri & admin terakhir. Demo user: kaprodi.ti@uinsa.ac.id/kaprodi123, dosen.ti@uinsa.ac.id/dosen123.
- Impor Nilai Massal via CSV (/api/grades/bulk) + unduh template.
- Ekspor laporan ke Excel (xlsx) selain PDF.
- Filter & pencarian pada tabel data nilai (halaman Input).
- Verified: 18/18 backend tests iterasi 2 pass (33/33 kumulatif); E2E role-based flows pass.

## Implemented (2026-06-09) — Iterasi 3
- Ringkasan Prodi: kartu ringkasan pencapaian CPL (prodi, fakultas, rata-rata, jumlah data & MK) di Dashboard untuk kaprodi/dosen (scoped); admin lihat global. Field `scope` di /api/reports/dashboard.
- Reset Kata Sandi: admin kirim tautan reset via email (Resend managed). Token sekali pakai, berlaku 2 jam. Fallback: bila email tak terkirim, admin dapat tautan untuk disalin. Halaman publik /reset-password (validasi token + form). Endpoint: /api/users/{id}/send-reset, /api/auth/reset-info, /api/auth/reset-password.
- Audit Log: catat perubahan data nilai & akun (pelaku, aksi, entitas, waktu, keterangan) via log_audit(); halaman admin /audit dengan filter. Endpoint /api/audit (admin only).
- Verified: 16/16 backend tests iterasi 3 pass (49/49 kumulatif); E2E reset & audit & prodi summary pass.

## Catatan
- Email hanya terkirim ke alamat deliverable (Resend managed). Demo user berdomain fiktif -> gunakan fallback tautan salin.

## Backlog
- P2: prune token reset kadaluarsa terjadwal; pagination audit log; impor Excel (.xlsx) untuk nilai massal.
