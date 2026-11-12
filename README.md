# PERKIM Monitor

Dashboard pemantauan untuk laman web **PERKIM Cawangan Kuala Langat**.

- Website: <https://perkimkualalangat.github.io/Website-PERKIM/>
- Dashboard: <https://perkimkualalangat.github.io/perkim-monitor/>
- Repo: <https://github.com/perkimkualalangat/perkim-monitor>

Dashboard ini awam, baca-sahaja dan tiada log masuk. Ia memaparkan snapshot data
yang dijana oleh audit automatik GitHub Actions. Tiada data sensitif disimpan di sini.

---

## Apa yang dipantau

| Bidang | Semakan |
| --- | --- |
| Halaman | 9 halaman awam, HTTP 200, masa respons, saiz HTML |
| Pautan | Pautan dalaman dan luaran, aset tempatan, CSS `url()` |
| Data | Semua fail JSON, `data/aktiviti.json`, sumber program |
| Program | Bilangan program, sorotan unik, alt text, fail gambar |
| R2 | 14 PDF dan 14 cover dalam bucket Cloudflare R2 |
| SEO | Tajuk, meta description, canonical, Open Graph, robots |
| Kebolehcapaian | `lang`, H1, alt text, skip link, label borang, `noopener` |
| Prestasi | Saiz HTML, gambar besar, Lighthouse mudah alih |
| Deploy | Commit terakhir, GitHub Actions, GitHub Pages, uptime |
| Keselamatan | Corak token/kunci dalam repo |

Skor keseluruhan 0–100 dikira mengikut kategori berwajaran. Nilai `unknown`
tidak dikira dalam skor.

---

## Struktur repo

```
perkim-monitor/
├─ index.html                 # shell dashboard
├─ css/monitor.css            # tema PERKIM hijau/emas
├─ js/
│  ├─ app.js                  # router dan shell
│  ├─ core/
│  │  ├─ data.js              # pemuat JSON
│  │  ├─ charts.js            # carta SVG
│  │  └─ ui.js                # ikon, format, komponen
│  └─ modules/                # 14 seksyen dashboard
├─ data/
│  ├─ config.json             # URL, halaman, ambang audit
│  ├─ checklist.json          # benih checklist operasi
│  ├─ status.json             # hasil audit terkini
│  ├─ history.json            # sejarah skor
│  ├─ uptime.json             # sejarah ketersediaan
│  └─ db/                     # snapshot JSON website
├─ tools/
│  ├─ audit.mjs               # orkestrator audit
│  ├─ check_static.py         # semakan statik repo website
│  ├─ lib/lighthouse.mjs      # Lighthouse + Chrome
│  └─ serve.mjs               # pelayan tempatan
├─ .github/workflows/audit.yml
├─ start-monitor.bat
└─ package.json
```

---

## Jalankan secara tempatan

Keperluan:

- Node.js 20 atau lebih baharu
- Python 3.10 atau lebih baharu
- Chrome atau Edge (untuk Lighthouse)
- Folder website di sebelah repo ini:

```
PERKIM/
├─ perkim-web/        # website sebenar
└─ perkim-monitor/    # repo ini
```

Langkah:

```bash
cd perkim-monitor
npm install

# Audit pantas (tanpa Lighthouse)
npm run audit

# Audit penuh
npm run audit:full

# Buka dashboard
npm run serve
# http://127.0.0.1:8082/
```

Di Windows, klik dua kali `start-monitor.bat`. Untuk Lighthouse:

```bat
start-monitor.bat --full
```

Jika Chrome tidak ditemui secara automatik, tetapkan `CHROME_PATH`:

```bat
set CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

---

## Data dan "pangkalan data"

Tiada pangkalan data boleh tulis di GitHub Pages. Konsep database di sini ialah
**snapshot JSON baca-sahaja**:

1. Workflow checkout `Website-PERKIM` ke folder `perkim-web/`.
2. `tools/audit.mjs` menyalin fail JSON website ke `data/db/`.
3. Audit live menyemak halaman, pautan, R2, GitHub dan Lighthouse.
4. `data/status.json`, `data/history.json`, `data/uptime.json` dan `data/db/`
   dikemas kini dan di-commit semula ke repo monitor.
5. Artifact Pages (`index.html`, `css/`, `js/`, `assets/`, `data/`) diterbitkan.

Untuk data boleh tulis sebenar (borang, log masuk, CMS), gunakan backend luar
seperti Supabase, Firebase atau API sendiri. Dashboard ini sengaja kekal statik.

### Checklist

- Benih: `data/checklist.json` (8 kumpulan, 48 item).
- Status yang diubah pengguna disimpan dalam `localStorage` pelayar.
- Eksport/import JSON disediakan untuk pindah antara peranti.
- Menghapuskan data pelayar akan reset checklist.

---

## Workflow GitHub Actions

Fail: `.github/workflows/audit.yml`

- Berjalan pada setiap push ke `main`, setiap 6 jam, dan secara manual.
- Checkout repo dashboard dan `perkimkualalangat/Website-PERKIM`.
- `npm ci`, jalankan audit penuh dengan Lighthouse.
- Commit perubahan data dengan mesej `[skip ci]`.
- Bina artifact Pages dan deploy melalui `actions/deploy-pages`.

Jika repo website menjadi peribadi, tambah secret `WEBSITE_REPO_TOKEN` dengan
token baca sahaja untuk repo tersebut. Jika tidak, workflow menggunakan
`github.token` untuk repo awam.

### Penting

- Jangan simpan PAT dalam fail, `.git/config`, atau workflow.
- Gunakan `GITHUB_TOKEN` automatik dalam Actions.
- Revoke/regenerate sebarang token yang pernah dipaparkan dalam chat atau log.
- Semak `git remote -v` sebelum push.

---

## Ambang audit

Boleh diubah dalam `data/config.json`:

```json
"ambang": {
  "masa_ms": 2500,
  "html_kb": 300,
  "gambar_kb": 500
}
```

- Masa respons > `masa_ms`: amaran.
- Saiz HTML > `html_kb`: amaran.
- Gambar > `gambar_kb`: amaran.
- Skor Lighthouse < 70: amaran; < 50: gagal.
- Semasa fasa `draf`, SEO Lighthouse tidak dikira kerana `noindex` disengajakan.

---

## Fasa pelancaran

Website kini dalam fasa **draf** (`noindex, nofollow`). Selepas kandungan dan
kepimpinan disahkan:

1. Tukar `data/config.json` → `site.fasa` kepada `"live"`.
2. Buang `noindex, nofollow` daripada halaman website.
3. Tambah canonical, Open Graph dan sitemap.
4. Jalankan `npm run audit:full` dan pastikan tiada kegagalan.
5. Push perubahan website, kemudian jalankan workflow monitor.

---

## Lesen dan kredit

Dibina untuk PERKIM Cawangan Kuala Langat. Imej dan kandungan program adalah
milik PERKIM. Dashboard ini menggunakan [Lighthouse](https://github.com/GoogleChrome/lighthouse)
dan [Cheerio](https://cheerio.js.org/).
