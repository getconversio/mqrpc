import * as uuid from 'uuid/v4'
import * as amqp from 'amqplib'
import log from './logger'
import AmqpClient, { AmqpClientOptions } from './AmqpClient'
import { UnparseableContent, UnknownReply, ProcedureFailed, ServerError, CallTerminated } from './RpcClient/errors'
import { newPromiseAndCallbacks, PromiseCallbacks } from './promises'
import { default as Timer, Timeout } from './Timer'

export interface RpcOptions {
  rpcExchangeName?: string
  ackTimeout?: number
  idleTimeout?: number
  callTimeout?: number
}

export interface RpcClientOptions {
  amqpClient: AmqpClientOptions
  rpcClient?: RpcOptions
}

const deserializeServerError = (obj: any): Error => {
  if (obj.cause) return new ProcedureFailed(obj.cause)
  return new ServerError(obj)
}

const replyHandler = (calls: Map<string, PromiseCallbacks>) => {
  return (message: amqp.Message) => {
    const callbacks = calls.get(message.properties.correlationId);

    if (!callbacks) {
      return log.warn(
        '[RpcClient] Received reply to unknown call.',
        { correlationId: message.properties.correlationId }
      );
    }

    let content;

    try {
      content = JSON.parse(message.content.toString())
    } catch (err) {
      return callbacks.reject(new UnparseableContent(message.content))
    }

    if (content.error) return callbacks.reject(deserializeServerError(content.error))
    if (content.res || Object.keys(content).length === 0) return callbacks.resolve(content.res)

    callbacks.reject(new UnknownReply(content))
  }
}

export default class RpcClient {
  protected calls: Map<string, PromiseCallbacks>
  protected callTimer: Timer

  amqpClient: AmqpClient
  rpcExchangeName = 'mqrpc'
  ackTimeout = 0
  idleTimeout = 5000
  callTimeout = 0

  constructor(opts: RpcClientOptions) {
    this.amqpClient = new AmqpClient(opts.amqpClient)
    this.calls = new Map()

    if (opts.rpcClient) {
      if (opts.rpcClient.rpcExchangeName) this.rpcExchangeName = opts.rpcClient.rpcExchangeName
      if (opts.rpcClient.ackTimeout) this.ackTimeout = opts.rpcClient.ackTimeout
      if (opts.rpcClient.idleTimeout) this.idleTimeout = opts.rpcClient.idleTimeout
      if (opts.rpcClient.callTimeout) this.callTimeout = opts.rpcClient.callTimeout
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
    await this.amqpClient.channel.consume(
      'amq.rabbitmq.reply-to',
      replyHandler(this.calls),
      { noAck: true }
    )
  }

  /**
   * Immediately tear down the client. Stops consuming replies, closes the
   * channel and, if it owns the connection, closes it too.
   */
  async term() {
    await this.amqpClient.term()
    this.callTimer.clear()
    this.calls.forEach(({ reject }) => reject(new CallTerminated()))
    this.calls.clear()
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
    const [callPromise, callPromiseCallbacks] = newPromiseAndCallbacks();
    const correlationId = uuid()

    this.calls.set(correlationId, callPromiseCallbacks)

    // TODO: check for publish return, may need to flush
    await this.amqpClient.channel.publish(
      this.rpcExchangeName,
      'call',
      new Buffer(JSON.stringify({ procedure, args })),
      { replyTo: 'amq.rabbitmq.reply-to', correlationId }
    )

    try {
      return await Promise.race([
        callPromise,
        this.callTimer.addTimeouts(correlationId, ...this.callTimeouts())
      ])
    } finally {
      this.callTimer.remove(correlationId)
    }
  }

  protected callTimeouts(): Timeout[] {
    const timeouts: Timeout[] = []
    if (this.ackTimeout) timeouts.push({ id: 'ackTimeout', length: this.ackTimeout })
    if (this.callTimeout) timeouts.push({ id: 'callTimeout', length: this.callTimeout })
    return timeouts
  }
}
