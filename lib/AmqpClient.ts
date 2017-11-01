import * as amqp from 'amqplib'

export interface AmqpClientOptions {
  connection?: amqp.Connection
  amqpUrl?: string
  socketOptions?: object
  prefetchCount?: number
}

export default class AmqpClient {
  amqpUrl?: string
  socketOptions?: object
  connection: amqp.Connection
  channel: amqp.Channel
  prefetchCount = 100

  protected ownConnection = false
  protected inited = false

  constructor(opts: AmqpClientOptions) {
    if (opts.connection) this.connection = opts.connection
    if (opts.amqpUrl) this.amqpUrl = opts.amqpUrl
    if (typeof opts.prefetchCount !== 'undefined') this.prefetchCount = opts.prefetchCount
    this.socketOptions = opts.socketOptions
  }

  async init() {
    if (!this.amqpUrl && !this.connection) {
      throw new Error('Either connection or amqpUrl must be provided')
    }

    if (this.inited) return

    if (!this.connection && this.amqpUrl) {
      this.connection = await amqp.connect(this.amqpUrl, this.socketOptions)
      this.ownConnection = true
    }

    this.channel = await this.connection.createChannel()
    await this.channel.prefetch(this.prefetchCount, true)

    this.inited = true
  }

  async term() {
    if (!this.inited) return
    await this.channel.close()
    if (this.ownConnection) await this.connection.close()
    this.inited = false
  }
}
