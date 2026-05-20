# Ollodan

Coordinate Systembolaget special-order beer with friends: collect product links, vote, split quantities across a case (24).

## Stack

- **Frontend:** HTML, CSS, TypeScript (no framework)
- **Backend:** ASP.NET Core 10, SQLite, EF Core
- **Deploy:** Single Docker image (API serves static files)

## Local development

```bash
npm install
npm run dev
```

Open **http://localhost:5210**. SQLite (`api/Ollodan.Api/ollodan.db`) is created and migrated on startup.

Group links: `http://localhost:5210/g/{group-id}`

### Docker

```bash
docker compose up --build
```

Data persists in the `ollodan-data` volume.

## Deploy (Fly.io)

```bash
fly launch
fly volumes create ollodan_data --size 1
# Set ConnectionStrings__Default=Data Source=/data/ollodan.db in fly.toml
fly deploy
```

One URL serves both UI and API. No separate database server required.

## Flow

1. Create group → share `/g/{id}`, save admin link with `?key=…`
2. **Collecting** — paste Systembolaget product URLs
3. Admin starts **Voting**
4. Admin ends voting (pick winner manually on a tie)
5. **Ordering** — each person sets quantity; case counter shows progress toward 24
6. Admin closes → **Closed** summary

## Legal note

For coordinating a legal Systembolaget purchase and cost sharing — not for reselling alcohol between private parties. 20+ only.
