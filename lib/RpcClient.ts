import * as uuid from 'uuid/v4'
import * as amqp from 'amqplib'
import log from './logger'
import AmqpClient, { AmqpClientOptions } from './AmqpClient'
import { UnparseableContent, UnknownReply, ProcedureFailed, ServerError } from './RpcClient/errors'

interface PromiseCallbacks {
  resolve: Function
  reject: Function
}

interface RpcOptions {
  rpcExchangeName?: string
}

interface RpcClientOptions {
  amqpClient: AmqpClientOptions
  rpcClient?: RpcOptions
}

const deserializeServerError = (obj: any): Error => {
  if (obj.cause) return new ProcedureFailed(obj.cause)
  return new ServerError(obj)
}

const replyHandler = (calls: Map<string, PromiseCallbacks>) => {
  return function(message: amqp.Message) {
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

/**
 * @private
 *
 * Helper to return a Promise and its callbacks.
 */
const makePromise = (): [Promise<any>, PromiseCallbacks] => {
  // the noop business is because TypeScript doesn't know the callback is
  // invoked immediately, and the error-disabling comment isn't available in
  // 2.5.0
  const noop = () => {}

  let resolve: Function = noop
  let reject: Function = noop

  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })

  return [promise, { resolve, reject }]
}

export default class RpcClient {
  amqpClient: AmqpClient
  calls: Map<string, PromiseCallbacks>
  rpcExchangeName: string

  constructor(opts: RpcClientOptions) {
    this.amqpClient = new AmqpClient(opts.amqpClient)
    this.calls = new Map()
    this.rpcExchangeName = opts.rpcClient && opts.rpcClient.rpcExchangeName || 'mqrpc'
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
    this.calls.clear();
  }

  /**
   * Calls the remote procedure with the given `procedure` and resolves its
   * return, or rejects with errors.
   *
   * This will wait for a reply indefinitely.
   *
   * @param  {string}       procedure The procedure's name.
   * @param  {any[]}        ...args   The args for the procedure.
   * @return {Promise<any>}           Whatever the procedure returns.
   */
  async call(procedure: string, ...args: any[]) {
    const [callPromise, callPromiseCallbacks] = makePromise();
    const correlationId = uuid()

    this.calls.set(correlationId, callPromiseCallbacks)

    // TODO: check for publish return, may need to flush
    await this.amqpClient.channel.publish(
      this.rpcExchangeName,
      'call',
      new Buffer(JSON.stringify({ procedure, args })),
      { replyTo: 'amq.rabbitmq.reply-to', correlationId }
    )

    return await callPromise
  }
}
