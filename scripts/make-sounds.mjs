// Generates the two short cues under overlay/sounds/ (U17, ES-4.8) — plain 16-bit mono WAV, no dependency.
//   question.wav  a soft two-note rise: a new ? wants you
//   alert.wav     a low double thud: a new !
// Run once: node scripts/make-sounds.mjs (the files are committed; this is how they were made).
import fs from 'node:fs'
import path from 'node:path'

const RATE = 22050
const out = path.resolve(new URL('../overlay/sounds', import.meta.url).pathname)
fs.mkdirSync(out, { recursive: true })

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2)
  samples.forEach((s, i) => data.writeInt16LE(Math.max(-1, Math.min(1, s)) * 32767, i * 2))
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12)
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24)
  h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40)
  return Buffer.concat([h, data])
}
const tone = (freq, ms, gain = 0.5, shape = (t) => 1) => {
  const n = Math.round((RATE * ms) / 1000)
  return Array.from({ length: n }, (_, i) => {
    const t = i / n
    const env = Math.sin(Math.PI * t) ** 0.6 * shape(t)
    return Math.sin(2 * Math.PI * freq * (i / RATE)) * gain * env + Math.sin(2 * Math.PI * freq * 2 * (i / RATE)) * gain * 0.12 * env
  })
}
const silence = (ms) => new Array(Math.round((RATE * ms) / 1000)).fill(0)

fs.writeFileSync(path.join(out, 'question.wav'), wav([...tone(659, 110, 0.35), ...silence(20), ...tone(880, 160, 0.35)]))
fs.writeFileSync(path.join(out, 'alert.wav'), wav([...tone(196, 140, 0.55), ...silence(40), ...tone(147, 220, 0.55)]))
console.log('wrote', fs.readdirSync(out).map((f) => `${f} ${fs.statSync(path.join(out, f)).size} B`).join(', '))
