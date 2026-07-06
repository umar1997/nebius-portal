# AUTH_SPEC.md — Authentication & Admin Approval Flow

**Applies to:** nebius-portal backend + frontend
**Storage:** SQLite (same database as app list — no separate service)

---

## What this adds

- Users register → land in `pending` state → cannot use the portal yet
- Admin logs in via a separate route → sees pending users → approves or rejects
- Approved users can log in and use the portal normally
- All `/api/apps` and `/app/` routes require a valid JWT

---

## Flow

```
User signs up (/signup)
      │
      ▼
status = pending → cannot log in yet
      │
      ▼
Admin sees pending user at /admin/users
      │
      ├── Approve → status = approved → user can now log in
      └── Reject  → status = rejected → user cannot log in
```

---

## SQLite schema (add to existing database)

```sql
-- Add to the same db.ts that manages the apps table

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);
-- status values: 'pending' | 'approved' | 'rejected'
-- role values:   'user' (superadmin is env-only, never in DB)

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  token_hash  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## Environment variables (add to `.env`)

```bash
# JWT
JWT_SECRET=<random 64 char string>           # openssl rand -hex 32
JWT_REFRESH_SECRET=<different random string>  # openssl rand -hex 32
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Superadmin — never stored in DB
ADMIN_EMAIL=admin@yourcompany.com
ADMIN_PASSWORD_HASH=<bcrypt hash>
# Generate hash: node -e "const b=require('bcrypt');b.hash('yourpassword',12).then(console.log)"
```

---

## API endpoints

### Auth (users)

| Method | Path | Auth required | Purpose |
|--------|------|---------------|---------|
| `POST` | `/api/auth/signup` | None | Register — creates pending user |
| `POST` | `/api/auth/login` | None | Login — approved users only |
| `POST` | `/api/auth/refresh` | None | Get new access token |
| `POST` | `/api/auth/logout` | User JWT | Delete refresh token |
| `GET` | `/api/auth/me` | User JWT | Current user profile |

### Admin

| Method | Path | Auth required | Purpose |
|--------|------|---------------|---------|
| `POST` | `/api/admin/login` | None | Admin login (env credentials) |
| `GET` | `/api/admin/users` | Admin JWT | List all users |
| `GET` | `/api/admin/users/pending` | Admin JWT | List pending users only |
| `PATCH` | `/api/admin/users/:id/approve` | Admin JWT | Approve a user |
| `PATCH` | `/api/admin/users/:id/reject` | Admin JWT | Reject a user |
| `DELETE` | `/api/admin/users/:id` | Admin JWT | Delete a user |
| `GET` | `/api/admin/notifications/count` | Admin JWT | Count of pending users |

### Protected routes (add JWT middleware to existing routes)
All existing `/api/apps` and `/app/` routes require a valid user JWT.

---

## Endpoint details

### POST /api/auth/signup
```
Body:     { name, email, password, confirmPassword }
Returns:  201 { message: "Account pending admin approval" }
Errors:   400 if passwords don't match or email taken
```
- Hash password with bcrypt, cost factor 12
- Create user with `status: 'pending'`
- Do NOT issue a JWT

### POST /api/auth/login
```
Body:     { email, password }
Returns:  200 { accessToken, refreshToken, user }
Errors:   401 invalid credentials
          403 "Account pending approval" (correct password but not approved)
          403 "Account rejected"
```
- Check password with bcrypt
- Check `status === 'approved'` before issuing tokens
- Store hashed refresh token in `refresh_tokens` table

### POST /api/admin/login
```
Body:     { email, password }
Returns:  200 { accessToken, refreshToken }
```
- Compare email against `ADMIN_EMAIL` env var
- Compare password against `ADMIN_PASSWORD_HASH` with bcrypt
- JWT payload: `{ userId: 'admin', email, role: 'superadmin' }`
- Admin is **never** in the database

### PATCH /api/admin/users/:id/approve
```
Returns:  200 { user }
```
- Set `status = 'approved'` and `updated_at = datetime('now')`

---

## JWT details

| Token | Secret | Expiry | Where stored |
|-------|--------|--------|--------------|
| Access token | `JWT_SECRET` | 15 min | Frontend memory (Zustand store) |
| Refresh token | `JWT_REFRESH_SECRET` | 7 days | SQLite `refresh_tokens` table (hashed) |

Access token payload: `{ userId, email, role, iat, exp }`

The refresh token itself is sent to the client. Its hash is stored in the DB.
On refresh, hash the incoming token and compare — never store plaintext tokens.

---

## Middleware

### `requireAuth` — protects user routes
```ts
// Checks Authorization: Bearer <token>
// Decodes JWT, attaches user to req.user
// Returns 401 if missing or expired
```

### `requireAdmin` — protects admin routes
```ts
// Same as requireAuth but also checks role === 'superadmin'
// Returns 403 if role is wrong
```

Apply to routes:
```ts
router.get('/api/apps', requireAuth, getApps);
router.use('/app/', requireAuth, proxyHandler);
router.get('/api/admin/users', requireAdmin, getUsers);
```

---

## Frontend routes

Add to the existing React SPA — no separate deployment:

| Route | Component | Guard |
|-------|-----------|-------|
| `/signup` | SignupPage | Redirect to `/` if already logged in |
| `/login` | LoginPage | Redirect to `/` if already logged in |
| `/` | AppGrid | `RequireAuth` — redirect to `/login` if not logged in |
| `/admin` | AdminLogin | Redirect to `/admin/dashboard` if already admin |
| `/admin/dashboard` | AdminDashboard | `RequireAdmin` |
| `/admin/users` | AdminUsers | `RequireAdmin` |

### State management (Zustand)

```ts
// User store
{
  accessToken: string | null,
  user: { id, name, email, role } | null,
  setAuth: (token, user) => void,
  clearAuth: () => void,
}

// Admin store (separate)
{
  adminToken: string | null,
  setAdminToken: (token) => void,
  clearAdminToken: () => void,
}
```

Store access tokens in memory only (Zustand). Use refresh token flow to
silently re-authenticate on page reload. Do not store access tokens in
localStorage — XSS risk.

---

## Admin UI (pages)

### /admin — admin login
Simple email + password form. On success, stores admin JWT and redirects to
`/admin/dashboard`.

### /admin/dashboard
- Count of pending users (badge)
- Quick approve/reject from dashboard

### /admin/users
- Table: name, email, status, registered date, actions
- Filter tabs: All / Pending / Approved / Rejected
- Per-row actions: Approve (green), Reject (red), Delete
- Pending count badge in nav, polls every 60 seconds

---

## What does NOT change

- The SQLite database file location and connection — just add the two new tables
- The SOCKS5 tunnel — auth is entirely on the Azure VM, tunnel is untouched
- The app list API structure — just add `requireAuth` middleware to it
- The nginx config — no changes needed

---

## Build order for this feature

1. Add `users` and `refresh_tokens` tables to `db.ts`
2. Install: `npm install bcrypt jsonwebtoken` + types
3. Build auth endpoints (`/api/auth/*`)
4. Build admin endpoints (`/api/admin/*`)
5. Write `requireAuth` and `requireAdmin` middleware
6. Apply middleware to existing `/api/apps` and `/app/` routes
7. Build frontend: Login, Signup, AdminLogin, AdminUsers pages
8. Add route guards to React router
9. Test the full flow: signup → pending → admin approves → login works

---

## Generating the admin password hash

Run this once on the VM to generate `ADMIN_PASSWORD_HASH` for your `.env`:

```bash
node -e "
const bcrypt = require('bcrypt');
bcrypt.hash('your-chosen-password', 12).then(h => console.log(h));
"
```

Paste the output into `.env` as `ADMIN_PASSWORD_HASH`.