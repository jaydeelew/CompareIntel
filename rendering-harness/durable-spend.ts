/**
 * Global durable spend state for the harness cost guard.
 * Independent of batch ID. Missing/corrupt/locked state fails closed.
 * No silent fresh-state creation. No acknowledge/reset helper.
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const DEFAULT_GUARD_STATE_FILE = path.join(__dirname, 'guard-global-state.json')

export interface UnknownChargeRecord {
  callId: string
  batchId?: string | null
  modelId?: string | null
  promptName?: string | null
  reason?: string
  detectedAt?: string
  actualCost: null
  resolution: null
  batch?: string
  id?: string
  prompt?: string
  source?: string
}

export interface PendingRequestRecord {
  callId: string
  batchId: string
  modelId?: string
  promptName?: string
  startedAt: string
  reserveUsd: number
  actualCost: null
}

export interface GuardGlobalState {
  version: 1
  revision: number
  knownActualUsd: number
  unknownCharges: UnknownChargeRecord[]
  pendingRequests: PendingRequestRecord[]
  batches: Record<string, { knownActualUsd: number; settledCallIds: string[] }>
  observedRates: Record<string, { input: number; output: number }>
  knownCostBasis?: string
  policy?: string
}

export function emptyGuardState(): GuardGlobalState {
  return {
    version: 1,
    revision: 0,
    knownActualUsd: 0,
    unknownCharges: [],
    pendingRequests: [],
    batches: {},
    observedRates: {},
  }
}

function validNonNeg(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0
}

export function parseGuardState(raw: unknown): GuardGlobalState {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid durable guard state: stop')
  const s = raw as Record<string, unknown>
  if (
    s.version !== 1 ||
    !Array.isArray(s.unknownCharges) ||
    !Array.isArray(s.pendingRequests) ||
    !s.batches ||
    typeof s.batches !== 'object' ||
    !s.observedRates ||
    typeof s.observedRates !== 'object' ||
    !validNonNeg(s.knownActualUsd)
  ) {
    throw new Error('Invalid durable guard state: stop')
  }
  for (const row of s.unknownCharges as UnknownChargeRecord[]) {
    if (!row || row.actualCost !== null || row.resolution !== null || !row.callId) {
      throw new Error('Invalid durable guard state: stop')
    }
  }
  return s as unknown as GuardGlobalState
}

export interface DurableFs {
  readFileSync(p: string): string | Buffer
  existsSync(p: string): boolean
  openSync(p: string, flags: string, mode?: number): number
  writeFileSync(fd: number | string, data: string): void
  fsyncSync(fd: number): void
  closeSync(fd: number): void
  renameSync(from: string, to: string): void
  mkdirSync(p: string): void
  rmdirSync(p: string): void
  unlinkSync(p: string): void
}

export class DurableStore {
  readonly stateFile: string
  readonly lockFile: string
  readonly io: DurableFs

  constructor(stateFile: string, io: DurableFs = fs) {
    this.stateFile = stateFile
    this.lockFile = stateFile + '.lock'
    this.io = io
  }

  locked(): boolean {
    return this.io.existsSync(this.lockFile)
  }

  /** Leftover lock means an interrupted transaction; do not auto-clear. */
  assertAvailable(): void {
    if (this.locked()) {
      throw new Error('Durable state locked/interrupted; explicit recovery required')
    }
  }

  read(): GuardGlobalState {
    const text = this.io.readFileSync(this.stateFile).toString()
    return parseGuardState(JSON.parse(text))
  }

  atomicWrite(state: GuardGlobalState): void {
    const tmp =
      this.stateFile + '.tmp-' + process.pid + '-' + crypto.randomUUID()
    let fd: number | undefined
    try {
      fd = this.io.openSync(tmp, 'wx', 0o600)
      this.io.writeFileSync(fd, JSON.stringify(state, null, 2) + '\n')
      this.io.fsyncSync(fd)
      this.io.closeSync(fd)
      fd = undefined
      this.io.renameSync(tmp, this.stateFile)
      const dirFd = this.io.openSync(path.dirname(this.stateFile), 'r')
      try {
        this.io.fsyncSync(dirFd)
      } finally {
        this.io.closeSync(dirFd)
      }
    } finally {
      if (fd !== undefined) this.io.closeSync(fd)
      if (this.io.existsSync(tmp)) this.io.unlinkSync(tmp)
    }
  }

  /**
   * Exclusive lock around read → callback → atomic write.
   * Logical/pre-write callback (or read) failure: original file unchanged, lock released.
   * IO/atomic write failure: lock kept so later paid calls fail closed.
   */
  mutate<T>(fn: (state: GuardGlobalState) => T): T {
    this.io.mkdirSync(this.lockFile)
    let writeAttempted = false
    let committed = false
    try {
      const state = this.read()
      const result = fn(state)
      state.revision = (state.revision || 0) + 1
      writeAttempted = true
      try {
        this.atomicWrite(state)
      } catch (err) {
        throw new DurableIoError(err instanceof Error ? err.message : String(err))
      }
      committed = true
      return result
    } finally {
      if (committed || !writeAttempted) {
        try {
          this.io.rmdirSync(this.lockFile)
        } catch {
          /* leftover lock remains fail-closed */
        }
      }
    }
  }
}

export function unresolvedBlocksPaid(state: GuardGlobalState): boolean {
  return state.unknownCharges.length > 0 || state.pendingRequests.length > 0
}

/** Thrown when atomic write/fsync/rename fails. Leftover lock must stay. */
export class DurableIoError extends Error {
  readonly kind = 'io' as const
  constructor(message: string) {
    super(message)
    this.name = 'DurableIoError'
  }
}
