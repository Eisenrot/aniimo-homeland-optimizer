export function createHighsLpSolver(highs) {
  const { maximize } = highs.constants.objectiveSense
  const { optimal, infeasible, unboundedOrInfeasible } = highs.constants.modelStatus

  return function solveLpHighs(objective, A, b) {
    const rows = A.length
    const cols = objective.length
    if (!rows) return { x: Array(cols).fill(0), duals: [] }

    const starts = [0]
    const indices = []
    const values = []

    for (let row = 0; row < rows; row++) {
      const source = A[row] || []
      for (let col = 0; col < cols; col++) {
        const value = Number(source[col] || 0)
        if (Math.abs(value) <= 1e-14) continue
        indices.push(col)
        values.push(value)
      }
      starts.push(indices.length)
    }

    const model = highs.createModel({
      modelName: 'aniimo-lp',
      numCols: cols,
      numRows: rows,
      sense: maximize,
      colCost: objective.map((value) => Number(value || 0)),
      colLower: Array(cols).fill(0),
      colUpper: Array(cols).fill(highs.infinity),
      rowLower: Array(rows).fill(-highs.infinity),
      rowUpper: b.map((value) => Number(value || 0)),
      matrix: {
        format: 'csr',
        numRows: rows,
        numCols: cols,
        starts,
        indices,
        values,
      },
    })

    try {
      model.options.set({
        output_flag: false,
        presolve: 'on',
        solver: 'simplex',
      })
      model.run()
      const status = model.getModelStatus()
      if (status === infeasible || status === unboundedOrInfeasible) return null
      if (status !== optimal) {
        throw new Error(`HiGHS LP ended with model status ${status}`)
      }

      const solution = model.getSolution()
      return {
        x: Array.from(solution.colValue, (value) => Math.max(0, Number(value || 0))),
        duals: Array(rows).fill(0),
      }
    } finally {
      model.dispose()
    }
  }
}
