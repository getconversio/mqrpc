import { newPromiseAndCallbacks } from './promises'

export class TimeoutExpired extends Error {
  constructor(public timeout: Timeout) {
    super(`${timeout.id} expired after ${timeout.length}ms`)
  }
}

export interface Timeout {
  id: string
  length: number
}

interface ActiveTimeout extends Timeout {
  handle: NodeJS.Timer
}

interface Entry {
  readonly promise: Promise<any>
  readonly reject: Function
  readonly timeouts: Map<string, ActiveTimeout>
}

/**
 * @private
 *
 * Activates a new timeout and returns it. The given reject will be called
 * with a TimeoutExpired error if the timer expires.
 *
 * @param {Timeout}  timeout  The timeout to activate
 * @param {Function} reject Called with a TimeoutExpired error when the timer expires
 */
const activateTimeout = (timeout: Timeout, reject: Function): ActiveTimeout => {
  return Object.assign({}, timeout, {
    handle: setTimeout(() => {
      reject(new TimeoutExpired(timeout))
    }, timeout.length)
  })
}

export default class Timer {
  protected entries: Map<string, Entry>

  constructor() {
    this.entries = new Map<string, Entry>()
  }

  /**
   * Adds and starts the given timeouts for the given `entryId`. If an entry
   * with the same ID exists, timeouts will be appended to it. Otherwise, a new
   * entry is created.
   *
   * The promise returned will never resolve, but it will reject when one of the
   * timeouts expires.
   *
   * @param  {string}        entryId     An ID under which to add the timeouts.
   * @param  {Timeout[]}     ...timeouts Timeout objects, with an ID and length in ms.
   * @return {Promise<void>}             Rejects when a timeout expires. Never resolves.
   */
  addTimeouts(entryId: string, ...timeouts: Timeout[]): Promise<void> {
    const entry = this.ensureEntry(entryId)

    timeouts.forEach(timeout => {
      if (entry.timeouts.has(timeout.id)) {
        throw new Error(`Timeout with ID ${timeout.id} already exists for entry ${entryId}`)
      }

      entry.timeouts.set(timeout.id, activateTimeout(timeout, entry.reject))
    })

    return entry.promise
  }

  /**
   * Restarts all timeouts with the given IDs for the given entry.
   *
   * @param {string}   entryId       The ID under which the timeouts are.
   * @param {string[]} ...timeoutIds The IDs for timeouts to restart.
   */
  restartTimeouts(entryId: string, ...timeoutIds: string[]): void {
    const entry = this.entries.get(entryId)
    if (!entry) throw new Error(`Entry with ID ${entryId} does not exist`)

    timeoutIds.forEach(id => {
      const timeout = entry.timeouts.get(id)
      if (!timeout) throw new Error(`Timeout with ID ${id} does not exist for entry ${entryId}`)

      clearTimeout(timeout.handle)
      entry.timeouts.set(id, activateTimeout(timeout, entry.reject))
    })
  }

  /**
   * Stops and removes the timeouts with the given IDs from the given entry.
   *
   * @param {string}   entryId       The ID under which the timeouts are.
   * @param {string[]} ...timeoutIds The IDs for timeouts to stop & remove.
   */
  removeTimeouts(entryId: string, ...timeoutIds: string[]): void {
    const entry = this.entries.get(entryId)
    if (!entry) throw new Error(`Entry with ID ${entryId} does not exist`)

    timeoutIds.forEach(id => {
      const timeout = entry.timeouts.get(id)
      if (!timeout) return // idempotent

      clearTimeout(timeout.handle)
      entry.timeouts.delete(id)
    })
  }

  /**
   * Removes an entry. This stops and removes all its timeouts as well.
   *
   * @param {string} entryId The ID for the entry to remove.
   */
  remove(entryId: string): void {
    const entry = this.entries.get(entryId)
    if (!entry) return // idempotent

    entry.timeouts.forEach(timeout => clearTimeout(timeout.handle))
    entry.timeouts.clear()
    this.entries.delete(entryId)
  }

  /**
   * Removes every entry and every timeout.
   */
  clear(): void {
    for (let entryId of this.entries.keys()) {
      this.remove(entryId)
    }
  }

  /**
   * @protected
   *
   * Returns an existing Entry or creates a new one.
   *
   * @param  {string} entryId The Entry's ID to create or fetch.
   * @return {Entry}          A new or existing Entry
   */
  protected ensureEntry(entryId: string): Entry {
    let entry = this.entries.get(entryId)

    if (entry) return entry

    const [promise, { reject }] = newPromiseAndCallbacks()
    entry = { promise, reject, timeouts: new Map<string, ActiveTimeout>() }

    this.entries.set(entryId, entry)

    return entry
  }
}
