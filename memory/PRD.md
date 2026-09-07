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

## Backlog
- P1: Filter tambahan pada tabel data nilai; ekspor Excel.
- P2: Multi-user & role (Kaprodi/Dosen), brute-force lockout, import nilai CSV.
