import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import './db'; // runs CREATE TABLE IF NOT EXISTS on startup
import { requireAuth } from './middleware/auth';
import authRouter from './routes/auth';
import adminRouter from './routes/admin';
import appsRouter from './routes/apps';
import { proxyRequest, proxyWebSocket } from './proxy';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

// ── Public routes ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);

// ── Protected routes ──────────────────────────────────────────────────────────
app.use('/api/apps', requireAuth, appsRouter);

// /app/:id/* — auth guard first, then SOCKS proxy.
// requireAuth also accepts ?token= query param for browser tabs that can't set
// Authorization headers (e.g. clicking a tile opens a new tab).
app.use('/app/', requireAuth, proxyRequest);

// ── Server ────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`nebius-portal backend listening on port ${PORT}`);
});

// WebSocket upgrades (Gradio uses WS on the same path as the HTTP app).
server.on('upgrade', proxyWebSocket);

export default app;
