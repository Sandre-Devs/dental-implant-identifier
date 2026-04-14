// utils/detectionLogger.js
// Singleton de logs em memória com broadcast via SSE

class DetectionLogger {
  constructor() {
    this.logs    = [];
    this.clients = [];
    this.maxLogs = 500;
  }

  _entry(level, message, meta = {}) {
    const entry = {
      id:        `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      level,
      message,
      meta
    };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) this.logs.shift();
    this._broadcast(entry);
    const prefix = `[DII-${level.toUpperCase()}]`;
    if (level === 'error') console.error(prefix, message, meta);
    else                   console.log(prefix, message, meta);
    return entry;
  }

  info   (msg, meta = {}) { return this._entry('info',    msg, meta); }
  success(msg, meta = {}) { return this._entry('success', msg, meta); }
  warn   (msg, meta = {}) { return this._entry('warn',    msg, meta); }
  error  (msg, meta = {}) { return this._entry('error',   msg, meta); }
  debug  (msg, meta = {}) { return this._entry('debug',   msg, meta); }

  _broadcast(entry) {
    const payload = `data: ${JSON.stringify(entry)}\n\n`;
    this.clients = this.clients.filter(res => {
      try { res.write(payload); return true; }
      catch { return false; }
    });
  }

  addClient(res) {
    res.setHeader('Content-Type',      'text/event-stream');
    res.setHeader('Cache-Control',     'no-cache');
    res.setHeader('Connection',        'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const heartbeat = setInterval(() => {
      try { res.write(': heartbeat\n\n'); }
      catch { clearInterval(heartbeat); }
    }, 25000);

    this.logs.slice(-80).forEach(e =>
      res.write(`data: ${JSON.stringify(e)}\n\n`)
    );

    this.clients.push(res);
    res.on('close', () => {
      clearInterval(heartbeat);
      this.clients = this.clients.filter(c => c !== res);
    });
  }

  getLogs(limit = 150) { return this.logs.slice(-limit); }
  clear()              { this.logs = []; this._broadcast({ type: 'clear' }); }
}

module.exports = new DetectionLogger();
