import { existsSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve(import.meta.dirname, '..')
const SOURCE = path.join(ROOT, 'assets', 'models', 'romconfort-source.glb')
const INTERMEDIATE = path.join(ROOT, '.artifacts', 'romconfort-png.glb')
const OUTPUT = path.join(ROOT, 'public', 'models', 'romconfort.glb')
const QUALITY = process.argv[2] ?? '255'

const ktxCandidates = [
  process.env.KTX_PATH,
  'C:\\Program Files\\KTX-Software\\bin\\ktx.exe',
  'C:\\Program Files\\KTX-Software\\ktx.exe',
  process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'KTX-Software', 'bin', 'ktx.exe')
    : null,
].filter(Boolean)

const ktx = ktxCandidates.find((candidate) => existsSync(candidate))
if (!ktx) {
  throw new Error('KTX-Software not found. Install it from https://github.com/KhronosGroup/KTX-Software/releases')
}
if (!existsSync(SOURCE)) {
  throw new Error(`Missing source model: ${path.relative(ROOT, SOURCE)}`)
}

process.env.PATH = `${path.dirname(ktx)};${process.env.PATH}`

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const run = (args) => execFileSync(npx, args, { cwd: ROOT, stdio: 'inherit' })

if (existsSync(INTERMEDIATE)) unlinkSync(INTERMEDIATE)

console.info('Decoding WebP textures to PNG for KTX-Software...')
run(['gltf-transform', 'png', SOURCE, INTERMEDIATE, '--formats', 'webp'])

console.info(`Encoding KTX2/ETC1S at quality ${QUALITY}...`)
run(['gltf-transform', 'etc1s', INTERMEDIATE, OUTPUT, '--quality', QUALITY])

if (existsSync(INTERMEDIATE)) unlinkSync(INTERMEDIATE)
console.info(`Wrote ${path.relative(ROOT, OUTPUT)}`)
