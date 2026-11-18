// SPDX-License-Identifier: GPL-3.0-only
// Moonlit (US-151, US-174): a navy night, a pale moon behind thin cloud,
// a dark hill line, a crack of blue lightning, and red petals drifting
// down past the cards. Only the petals move. The moon is kept muted so
// the theme's ink sheet holds every text at 4.5 to 1 (look.test.ts).
import { type Rgb, rgba } from '../../brush'
import { type Palette, SCENE_H, SCENE_W, type ThemeScene } from './space'

interface Star {
  x: number
  y: number
  r: number
  a: number
}

interface Petal {
  x: number
  y: number
  s: number
  vy: number
  vx: number
  ph: number
  rot: number
  vr: number
  light: boolean
}

interface MoonlitState {
  stars: Star[]
  petals: Petal[]
  mottle: Array<{ x: number; y: number; r: number }>
  bolt: Array<[number, number]>
}

const MOON_X = 455
const MOON_Y = 95
const MOON_R = 78

const mod = (a: number, b: number): number => ((a % b) + b) % b

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: Rgb, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, rgba(c, alpha))
  g.addColorStop(1, rgba(c, 0))
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
}

export const moonlit: ThemeScene<MoonlitState> = {
  colors: [
    'scene-sky-top',
    'scene-sky-mid',
    'scene-sky-low',
    'scene-star',
    'scene-moon-glow',
    'scene-moon-hi',
    'scene-moon-lo',
    'scene-moon-mottle',
    'scene-cloud',
    'scene-hill',
    'scene-bolt',
    'scene-petal',
    'scene-petal-light'
  ],

  init(r) {
    const stars = Array.from({ length: 46 }, () => ({ x: r() * SCENE_W, y: r() * 230, r: 0.3 + r() * 0.9, a: 0.2 + r() * 0.45 }))
    const petals = Array.from({ length: 26 }, () => ({
      x: r() * SCENE_W,
      y: r() * SCENE_H,
      s: 2.2 + r() * 2.6,
      vy: 9 + r() * 14,
      vx: 4 + r() * 6,
      ph: r() * Math.PI * 2,
      rot: r() * Math.PI * 2,
      vr: (r() - 0.5) * 1.6,
      light: r() >= 0.6
    }))
    const mottle = Array.from({ length: 7 }, () => ({
      x: MOON_X + (r() - 0.5) * 100,
      y: MOON_Y + (r() - 0.5) * 100,
      r: 10 + r() * 22
    }))
    const bolt: Array<[number, number]> = []
    let x = 34
    let y = 250
    for (let i = 0; i < 9; i++) {
      bolt.push([x, y])
      x += 4 + r() * 10
      y += 7 + (r() - 0.5) * 14
    }
    return { stars, petals, mottle, bolt }
  },

  draw(ctx, s, p: Palette, tMs) {
    const sky = ctx.createLinearGradient(0, 0, 0, SCENE_H)
    sky.addColorStop(0, rgba(p['scene-sky-top']))
    sky.addColorStop(0.6, rgba(p['scene-sky-mid']))
    sky.addColorStop(1, rgba(p['scene-sky-low']))
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, SCENE_W, SCENE_H)

    for (const st of s.stars) {
      ctx.fillStyle = rgba(p['scene-star'], st.a)
      ctx.beginPath()
      ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2)
      ctx.fill()
    }

    glow(ctx, MOON_X, MOON_Y, 190, p['scene-moon-glow'], 0.16)
    const disc = ctx.createRadialGradient(MOON_X - 15, MOON_Y - 15, 10, MOON_X, MOON_Y, MOON_R)
    disc.addColorStop(0, rgba(p['scene-moon-hi']))
    disc.addColorStop(1, rgba(p['scene-moon-lo']))
    ctx.fillStyle = disc
    ctx.beginPath()
    ctx.arc(MOON_X, MOON_Y, MOON_R, 0, Math.PI * 2)
    ctx.fill()
    ctx.save()
    ctx.beginPath()
    ctx.arc(MOON_X, MOON_Y, MOON_R, 0, Math.PI * 2)
    ctx.clip()
    for (const m of s.mottle) glow(ctx, m.x, m.y, m.r, p['scene-moon-mottle'], 0.3)
    ctx.restore()

    for (const [x, y, rx, ry] of [
      [400, 168, 120, 22],
      [520, 150, 90, 18],
      [330, 196, 140, 26]
    ]) {
      ctx.save()
      ctx.translate(x, y)
      ctx.scale(1, ry / rx)
      glow(ctx, 0, 0, rx, p['scene-cloud'], 0.9)
      ctx.restore()
    }

    ctx.fillStyle = rgba(p['scene-hill'])
    ctx.beginPath()
    ctx.moveTo(0, SCENE_H)
    ctx.lineTo(0, 330)
    ctx.bezierCurveTo(120, 300, 210, 350, 320, 322)
    ctx.bezierCurveTo(420, 298, 500, 330, SCENE_W, 312)
    ctx.lineTo(SCENE_W, SCENE_H)
    ctx.closePath()
    ctx.fill()

    ctx.save()
    ctx.strokeStyle = rgba(p['scene-bolt'], 0.5)
    ctx.lineWidth = 1.2
    ctx.shadowColor = rgba(p['scene-bolt'], 0.8)
    ctx.shadowBlur = 8
    ctx.beginPath()
    s.bolt.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.stroke()
    ctx.restore()

    const sec = tMs / 1000
    for (const petal of s.petals) {
      const y = mod(petal.y + sec * petal.vy, SCENE_H + 20) - 10
      const x = mod(petal.x + sec * petal.vx + Math.sin(sec * 0.9 + petal.ph) * 10, SCENE_W + 20) - 10
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(petal.rot + sec * petal.vr)
      ctx.fillStyle = rgba(petal.light ? p['scene-petal-light'] : p['scene-petal'], 0.9)
      ctx.beginPath()
      ctx.ellipse(0, 0, petal.s, petal.s * 0.55, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }
}
