// Real, deterministic DOE fixture for the 0.4 acceptance campaign.
// It is deliberately small: the point is a command that actually ran, with a
// seed and machine-readable metrics, not a welding-physics claim.
const seed = Number(process.argv[2] || 7)
const permute = process.argv.includes('--permute')

let state = seed >>> 0
function random() {
  state = (state * 1664525 + 1013904223) >>> 0
  return state / 0x100000000
}

const rows = []
for (let i = 0; i < 54; i += 1) {
  const current = 180 + (i % 3) * 30
  const speed = 4 + (Math.floor(i / 3) % 3) * 2
  const gas = 12 + (Math.floor(i / 9) % 3) * 4
  const noise = (random() - 0.5) * 0.12
  const penetration = 0.98 + 0.0045 * (current - 180) - 0.055 * (speed - 4) + 0.002 * (gas - 12) + noise
  rows.push({ current, speed, gas, penetration })
}

if (permute) {
  // Negative control: break the current→penetration association while keeping
  // the same marginal values.
  const values = rows.map((row) => row.penetration)
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[values[i], values[j]] = [values[j], values[i]]
  }
  rows.forEach((row, index) => { row.penetration = values[index] })
}

const xs = rows.map((row) => row.current)
const ys = rows.map((row) => row.penetration)
const xMean = xs.reduce((a, b) => a + b, 0) / xs.length
const yMean = ys.reduce((a, b) => a + b, 0) / ys.length
let numerator = 0
let denominator = 0
for (let i = 0; i < xs.length; i += 1) {
  numerator += (xs[i] - xMean) * (ys[i] - yMean)
  denominator += (xs[i] - xMean) ** 2
}
const currentEffect = numerator / denominator
const rmse = Math.sqrt(rows.reduce((sum, row) => sum + (row.penetration - (yMean + currentEffect * (row.current - xMean))) ** 2, 0) / rows.length)

console.log(JSON.stringify({
  command: 'weld DOE fixture',
  seed,
  permute,
  n: rows.length,
  current_effect_mm_per_a: Number(currentEffect.toFixed(6)),
  mean_penetration_mm: Number(yMean.toFixed(6)),
  rmse_mm: Number(rmse.toFixed(6)),
}))
