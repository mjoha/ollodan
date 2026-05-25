# Deploy Ollodan at ollodan.derp.net

One Docker image serves both the web UI and the API. SQLite data lives in a Docker volume.

## What you need

| Item | Example |
|------|---------|
| Server with Docker | Your “little server” |
| Public IP | e.g. `203.0.113.10` |
| DNS | `ollodan.derp.net` → that IP (A record, or AAAA for IPv6) |
| Ports open | **80** and **443** (for HTTPS via Caddy) |

No separate database server. No Node on the host — only Docker.

## Option A — Caddy in Docker (recommended)

Uses the files in this `deploy/` folder: Ollodan + Caddy with automatic HTTPS.

### 1. DNS

At your DNS provider for `derp.net`:

- **Type:** `A` (or `AAAA`)
- **Name:** `ollodan` (→ `ollodan.derp.net`)
- **Value:** your server’s public IP

Wait until it resolves (`dig ollodan.derp.net`).

### 2. Copy the app to the server

```bash
ssh you@your-server
git clone <your-repo-url> ollodan
cd ollodan/deploy
```

Or copy the project with `rsync`/`scp` if you do not use git on the server.

### 3. Set your hostname

Edit `deploy/Caddyfile` and replace `ollodan.derp.net` if you use another subdomain.

### 4. Start

```bash
docker compose up -d --build
```

- App listens inside Docker on port **8080**
- Caddy listens on **80/443** and proxies to the app
- Database file: volume `ollodan-data` → `/data/ollodan.db`

Check:

```bash
docker compose ps
docker compose logs -f ollodan
curl -s https://ollodan.derp.net/health
```

Open **https://ollodan.derp.net** in a browser.

### 5. Updates

```bash
cd ~/ollodan
git pull
cd deploy
docker compose up -d --build
```

Data in `ollodan-data` is kept across rebuilds.

---

## Option B — Caddy (or nginx) already on the server

Do **not** start the `caddy` service in `deploy/docker-compose.yml` if you already use Caddy for WireGuard or other sites.

### 1. Load image and run app only

```bash
docker load < ollodan-image.tar.gz
cd deploy   # copy this folder to the server if needed
docker compose -f docker-compose.app-only.yml up -d
```

App listens on **127.0.0.1:5210** (localhost only).

Check: `curl -s http://127.0.0.1:5210/health`

### 2. Add site to your existing Caddyfile

Edit whatever Caddy already uses (examples):

| Setup | Config path |
|--------|-------------|
| Caddy systemd | `/etc/caddy/Caddyfile` |
| Caddy Docker | volume mount, e.g. `./Caddyfile` next to your WireGuard compose |

Add a **new site block** (keep your WireGuard block as-is):

```caddy
ollodan.derp.net {
	reverse_proxy 127.0.0.1:5210
}
```

If Caddy runs **in Docker** and must reach the host port:

```caddy
ollodan.derp.net {
	reverse_proxy host.docker.internal:5210
}
```

(Linux Docker 20.10+: add `extra_hosts: ["host.docker.internal:host-gateway"]` on the Caddy service if that name does not resolve.)

Or put **Ollodan on the same Docker network** as Caddy and use:

```caddy
ollodan.derp.net {
	reverse_proxy ollodan:8080
}
```

(then use `docker-compose.app-only.yml` without publishing `5210`, and attach both services to the same `networks`.)

### 3. Apply Caddy config

**Caddy installed on the host (systemd):**

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
# or: sudo caddy reload --config /etc/caddy/Caddyfile
```

**Caddy in Docker:**

```bash
docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

(Replace `caddy` with your WireGuard stack’s Caddy service name.)

Caddy will request a certificate for `ollodan.derp.net` on first request (DNS must already point here).

### 4. Verify

```bash
curl -s https://ollodan.derp.net/health
```

Open **https://ollodan.derp.net** in a browser.

---

## Option C — nginx / Traefik (no Caddy)

Run only the app container (no Caddy from this repo):

```bash
cd ollodan
docker compose up -d --build
```

That publishes **5210:8080** (see root `docker-compose.yml`). Point your reverse proxy at `http://127.0.0.1:5210` (or the container IP on your Docker network).

Example **nginx** server block:

```nginx
server {
    listen 443 ssl http2;
    server_name ollodan.derp.net;

    # ssl_certificate ... (your certbot / acme setup)

    location / {
        proxy_pass http://127.0.0.1:5210;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

The app enables forwarded headers in **Production**, so redirects and links work behind HTTPS.

---

## Option D — App only, no reverse proxy (not for production)

```bash
docker compose up -d --build
# http://SERVER_IP:5210
```

Fine for testing; use HTTPS on a real domain for sharing group links.

---

## Firewall

Allow inbound **80** and **443** (if using Caddy). You do **not** need to expose 8080 or 5210 publicly if the proxy runs on the same host.

---

## Backups

SQLite file is inside the volume:

```bash
docker compose exec ollodan ls -la /data/
docker run --rm -v deploy_ollodan-data:/data -v $(pwd):/backup alpine \
  cp /data/ollodan.db /backup/ollodan-$(date +%F).db
```

(Volume name may be `deploy_ollodan-data` — check with `docker volume ls`.)

---

## Troubleshooting

| Problem | What to check |
|---------|----------------|
| 502 / connection refused | `docker compose logs ollodan` — app crashed? |
| Certificate errors | DNS must point to this server before Caddy can issue certs |
| Old UI after deploy | Hard refresh; image was rebuilt with `docker compose up -d --build` |
| API 404 on actions | Restart after pull — stale container without new routes |
| `wwwroot missing` in logs | Build failed in Dockerfile frontend stage — check `docker compose build` output |

Health check: `GET /health` → `{"status":"ok"}`.

---

## How it fits together

```text
Browser → https://ollodan.derp.net
         → Caddy (:443)
         → Ollodan container (:8080)
              ├── static files (wwwroot)
              ├── /api/...
              └── /g/{id} redirects
         → SQLite /data/ollodan.db
```

Frontend is built with an empty API base URL, so all requests go to the same host — no extra CORS setup in production.
