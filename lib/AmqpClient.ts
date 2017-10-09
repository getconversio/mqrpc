import * as amqp from 'amqplib'

export interface AmqpClientOptions {
  connection?: amqp.Connection
  amqpUrl?: string
  socketOptions?: object
}

export default class AmqpClient {
  amqpUrl?: string
  socketOptions?: object
  connection: amqp.Connection
  channel: amqp.Channel

  ownConnection = false

  constructor(opts: AmqpClientOptions) {
    if (opts.connection) this.connection = opts.connection
    if (opts.amqpUrl) this.amqpUrl = opts.amqpUrl
    this.socketOptions = opts.socketOptions
  }

  async init() {
    if (!this.amqpUrl && !this.connection) {
      throw new Error('Either connection or amqpUrl must be provided')
    }

    if (!this.connection && this.amqpUrl) {
      this.connection = await amqp.connect(this.amqpUrl, this.socketOptions)
      this.ownConnection = true
    }

    this.channel = await this.connection.createChannel()
  }

  async term() {
    await this.channel.close();
    if (this.ownConnection) await this.connection.close()
  }
}
