import * as uuid from 'uuid/v4'
import * as amqp from 'amqplib'
import logger from './logger'
import { ClientPayload, ServerPayload, StandardLogger, TimeoutDesc } from './common'
import AmqpClient, { AmqpClientOptions } from './AmqpClient'
import { CallTerminated, ProcedureFailed, ServerError, UnknownReply, UnparseableContent } from './RpcClient/errors'
import { newPromiseAndCallbacks, PromiseCallbacks } from './promises'
import { default as Timer, Timeout } from './Timer'

export interface RpcOptions {
  rpcExchangeName?: string
  ackTimeout?: number
  idleTimeout?: number
  callTimeout?: number
  logger?: StandardLogger
}

export interface RpcClientOptions {
  amqpClient: AmqpClientOptions
  rpcClient?: RpcOptions
}

const deserializeServerError = (obj: any): Error => {
  if (obj.cause) return new ProcedureFailed(obj.cause)
  return new ServerError(obj)
}

export default class RpcClient {
  amqpClient: AmqpClient
  rpcExchangeName = 'mqrpc'
  ackTimeout = 0
  idleTimeout = 0
  callTimeout = 900000 // 15 minutes
  log = logger as StandardLogger

  protected calls: Map<string, PromiseCallbacks>
  protected callTimer: Timer
  protected consumerTag?: string

  /**
   * Instances a new RPC Client with the given config
   *
   * @param {RpcClientOptions}   opts                            Config for this client, required.
   * @param {AmqpClientOptions}  opts.amqpClient                 Config for the underlying AMQP connection, required.
   * @param {string}            [opts.amqpClient.amqpUrl]        URL for the AMQP broker.
   * @param {object}            [opts.amqpClient.socketOptions]  Config for the AMQP connection.
   * @param {object}            [opts.amqpClient.connection]     An open AMQP connection, for re-use.
   * @param {object}            [opts.amqpClient.channel]        An open AMQP channel, for re-use.
   * @param {number}            [opts.amqpClient.prefetchCount]  Global prefetch count when consuming messages. Default
   *                                                             is 100.
   * @param {RpcOptions}        [opts.rpcClient]                 Config for the client itself.
   * @param {string}            [opts.rpcClient.rpcExchangeName] Exchange where calls are published. Default 'mqrpc'.
   *                                                             Must match server.
   * @param {number}            [opts.rpcClient.ackTimeout]      In ms, how long to wait for a server's ack. Default
   *                                                             infinite (0).
   * @param {number}            [opts.rpcClient.idleTimeout]     In ms, how long can a server be unresponsive. Default
   *                                                             infinite (0).
   * @param {number}            [opts.rpcClient.callTimeout]     In ms, how long overall to wait for a call's return.
   *                                                             Default 15 minutes.
   * @param {StandardLogger}    [opts.rpcClient.logger]          Custom logger for client use.
   */
  constructor(opts: RpcClientOptions) {
    this.amqpClient = new AmqpClient(opts.amqpClient)
    this.calls = new Map()

    if (opts.rpcClient) {
      if (opts.rpcClient.rpcExchangeName) this.rpcExchangeName = opts.rpcClient.rpcExchangeName
      if (opts.rpcClient.ackTimeout) this.ackTimeout = opts.rpcClient.ackTimeout
      if (opts.rpcClient.idleTimeout) this.idleTimeout = opts.rpcClient.idleTimeout
      if (opts.rpcClient.callTimeout) this.callTimeout = opts.rpcClient.callTimeout
      if (opts.rpcClient.logger) this.log = opts.rpcClient.logger
    }

    this.callTimer = new Timer()
  }

  /**
   * Starts the client by opening a channel to RabbitMq and listening to
   * replies. If no connection was passed in the constructor, one is established
   * here.
   */
  async init() {
    await this.amqpClient.init()

    if (this.consumerTag) return

    const { consumerTag } = await this.amqpClient.channel.consume(
      'amq.rabbitmq.reply-to',
      this.makeReplyHandler(),
      { noAck: true }
    )

    this.consumerTag = consumerTag
  }

  /**
   * Tear down the client, optionally waiting for pending calls to resolve.
   * Stops consuming replies, closes the channel and, if it owns the connection,
   * closes it too.
   *
   * When calls are pending and the wait time expired or no wait time was given,
   * the calls are rejected with a CallTerminated error.
   *
   * @param  {number} [opts.waitForCalls] How long, in ms, to wait for pending
   *                                      calls. Give 0 for indefinitely.
   */
  async term({ waitForCalls }: { waitForCalls?: number } = {}) {
    if (typeof waitForCalls !== 'undefined' && this.calls.size > 0) {
      let waited = 0
      const checkCallsInterval = setInterval(() => {
        waited += 50

        if (this.calls.size === 0 || (waitForCalls > 0 && waited > waitForCalls)) {
          clearInterval(checkCallsInterval)
          return this.term()
        }
      }, 50)

      return
    }

    this.callTimer.clear()
    this.calls.forEach(({ reject }) => reject(new CallTerminated()))
    this.calls.clear()

    if (this.consumerTag) {
      await this.amqpClient.channel.cancel(this.consumerTag)
      delete this.consumerTag
    }

    await this.amqpClient.term()
  }

  /**
   * Calls the remote procedure with the given `procedure` and resolves its
   * return, or rejects with errors.
   *
   * This will wait for a reply until the first timeout expires.
   *
   * @param  {string}       procedure The procedure's name.
   * @param  {any[]}        ...args   The args for the procedure.
   * @return {Promise<any>}           Whatever the procedure returns.
   */
  async call(procedure: string, ...args: any[]) {
    const [callPromise, callPromiseCallbacks] = newPromiseAndCallbacks()
    const correlationId = uuid()

    this.calls.set(correlationId, callPromiseCallbacks)

    // TODO: check for publish return, may need to flush
    await this.amqpClient.channel.publish(
      this.rpcExchangeName,
      'call',
      new Buffer(JSON.stringify(this.callPayload(procedure, ...args))),
      { replyTo: 'amq.rabbitmq.reply-to', correlationId }
    )

    try {
      return await Promise.race([
        callPromise,
        this.callTimer.addTimeouts(correlationId, ...this.callTimeouts())
      ])
    } finally {
      this.callTimer.remove(correlationId)
      this.calls.delete(correlationId)
    }
  }

  protected callTimeouts(): Timeout[] {
    const timeouts: Timeout[] = []
    if (this.ackTimeout) timeouts.push({ id: 'ackTimeout', length: this.ackTimeout })
    if (this.callTimeout) timeouts.push({ id: 'callTimeout', length: this.callTimeout })
    return timeouts
  }

  protected callPayload(procedure: string, ...args: any[]): ClientPayload {
    const timeouts: TimeoutDesc = {}
    if (this.ackTimeout) timeouts.ackTimeout = this.ackTimeout
    if (this.idleTimeout) timeouts.idleTimeout = this.idleTimeout
    if (this.callTimeout) timeouts.callTimeout = this.callTimeout
    return { procedure, args, timeouts }
  }

  protected makeReplyHandler(): (message: amqp.Message) => any {
    return (message: amqp.Message) => {
      const correlationId = message.properties.correlationId
      const callbacks = this.calls.get(correlationId)

      if (!callbacks) {
        return this.log.warn(
          '[RpcClient] Received reply to unknown call.',
          { correlationId }
        )
      }

      let content: ServerPayload

      try {
        content = JSON.parse(message.content.toString())
      } catch (err) {
        return callbacks.reject(new UnparseableContent(message.content))
      }

      switch (content.type) {
        case 'ack':
          this.callTimer.removeTimeouts(correlationId, 'ackTimeout')

          if (this.idleTimeout) {
            this.callTimer.addTimeouts(correlationId, { id: 'idleTimeout', length: this.idleTimeout })
          }

          break
        case 'wait':
          this.callTimer.restartTimeouts(correlationId, 'idleTimeout')
          break
        case 'error':
          return callbacks.reject(deserializeServerError(content.error))
        case 'reply':
          return callbacks.resolve(content.reply)
        default:
          callbacks.reject(new UnknownReply(content))
      }
    }
  }
}
