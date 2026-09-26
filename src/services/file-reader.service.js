import { createReadStream } from 'node:fs';
import { parse } from 'csv-parse';
import { readSheet } from 'read-excel-file/node';
import { requiredHeaders } from '../validators/import.schema.js';
const MAX_ROWS = 50000;
function headers(values) {
  const names = values.map((value) => String(value ?? '').trim());
  if (new Set(names).size !== names.length) throw new Error('Duplicate column headers');
  const missing = requiredHeaders.filter((name) => !names.includes(name));
  if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}`);
  return names;
}
export async function* readRows(path, extension) {
  let count = 0;
  if (extension === '.csv') {
    const stream = createReadStream(path).pipe(
      parse({
        bom: true,
        columns: headers,
        skip_empty_lines: true,
        trim: true,
        max_record_size: 65536,
      }),
    );
    for await (const row of stream) {
      if (++count > MAX_ROWS) throw new Error('Maximum 50000 rows per import');
      yield row;
    }
  } else {
    const rows = await readSheet(path);
    if (!rows.length) throw new Error('Empty workbook');
    const names = headers(rows.shift());
    for (const values of rows) {
      if (values.every((value) => value == null)) continue;
      if (++count > MAX_ROWS) throw new Error('Maximum 50000 rows per import');
      yield Object.fromEntries(names.map((name, i) => [name, values[i]]));
    }
  }
  if (!count) throw new Error('File has no data rows');
}
