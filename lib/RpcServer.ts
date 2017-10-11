import { Message, Channel } from 'amqplib'
import AmqpClient, { AmqpClientOptions } from './AmqpClient'
import log from './logger'
import { RpcServerError, NoSuchOperation, ProcedureFailed, InvalidCall } from './RpcServer/errors'
import * as comms from './RpcServer/comms'

export interface RpcOptions {
  rpcExchangeName?: string
}

export interface RpcServerOptions {
  amqpClient: AmqpClientOptions
  rpcServer?: RpcOptions
}

const runCall = async (channel: Channel, procedures: Map<string, Function>, message: Message) => {
  const nack = () => channel.nack(message, false, false);
  let content;

  if (!message.properties.replyTo || !message.properties.correlationId) {
    log.warn(
      '[RpcServer] Dropping received message with no replyTo or correlationId.',
      { properties: message.properties }
    )
    return nack()
  }

  try {
    content = JSON.parse(message.content.toString())
  } catch (err) {
    log.warn(
      '[RpcServer] Dropping message that cannot be parsed as JSON',
      { properties: message.properties, content: message.content }
    )
    return nack()
  }

  if (!content.procedure) {
    return await comms.reply(channel, message, new InvalidCall('No `procedure` was provided'))
  }

  const fn = procedures.get(content.procedure)
  if (!fn) return await comms.reply(channel, message, new NoSuchOperation(content.procedure))

  log.info(`[RpcServer] Running procedure ${content.procedure}`)

  let response;

  try {
    const args = content.args || []
    response = await fn(...args)
  } catch (err) {
    response = new ProcedureFailed(err)
  }

  await comms.reply(channel, message, response)
}

export default class RpcServer {
  procedures: Map<string, Function>
  amqpClient: AmqpClient
  rpcExchangeName: string

  constructor(opts: RpcServerOptions) {
    this.procedures = new Map()
    this.amqpClient = new AmqpClient(opts.amqpClient)
    this.rpcExchangeName = opts.rpcServer && opts.rpcServer.rpcExchangeName || 'mqrpc'
  }

  async init() {
    if (this.procedures.size === 0) {
      log.warn(
        '[RpcServer] Initializing server with no registed procedures. ' +
        'Any received calls will error out!'
      )
    }

    await this.amqpClient.init()

    await Promise.all([
      this.amqpClient.channel.assertExchange(this.rpcExchangeName, 'direct', { durable: false }),
      this.amqpClient.channel.assertQueue(`${this.rpcExchangeName}.call`, { durable: false })
    ])
    await this.amqpClient.channel.bindQueue(
      `${this.rpcExchangeName}.call`, this.rpcExchangeName, 'call'
    )

    await this.amqpClient.channel.consume(
      `${this.rpcExchangeName}.call`,
      runCall.bind(null, this.amqpClient.channel, this.procedures)
    )
  }

  async term() {
    await this.amqpClient.term()
  }

  register(procedure: string, handler: Function) {
    this.procedures.set(procedure, handler)
  }

  registerDebugProcedures() {
    this.register('mqrpc.echo', (arg: any) => arg)
  }
}
