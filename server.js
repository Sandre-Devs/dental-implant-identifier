require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const rateLimit = require('express-rate-limit');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://dii.sandre.dev',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em breve.' }
}));

app.use('/api/auth/login', rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas de login. Aguarde 10 minutos.' }
}));

app.use('/api/auth',          require('./routes/auth'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/images',        require('./routes/images'));
app.use('/api/annotations',   require('./routes/annotations'));
app.use('/api/manufacturers', require('./routes/manufacturers'));
app.use('/api/datasets',      require('./routes/datasets'));
app.use('/api/models',        require('./routes/models'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'DII — Dental Implant Identifier', version: '1.0.0' });
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  const idx = path.join(__dirname, 'public', 'index.html');
  const fs = require('fs');
  if (fs.existsSync(idx)) return res.sendFile(idx);
  res.json({ message: 'DII API running. Frontend not built yet.' });
});

app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ERROR:`, err.message);
  res.status(err.status || 500).json({ error: err.message || 'Erro interno.' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🦷 DII — Dental Implant Identifier`);
  console.log(`   → http://localhost:${PORT}`);
  console.log(`   → /api/health\n`);
});
