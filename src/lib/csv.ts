/** Minimal CSV writer with UTF-8 BOM so Excel opens Vietnamese correctly. */
export function downloadCsv(
  filename: string,
  rows: Array<Array<string | number | null | undefined>>
): void {
  const escape = (value: string | number | null | undefined) => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = '\uFEFF' + rows.map((row) => row.map(escape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function csvDateStamp(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
