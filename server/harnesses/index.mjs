/**
 * The harness registry — Agent World fork.
 *
 * Bot Crossing's own rule: one adapter file per harness, one line here, nothing else changes.
 * The Claude Code adapter stays in this directory unregistered — runs from Claude Code reach the
 * world through the Run Ledger (Compass), never through local session files.
 */
import compass from './compass.mjs'

export const HARNESSES = [compass]

export const harnessById = (id) => HARNESSES.find((h) => h.id === id) || null

/**
 * Which harnesses have data on this machine. Detection is per-scan rather than cached at
 * boot so that a change of environment while the world is running is picked up on the next poll.
 */
export async function detectedHarnesses() {
  const flags = await Promise.all(
    HARNESSES.map(async (h) => {
      try {
        return await h.detect()
      } catch {
        return false
      }
    })
  )
  return HARNESSES.filter((_, i) => flags[i])
}
