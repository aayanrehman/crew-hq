import type { BotId, BotLive } from '../types'
import { SPRITE } from './sprites'

// One pixel sprite per crew member (assets/*.png), drawn as a static SVG on desktop (the terminal keeps the emoji).
// No SMIL animation: an animated frame remounts on every pane redraw and flashes.

export function mascot(id: BotId, status: BotLive['status'], size = 56): string {
  const ring = status === 'working' ? '#22c55e' : status === 'talking' ? '#facc15' : 'transparent'
  const src = `data:image/png;base64,${SPRITE[id]}`
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100" width="${size}" height="${size}">
  <rect x="2" y="2" width="96" height="96" rx="14" fill="none" stroke="${ring}" stroke-width="4"/>
  <image x="8" y="8" width="84" height="84" href="${src}" xlink:href="${src}" style="image-rendering:pixelated"/>
</svg>`
}
