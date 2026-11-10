import { spawn, type ChildProcess } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export interface ViteProcess {
  child: ChildProcess
  port: number
  stop: () => void
}

export async function launchVite(opts?: {
  port?: number
  frontendSrc?: string
}): Promise<ViteProcess> {
  const port = opts?.port ?? 5174
  const viteBin = path.join(__dirname, 'node_modules', '.bin', 'vite')
  const child = spawn(viteBin, ['--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    env: {
      ...process.env,
      HARNESS_PORT: String(port),
      ...(opts?.frontendSrc ? { HARNESS_FRONTEND_SRC: opts.frontendSrc } : {}),
    },
  })
  let output = ''
  child.stdout?.on('data', (buf: Buffer) => {
    output += buf.toString()
  })
  child.stderr?.on('data', (buf: Buffer) => {
    output += buf.toString()
  })
  const stop = () => {
    if (!child.pid) return
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      child.kill('SIGTERM')
    }
  }
  const started = Date.now()
  while (Date.now() - started < 40000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`)
      if (response.ok) return { child, port, stop }
    } catch {
      /* not up yet */
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  stop()
  throw new Error(`Vite failed to start on ${port}\n${output.slice(-2000)}`)
}
