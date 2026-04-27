const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const dbPath = path.join(__dirname, 'dch.db');
const db = new sqlite3.Database(dbPath);

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(__dirname, { etag: false, maxAge: 0 }));

function nowISO() {
  return new Date().toISOString();
}

function safeParse(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

function normalizeRecord(row) {
  const data = safeParse(row.data);
  data.__id = row.id;
  data.id = row.id;
  data.serverUpdatedAt = row.updated_at;
  return data;
}

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS clinical_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_name TEXT,
    case_no TEXT,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);

  db.run(`CREATE INDEX IF NOT EXISTS idx_clinical_records_patient_name ON clinical_records(patient_name)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_clinical_records_case_no ON clinical_records(case_no)`);

  // Auto-migrate old single-row database format, if present.
  db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='records'", (err, oldTable) => {
    if (oldTable) {
      db.get('SELECT data FROM records WHERE id=1', (e, row) => {
        if (!row || !row.data) return;
        let oldRecords = [];
        try { oldRecords = JSON.parse(row.data); } catch { oldRecords = []; }
        if (!Array.isArray(oldRecords) || oldRecords.length === 0) return;
        db.get('SELECT COUNT(*) AS total FROM clinical_records', (ce, countRow) => {
          if ((countRow?.total || 0) > 0) return;
          const stmt = db.prepare('INSERT INTO clinical_records (patient_name, case_no, data, created_at, updated_at) VALUES (?,?,?,?,?)');
          const stamp = nowISO();
          oldRecords.forEach((rec) => {
            const name = rec.patientName || rec.refPatientName || 'No Name';
            const caseNo = rec.caseNo || '';
            stmt.run(name, caseNo, JSON.stringify(rec || {}), rec.savedAt || stamp, stamp);
          });
          stmt.finalize();
          console.log(`Migrated ${oldRecords.length} old records into the new database table.`);
        });
      });
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, database: dbPath, port: PORT, time: nowISO() });
});

app.get('/api/records', (req, res) => {
  db.all('SELECT * FROM clinical_records ORDER BY id ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: String(err) });
    res.json((rows || []).map(normalizeRecord));
  });
});

app.get('/api/records/search', (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`;
  db.all('SELECT * FROM clinical_records WHERE patient_name LIKE ? OR case_no LIKE ? ORDER BY updated_at DESC', [q, q], (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: String(err) });
    res.json((rows || []).map(normalizeRecord));
  });
});

app.post('/api/record', (req, res) => {
  const input = req.body || {};
  const id = Number(input.__id || input.id || 0);
  const data = { ...input };
  delete data.serverUpdatedAt;
  const patientName = data.patientName || data.refPatientName || 'No Name';
  const caseNo = data.caseNo || '';
  const stamp = nowISO();

  if (id > 0) {
    db.run(
      'UPDATE clinical_records SET patient_name=?, case_no=?, data=?, updated_at=? WHERE id=?',
      [patientName, caseNo, JSON.stringify(data), stamp, id],
      function (err) {
        if (err) return res.status(500).json({ ok: false, error: String(err) });
        if (this.changes === 0) {
          db.run(
            'INSERT INTO clinical_records (patient_name, case_no, data, created_at, updated_at) VALUES (?,?,?,?,?)',
            [patientName, caseNo, JSON.stringify(data), stamp, stamp],
            function (err2) {
              if (err2) return res.status(500).json({ ok: false, error: String(err2) });
              res.json({ ok: true, record: { ...data, __id: this.lastID, id: this.lastID, serverUpdatedAt: stamp } });
            }
          );
          return;
        }
        res.json({ ok: true, record: { ...data, __id: id, id, serverUpdatedAt: stamp } });
      }
    );
  } else {
    db.run(
      'INSERT INTO clinical_records (patient_name, case_no, data, created_at, updated_at) VALUES (?,?,?,?,?)',
      [patientName, caseNo, JSON.stringify(data), stamp, stamp],
      function (err) {
        if (err) return res.status(500).json({ ok: false, error: String(err) });
        res.json({ ok: true, record: { ...data, __id: this.lastID, id: this.lastID, serverUpdatedAt: stamp } });
      }
    );
  }
});

// Used by existing pages that save the whole list. This keeps all devices using the same database.
app.post('/api/records', (req, res) => {
  const records = Array.isArray(req.body?.records) ? req.body.records : [];
  const stamp = nowISO();
  db.serialize(() => {
    db.run('DELETE FROM clinical_records');
    const stmt = db.prepare('INSERT INTO clinical_records (id, patient_name, case_no, data, created_at, updated_at) VALUES (?,?,?,?,?,?)');
    records.forEach((rec) => {
      const data = { ...(rec || {}) };
      const id = Number(data.__id || data.id || 0) || null;
      delete data.serverUpdatedAt;
      const patientName = data.patientName || data.refPatientName || 'No Name';
      const caseNo = data.caseNo || '';
      stmt.run(id, patientName, caseNo, JSON.stringify(data), data.savedAt || stamp, stamp);
    });
    stmt.finalize((err) => {
      if (err) return res.status(500).json({ ok: false, error: String(err) });
      db.all('SELECT * FROM clinical_records ORDER BY id ASC', [], (err2, rows) => {
        if (err2) return res.status(500).json({ ok: false, error: String(err2) });
        res.json({ ok: true, count: rows.length, records: rows.map(normalizeRecord) });
      });
    });
  });
});

app.delete('/api/record/:id', (req, res) => {
  db.run('DELETE FROM clinical_records WHERE id=?', [Number(req.params.id)], function (err) {
    if (err) return res.status(500).json({ ok: false, error: String(err) });
    res.json({ ok: true, deleted: this.changes });
  });
});

// Backward compatibility for older app.js calls.
app.post('/save', (req, res) => {
  req.url = '/api/record';
  app._router.handle(req, res);
});
app.get('/records', (req, res) => res.redirect('/api/records'));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log('============================================');
  console.log('DCH Clinical Chart PWA server is running.');
  console.log(`Open on this PC: http://localhost:${PORT}`);
  console.log(`For Android/other PC: http://SERVER-IP:${PORT}`);
  console.log('Keep this window open while using the system.');
  console.log('============================================');
});
