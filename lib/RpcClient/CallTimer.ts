import { TimeoutExpired } from './errors'
import { newPromiseAndCallbacks } from './promises'

interface Timeout {
  handle: NodeJS.Timer,
  callback: Function
}

interface CallTimeouts {
  ackTimeout?: Timeout
  idleTimeout?: Timeout
  callTimeout?: Timeout
}

/**
 * @private
 *
 * Starts a new timer and returns it. The given callback will be called if the
 * timer expires.
 *
 * @param {string}   timeoutName   The name for this timeout (used when raising)
 * @param {number}   timeoutLength How long until the timer expires, in milliseconds
 * @param {Function} callback      Called with a TimeoutExpired error when the timer expires
 */
const timeoutTimer = (timeoutName: string, timeoutLength: number, callback: Function): NodeJS.Timer => {
  return setTimeout(() => {
    callback(new TimeoutExpired(timeoutName, timeoutLength))
  }, timeoutLength)
}

/**
 * Helper class for managing a client's call timeouts.
 *
 * TODO this whole class can be made generic to handle any number of timeouts and
 *      not know about calls as a concept.
 */
export default class CallTimer {
  protected callTimeouts: Map<string, CallTimeouts>

  constructor(public ackTimeout: number, public idleTimeout: number, public callTimeout: number) {
    this.callTimeouts = new Map()
  }

  /**
   * Starts all configured timeouts for a call (through the given `correlationId`).
   * Returns a Promise that will never resolve; instead, it rejects when a timeout
   * expires, whichever expires first.
   *
   * @param  {string}        correlationId The correlationId for a call.
   * @return {Promise<void>}               Rejects when a timer expires. Never resolves.
   */
  startCallTimeouts(correlationId: string): Promise<void> {
    const timeouts: CallTimeouts = {}
    const [promise, { reject }] = newPromiseAndCallbacks()

    if (this.ackTimeout) timeouts.ackTimeout = this.startTimeout('ackTimeout', reject)
    if (this.idleTimeout) timeouts.idleTimeout = this.startTimeout('idleTimeout', reject)
    if (this.callTimeout) timeouts.callTimeout = this.startTimeout('callTimeout', reject)

    this.callTimeouts.set(correlationId, timeouts)

    return promise
  }

  /**
   * Restarts a given timeout for a call.
   *
   * @param {String}             correlationId The call's correlationId
   * @param {keyof CallTimeouts} timeoutName   Which timeout to restart
   */
  restartTimeout(correlationId: string, timeoutName: keyof CallTimeouts): void {
    const timeouts = this.callTimeouts.get(correlationId)

    if (!timeouts || !timeouts[timeoutName]) return

    const { handle, callback } = (<Timeout>timeouts[timeoutName])

    clearTimeout(handle)
    const newTimeout = this.startTimeout(timeoutName, callback)

    this.callTimeouts.set(
      correlationId, Object.assign({}, timeouts, { [timeoutName]: newTimeout })
    )
  }

  /**
   * Stops & clears all timeouts for a call (through the given `correlationId`).
   * This function is idempotent.
   *
   * @param {string} correlationId The call's correlationId.
   */
  clearCallTimeouts(correlationId: string): void {
    const timeouts = this.callTimeouts.get(correlationId)
    if (!timeouts) return

    Object.values(timeouts).forEach(({ handle }) => clearTimeout(handle))
    this.callTimeouts.delete(correlationId)
  }

  /**
   * Stops & clears all timeouts for all calls.
   */
  clearAllTimeouts(): void {
    for (let correlationId of this.callTimeouts.keys() ) {
      this.clearCallTimeouts(correlationId)
    }
  }

  protected startTimeout(timeoutName: string, callback: Function): Timeout {
    return {
      callback,
      handle: timeoutTimer(timeoutName, this[timeoutName], callback)
    }
  }
}
