export const CATEGORIES = [
  { key: "sikap", name: "Sikap", weight: 20, color: "#059669" },
  { key: "pengetahuan", name: "Pengetahuan", weight: 10, color: "#D97706" },
  { key: "keterampilan_umum", name: "Keterampilan Umum", weight: 30, color: "#0D9488" },
  { key: "keterampilan_khusus", name: "Keterampilan Khusus", weight: 40, color: "#EAB308" },
];

export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

export const CRITERIA = [
  { code: "CPL-S1", category_key: "sikap", label: "Bertaqwa kepada Tuhan YME dan menunjukkan sikap religius" },
  { code: "CPL-S2", category_key: "sikap", label: "Menjunjung tinggi nilai kemanusiaan, etika, dan integritas akademik" },
  { code: "CPL-S3", category_key: "sikap", label: "Berkontribusi dalam peningkatan mutu kehidupan bermasyarakat" },
  { code: "CPL-P1", category_key: "pengetahuan", label: "Menguasai konsep teoritis bidang keilmuan secara mendalam" },
  { code: "CPL-P2", category_key: "pengetahuan", label: "Menguasai metodologi penelitian dan pemikiran logis, kritis" },
  { code: "CPL-P3", category_key: "pengetahuan", label: "Menguasai standar nasional & internasional pengembangan program" },
  { code: "CPL-P4", category_key: "pengetahuan", label: "Menguasai prinsip integrasi keilmuan Islam dan sains modern" },
  { code: "CPL-KU1", category_key: "keterampilan_umum", label: "Mampu menerapkan pemikiran logis, kritis, sistematis, inovatif" },
  { code: "CPL-KU2", category_key: "keterampilan_umum", label: "Mampu mengambil keputusan tepat dalam penyelesaian masalah" },
  { code: "CPL-KK1", category_key: "keterampilan_khusus", label: "Mampu merancang & mengimplementasikan karya keahlian prodi" },
  { code: "CPL-KK2", category_key: "keterampilan_khusus", label: "Mampu evaluasi & supervisi kualitas hasil kerja bidang studi" },
  { code: "CPL-KK3", category_key: "keterampilan_khusus", label: "Mampu beradaptasi dengan inovasi teknologi & industri global" },
];

export const CRITERIA_MAP = Object.fromEntries(CRITERIA.map((c) => [c.code, c]));

export const codesByCategory = (key) => CRITERIA.filter((c) => c.category_key === key).map((c) => c.code);

export const SEMESTER_TYPES = ["Ganjil", "Genap"];
export const KELAS = ["A", "B", "C", "D"];
export const SEMESTER_NUMBERS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

export const TAHUN_AKADEMIK = (() => {
  const out = [];
  for (let y = 2020; y <= 2027; y++) out.push(`${y}-${y + 1}`);
  return out;
})();

export const LOGO_URL =
  "https://customer-assets-rejwkqb3.emergentagent.net/job_d77d2e32-92b6-4a5f-8e92-c98005f2a252/artifacts/jvsjfuzl_Universitas-Islam-negeri-UIN-Sunan-Ampel-Logo.png";

export function predicateFor(score) {
  if (score == null) return { grade: "-", predicate: "-", color: "text-slate-500 bg-slate-50 border-slate-200" };
  if (score >= 85) return { grade: "A", predicate: "Sangat Memuaskan", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (score >= 75) return { grade: "B", predicate: "Memuaskan", color: "text-amber-700 bg-amber-50 border-amber-200" };
  if (score >= 65) return { grade: "C", predicate: "Cukup", color: "text-yellow-800 bg-yellow-50 border-yellow-200" };
  if (score >= 50) return { grade: "D", predicate: "Kurang", color: "text-orange-700 bg-orange-50 border-orange-200" };
  return { grade: "E", predicate: "Gagal", color: "text-rose-700 bg-rose-50 border-rose-200" };
}

export function computeScores(scores) {
  const category_averages = {};
  let presentWeight = 0;
  let weightedSum = 0;
  for (const cat of CATEGORIES) {
    const vals = codesByCategory(cat.key)
      .map((code) => scores[code])
      .filter((v) => v !== undefined && v !== null && v !== "" && !Number.isNaN(Number(v)))
      .map(Number);
    if (vals.length) {
      const avg = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
      category_averages[cat.key] = avg;
      presentWeight += cat.weight;
      weightedSum += avg * cat.weight;
    } else {
      category_averages[cat.key] = null;
    }
  }
  const total = presentWeight > 0 ? Math.round((weightedSum / presentWeight) * 100) / 100 : null;
  return { category_averages, total };
}

export const fmt = (v) => (v == null || v === "" ? "-" : Number(v).toFixed(2));
