import { Message, Channel } from 'amqplib'
import AmqpClient, { AmqpClientOptions } from './AmqpClient'
import logger from './logger'
import { TimeoutDesc, ClientPayload, StandardLogger } from './common'
import { RpcServerError, NoSuchProcedure, ProcedureFailed, InvalidCall } from './RpcServer/errors'
import * as comms from './RpcServer/comms'

export interface RpcOptions {
  rpcExchangeName?: string
  logger?: StandardLogger
}

export interface RpcServerOptions {
  amqpClient: AmqpClientOptions
  rpcServer?: RpcOptions
}

export default class RpcServer {
  procedures: Map<string, Function>
  amqpClient: AmqpClient
  rpcExchangeName = 'mqrpc'
  log = logger as StandardLogger

  /**
   * Instances a new RPC Server with the given config
   *
   * @param {RpcClientOptions}   opts                            Config for this client, required.
   * @param {AmqpClientOptions}  opts.amqplClient                Config for the underlying AMQP connection, required.
   * @param {string}            [opts.amqplClient.amqpUrl]       URL for the AMQP broker.
   * @param {object}            [opts.amqplClient.socketOptions] Config for the AMQP connection.
   * @param {object}            [opts.amqplClient.connection]    An open AMQP connection, for re-use.
   * @param {RpcOptions}        [opts.rpcServer]                 Config for the client itself.
   * @param {string}            [opts.rpcServer.rpcExchangeName] Exchange where calls are published. Default 'mqrpc'. Must match client.
   * @param {StandardLogger}    [opts.rpcServer.logger]          Custom logger for client use.
   */
  constructor(opts: RpcServerOptions) {
    this.procedures = new Map()
    this.amqpClient = new AmqpClient(opts.amqpClient)

    if (opts.rpcServer) {
      if (opts.rpcServer.rpcExchangeName) this.rpcExchangeName = opts.rpcServer.rpcExchangeName
      if (opts.rpcServer.logger) this.log = logger
    }
  }

  async init() {
    if (this.procedures.size === 0) {
      this.log.warn(
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
      async (message: Message) => {
        let content: ClientPayload

        try {
          content = comms.extractCallContent(message)
        } catch (err) {
          this.log.error('[RpcServer] Got an invalid call', err, { message })
          return this.amqpClient.channel.nack(message)
        }

        const heartbeatWrapper = comms.whileSendingHeartbeats(
          this.amqpClient.channel, message, content.timeouts
        )

        try {
          // TODO: if callTimeout is set, we should wait a max of that for the proc,
          // since the client won't be there for the reply after that anyway
          // FIXME: do not reply if the server has been `term`ed
          const response = await heartbeatWrapper(
            () => this.call(content.procedure, content.args || [])
          )
          await comms.reply(this.amqpClient.channel, message, response)
        } catch (err) {
          if (err instanceof RpcServerError) {
            return await comms.reply(this.amqpClient.channel, message, err)
          }

          // Not an error on the procedure per se, but some unexpected error
          // while processing the call. A 500, if you will.
          this.log.error('[RpcServer] Error running call', err)
          this.amqpClient.channel.nack(message)
        }
      }
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

  protected async call(procedure: string, args: any[]): Promise<any> {
    if (!procedure) throw new InvalidCall('No `procedure` was provided')

    const proc = this.procedures.get(procedure)
    if (!proc) throw new NoSuchProcedure(procedure)

    this.log.info(`[RpcServer] Running procedure ${procedure}`)

    try {
      return await proc(...args)
    } catch (err) {
      throw new ProcedureFailed(err)
    }
  }
}
