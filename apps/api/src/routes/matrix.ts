import type { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';

export interface MatrixRoutesDeps {
  dataDir: string;
}

const MATRIX_COLUMNS = ['Paper Title', 'Authors', 'Year', 'Method', 'Sample', 'Key Findings', 'Limitations', 'Relevance', 'Notes'];

/**
 * Literature review matrix — Excel-backed rows.
 */
export function registerMatrixRoutes(app: Hono, deps: MatrixRoutesDeps): void {
  const MATRIX_DIR = path.join(deps.dataDir, 'matrix');
  const MATRIX_FILE = path.join(MATRIX_DIR, 'lit-review-matrix.xlsx');

  const ensureMatrixDir = () => {
    if (!fs.existsSync(MATRIX_DIR)) fs.mkdirSync(MATRIX_DIR, { recursive: true });
  };

  const readMatrix = (): Record<string, string>[] => {
    if (!fs.existsSync(MATRIX_FILE)) {
      ensureMatrixDir();
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([MATRIX_COLUMNS]);
      XLSX.utils.book_append_sheet(wb, ws, 'Literature Matrix');
      XLSX.writeFile(wb, MATRIX_FILE);
      return [];
    }
    const wb = XLSX.readFile(MATRIX_FILE);
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, string>>(ws);
  };

  const writeMatrix = (rows: Record<string, string>[]) => {
    ensureMatrixDir();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows, { header: MATRIX_COLUMNS });
    XLSX.utils.book_append_sheet(wb, ws, 'Literature Matrix');
    XLSX.writeFile(wb, MATRIX_FILE);
  };

  app.get('/api/matrix', (c) => {
    const rows = readMatrix();
    return c.json({ columns: MATRIX_COLUMNS, rows });
  });

  app.put('/api/matrix/:row', async (c) => {
    const rowIndex = parseInt(c.req.param('row'), 10);
    const body = await c.req.json<Record<string, string>>();
    const rows = readMatrix();
    if (rowIndex < 0 || rowIndex > rows.length) {
      return c.json({ error: 'Row index out of range' }, 400);
    }
    if (rowIndex === rows.length) {
      rows.push(body);
    } else {
      rows[rowIndex] = { ...rows[rowIndex], ...body };
    }
    writeMatrix(rows);
    return c.json({ ok: true, row: rows[rowIndex] });
  });

  app.post('/api/matrix/row', async (c) => {
    const body = await c.req.json<Record<string, string>>();
    const rows = readMatrix();
    rows.push(body);
    writeMatrix(rows);
    return c.json({ ok: true, index: rows.length - 1 });
  });

  app.post('/api/matrix/export', (_c) => {
    const rows = readMatrix();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows, { header: MATRIX_COLUMNS });
    XLSX.utils.book_append_sheet(wb, ws, 'Literature Matrix');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="lit-review-matrix.xlsx"',
      },
    });
  });
}
