import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const candidates = [
  process.env.TAILSCALE_PATH,
  'C:\\Program Files\\Tailscale\\tailscale.exe',
  'C:\\Program Files (x86)\\Tailscale\\tailscale.exe',
  process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Tailscale\\tailscale.exe` : null,
].filter(Boolean)

const executable = candidates.find((candidate) => existsSync(candidate)) ?? 'tailscale'
const args = process.argv.slice(2)

if (args[0] === 'url') {
  const output = execFileSync(executable, ['status', '--json'], { encoding: 'utf8' })
  const status = JSON.parse(output)
  const dnsName = status?.Self?.DNSName?.replace(/\.$/, '')
  if (!dnsName) throw new Error('Tailscale is not connected.')
  console.log(`https://${dnsName}/`)
} else {
  execFileSync(executable, args, { stdio: 'inherit' })
}
