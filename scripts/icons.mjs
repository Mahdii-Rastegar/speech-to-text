/**
 * Draws the web app's icons (public/icons/*.png) from public/favicon.svg, in
 * the installed Microsoft Edge. Run it again after changing the mark:
 *
 *   node scripts/icons.mjs
 *
 * iOS shows the icon as it is, without transparency, and cuts its corners
 * itself; a "maskable" icon may lose its outer fifth to the launcher's shape.
 * So those two are drawn on a full square with the mark kept in the middle.
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(projectRoot, 'public', 'icons')
const BACKGROUND = '#0c1322'

const mark = readFileSync(join(projectRoot, 'public', 'favicon.svg'), 'utf8')
/** The mark without its own rounded tile, for icons that fill the whole square. */
const bareMark = mark.replace(/<rect[^>]*\/>/, '')

const ICONS = [
  { file: 'icon-192.png', size: 192, svg: mark, background: 'transparent', scale: 1 },
  { file: 'icon-512.png', size: 512, svg: mark, background: 'transparent', scale: 1 },
  { file: 'icon-maskable-512.png', size: 512, svg: bareMark, background: BACKGROUND, scale: 0.7 },
  { file: 'apple-touch-icon.png', size: 180, svg: bareMark, background: BACKGROUND, scale: 0.86 },
]

mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage()
for (const icon of ICONS) {
  await page.setViewportSize({ width: icon.size, height: icon.size })
  await page.setContent(
    `<style>
       html, body { margin: 0; height: 100%; background: ${icon.background}; }
       body { display: grid; place-items: center; }
       svg { width: ${icon.scale * 100}%; height: ${icon.scale * 100}%; }
     </style>${icon.svg}`,
  )
  await page.screenshot({ path: join(outDir, icon.file), omitBackground: true })
  console.log(icon.file)
}
await browser.close()
