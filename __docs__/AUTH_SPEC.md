# AUTH_SPEC.md - Authentication & Admin Approval Flow

**Applies to:** `backend/` and `frontend/`
**Storage:** SQLite for users and user refresh-token hashes. Admin is env-backed.
**Status:** Implemented in the current repo.

---

## Summary

The portal uses local JWT auth with an admin approval flow:

- Users sign up and start as `pending`.
- Pending or rejected users cannot log in.
- The admin logs in through a separate admin route using env-backed credentials.
- The admin can approve, reject, delete, and list users.
- Approved users can log in and access the portal.
- `/api/apps` and `/app/` routes require a user JWT.
- `/api/admin/*` management routes require a superadmin JWT.

There is no database admin user. The admin identity comes from environment
variables only.

---

## User flow

```text
Signup at /signup
  -> POST /api/auth/signup
  -> users.status = "pending"
  -> no JWT issued

Admin approves at /admin/users
  -> PATCH /api/admin/users/:id/approve
  -> users.status = "approved"

User logs in at /login
  -> POST /api/auth/login
  -> accessToken + refreshToken + user profile
  -> accessToken stored in Zustand memory
  -> refreshToken currently stored by frontend in localStorage
```

Rejected users receive `403 Account rejected`. Pending users receive
`403 Account pending approval`.

---

## Admin flow

```text
Admin login at /admin
  -> POST /api/admin/login
  -> compare email to ADMIN_EMAIL
  -> compare password to ADMIN_PASSWORD_HASH with bcrypt
  -> issue accessToken + refreshToken with role "superadmin"

Admin management
  -> GET /api/admin/users
  -> GET /api/admin/users/pending
  -> PATCH /api/admin/users/:id/approve
  -> PATCH /api/admin/users/:id/reject
  -> DELETE /api/admin/users/:id
  -> GET /api/admin/notifications/count
```

Admin refresh tokens are signed JWTs and are not inserted into
`refresh_tokens`, because there is no admin row in `users`.

---

## Environment variables

```bash
JWT_SECRET=<random 64 hex chars>
JWT_REFRESH_SECRET=<different random 64 hex chars>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

ADMIN_EMAIL=<admin email>
ADMIN_PASSWORD_HASH=<bcrypt hash, cost 12>
```

Generate secrets:

```bash
openssl rand -hex 32
```

Generate the admin password hash:

```bash
node -e 'require("bcrypt").hash("your-password", 12).then(console.log)'
```

---

## SQLite schema

Defined in `backend/src/db.ts`.

```sql
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

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  token_hash  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

Status values:

- `pending`
- `approved`
- `rejected`

Role values:

- `user` for database users.
- `superadmin` for env-backed admin JWTs only.

---

## Token behavior

| Token | Secret | Expiry | Storage |
|---|---|---|---|
| User access token | `JWT_SECRET` | `JWT_EXPIRES_IN`, default `15m` | Frontend Zustand memory |
| User refresh token | `JWT_REFRESH_SECRET` | `JWT_REFRESH_EXPIRES_IN`, default `7d` | Client receives plaintext token; DB stores SHA-256 hash |
| Admin access token | `JWT_SECRET` | `JWT_EXPIRES_IN`, default `15m` | Frontend admin Zustand memory |
| Admin refresh token | `JWT_REFRESH_SECRET` | `JWT_REFRESH_EXPIRES_IN`, default `7d` | Client receives token; DB does not store it |

Access-token payload:

```json
{
  "userId": "...",
  "email": "...",
  "role": "user"
}
```

Admin access-token payload:

```json
{
  "userId": "admin",
  "email": "...",
  "role": "superadmin"
}
```

User refresh-token lookup:

1. Verify refresh token with `JWT_REFRESH_SECRET`.
2. Hash incoming token with SHA-256.
3. Look up `refresh_tokens.token_hash`.
4. Ensure the linked user exists and is still `approved`.
5. Issue a new access token.

Admin refresh-token lookup:

1. Verify refresh token with `JWT_REFRESH_SECRET`.
2. Check `payload.role === "superadmin"` and `payload.userId === "admin"`.
3. Issue a new admin access token.

---

## Backend routes

### Auth routes

Mounted at `/api/auth` in `backend/src/index.ts`.

| Method | Path | Auth | Behavior |
|---|---|---|---|
| `POST` | `/signup` | None | Create pending user; no token issued |
| `POST` | `/login` | None | Approved users get access + refresh tokens |
| `POST` | `/refresh` | None | Validate refresh token and issue access token |
| `POST` | `/logout` | User JWT | Delete refresh-token hash |
| `GET` | `/me` | User JWT | Return current user from SQLite |

### Admin routes

Mounted at `/api/admin`.

| Method | Path | Auth | Behavior |
|---|---|---|---|
| `POST` | `/login` | None | Env-backed admin login |
| `GET` | `/users` | Admin JWT | List all users |
| `GET` | `/users/pending` | Admin JWT | List pending users |
| `PATCH` | `/users/:id/approve` | Admin JWT | Set status to `approved` |
| `PATCH` | `/users/:id/reject` | Admin JWT | Set status to `rejected` |
| `DELETE` | `/users/:id` | Admin JWT | Delete user |
| `GET` | `/notifications/count` | Admin JWT | Return `{ pendingCount }` |

### Protected app routes

Mounted in `backend/src/index.ts`:

```ts
app.use('/api/apps', requireAuth, appsRouter);
app.use('/app/', requireAuth, proxyRequest);
```

`requireAuth` accepts:

- `Authorization: Bearer <token>`
- `?token=<token>` query param for browser tabs opened to `/app/:id/`

The query-token path is necessary because clicking an app tile opens a new tab,
where the browser cannot attach an Authorization header.

---

## Frontend behavior

Routes are defined in `frontend/src/App.tsx`.

| Path | Component | Guard |
|---|---|---|
| `/login` | `LoginPage` | Public |
| `/signup` | `SignupPage` | Public |
| `/` | `AppGrid` | `RequireAuth` |
| `/admin` | `AdminLogin` | Public |
| `/admin/dashboard` | `AdminDashboard` | `RequireAdmin` |
| `/admin/users` | `AdminUsers` | `RequireAdmin` |

State:

- `useAuthStore`: user access token, user profile, initialization state.
- `useAdminStore`: admin access token.
- `useToastStore`: toast messages.

Current session restore behavior:

- On app load, `App.tsx` reads `refreshToken` from `localStorage`.
- If present, it calls `POST /api/auth/refresh`.
- It then calls `GET /api/auth/me` with the new access token.
- If refresh fails, it removes `refreshToken` and treats the user as logged out.

Security note: access tokens are in memory only. User refresh tokens currently
persist in `localStorage`; moving them to HttpOnly cookies would reduce XSS
exposure but requires backend/frontend changes.

---

## Implementation invariants

- Do not write the admin to SQLite.
- Do not store plaintext user refresh tokens in SQLite.
- Keep `requireAuth` on both `/api/apps` and `/app/`.
- Keep `requireAdmin` on all admin management routes.
- Do not relax user status checks during login or refresh.
- Use bcrypt cost 12 for password hashes.
- Use separate Zustand stores for user and admin auth.
- Avoid adding OAuth or Entra ID on top of this flow unless the task explicitly
  asks for a migration.
