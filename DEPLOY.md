# Deploy & Auto-Deploy

## 1. Jalankan bot dengan PM2

```bash
cd ~/growvia-work
npm install
npx pm2 start ecosystem.config.js     # menjalankan: growvia (bot) + growvia-webhook
npx pm2 save
npx pm2 startup                       # ikuti perintah yang ditampilkan (auto-start saat boot)
```

> **Sebelum pertama kali menjalankan versi Viaz**: jalankan `supabase/migration_viaz.sql`
> di Supabase SQL Editor. Tanpa itu bot error karena kolom baru belum ada.

| Perintah | Fungsi |
|---|---|
| `pm2 list` | Daftar proses |
| `pm2 logs growvia` | Log bot |
| `pm2 logs growvia-webhook` | Log webhook deploy |
| `pm2 restart growvia` | Restart bot |

## 2. Auto-deploy saat push ke `main`

Alur: push ke `main` → GitHub memanggil webhook → server `git pull --ff-only` →
`npm install` (hanya jika dependency berubah) → `npm test` → restart bot.
**Kalau tes gagal, bot yang sedang berjalan tidak di-restart** dan hasilnya dikirim ke Discord.

### .env

```env
PORT=4000
WEBHOOK_SECRET=<string acak panjang>      # wajib; webhook menolak start kalau kosong
DEPLOY_DISCORD_WEBHOOK=<url webhook Discord>   # opsional: laporan deploy ke Discord
```

Buat secret acak: `openssl rand -hex 32`

### Webhook di GitHub

`Settings → Webhooks → Add webhook`

| Field | Isi |
|---|---|
| Payload URL | `http://IP_ATAU_DOMAIN_SERVER:4000/webhook/deploy` |
| Content type | `application/json` |
| Secret | sama persis dengan `WEBHOOK_SECRET` |
| Events | **Just the push event** |

Atau lewat `gh`:

```bash
gh api repos/RebanaDev/Growvia/hooks \
  -f name=web \
  -f 'config[url]=http://IP_ATAU_DOMAIN_SERVER:4000/webhook/deploy' \
  -f 'config[content_type]=json' \
  -f "config[secret]=ISI_WEBHOOK_SECRET" \
  -f 'events[]=push'
```

Server harus bisa dijangkau dari internet. Kalau berada di balik NAT / jaringan rumah, pakai tunnel (bagian 3).

Keamanan webhook: setiap request wajib bertanda tangan `X-Hub-Signature-256`. Request tanpa tanda
tangan valid ditolak (401). Hanya push ke branch `main` yang memicu deploy. Cek hidup: `GET /health`.

### Notifikasi Discord

Webhook GitHub → Discord (URL berakhiran `/github`) dipasang langsung di GitHub, jadi tidak perlu
GitHub Actions untuk notifikasi push. `DEPLOY_DISCORD_WEBHOOK` hanya untuk laporan sukses/gagal deploy.
Jangan pernah commit URL webhook Discord; simpan di `.env`.

## 3. Tunnel publik (server di jaringan rumah)

`tunnel.js` (proses PM2 `growvia-tunnel`) menjalankan Cloudflare quick tunnel ke port webhook, lalu
otomatis membuat/memperbarui hook `/webhook/deploy` di GitHub lewat `gh`. Tidak butuh akun atau domain.
Hook lain (mis. notifikasi Discord) tidak disentuh.

```bash
# sekali saja: pasang cloudflared dan login gh
mkdir -p ~/.local/bin
curl -fsSL -o ~/.local/bin/cloudflared \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x ~/.local/bin/cloudflared
gh auth login

npx pm2 start ecosystem.config.js --only growvia-webhook,growvia-tunnel
```

Catatan:
- URL quick tunnel **berubah setiap tunnel restart**. Skrip memperbarui hook GitHub otomatis, tetapi
  push yang terjadi di jeda beberapa detik itu tidak memicu deploy. Cek `pm2 logs growvia-tunnel`.
- Tunnel ini tidak ada SLA. Untuk produksi, pakai **named tunnel** dengan domain Cloudflare sendiri
  (URL tetap): hapus `growvia-tunnel` dari `ecosystem.config.js`, jalankan `cloudflared tunnel` sesuai
  dokumentasi Cloudflare, lalu buat hook dengan perintah `gh api` di atas.
- Pakai `CLOUDFLARED_BIN`, `GH_BIN`, `GITHUB_REPO` di `.env` jika lokasi/nama berbeda.

## 4. Deploy manual

```bash
cd ~/growvia-work
git pull --ff-only origin main
npm install
npm test
npx pm2 restart growvia
```
