export function csr(rows, cols) {
  const starts = [0]
  const indices = []
  const values = []

  for (const row of rows) {
    const merged = new Map()
    for (const [col, raw] of row) {
      const value = Number(raw || 0)
      if (Math.abs(value) <= 1e-14) continue
      merged.set(col, (merged.get(col) || 0) + value)
    }
    for (const [col, value] of [...merged].sort((a, b) => a[0] - b[0])) {
      if (Math.abs(value) <= 1e-14) continue
      indices.push(col)
      values.push(value)
    }
    starts.push(indices.length)
  }

  return {
    format: 'csr',
    numRows: rows.length,
    numCols: cols,
    starts,
    indices,
    values,
  }
}

export function entries(terms) {
  const merged = new Map()
  for (const [index, raw] of terms) {
    const value = Number(raw || 0)
    if (Math.abs(value) <= 1e-14) continue
    merged.set(index, (merged.get(index) || 0) + value)
  }
  const ordered = [...merged].sort((a, b) => a[0] - b[0])
  return {
    indices: ordered.map(([index]) => index),
    values: ordered.map(([, value]) => value),
  }
}
