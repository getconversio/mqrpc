import { Channel, Message } from 'amqplib'
import { InvalidCall, NoSuchProcedure, ProcedureFailed, RpcServerError } from './errors'
import { ClientPayload, TimeoutDesc } from '../common'

/**
 * @private
 *
 * Publishes a message back to the client according to the given replyTo and
 * correlationId as passed in the original message props.
 *
 * @param {Channel} channel      The Amqp channel to use.
 * @param {object}  messageProps The `properties` key of the client's message.
 * @param {object}  response     The object to publish as a response.
 */
const sendMessage = async (channel: Channel, { replyTo, correlationId, deliveryMode }: any, response: object) => {
  await channel.publish(
    '',
    replyTo,
    new Buffer(JSON.stringify(response)),
    { deliveryMode, correlationId }
  )
}

/**
 * Sends an ack message to the client. This indicates the server has received a
 * procedure call and will start handling it.
 *
 * @param {Channel} channel  The Amqp channel to use.
 * @param {Message} message  The client's original message.
 */
export const ack = async (channel: Channel, message: Message) => {
  return sendMessage(channel, message.properties, { type: 'ack' })
}

/**
 * Sends a `wait` message to the client. This indicates the server is still
 * processing the call and the client should keep waiting for the reply.
 *
 * @param {Channel} channel  The Amqp channel to use.
 * @param {Message} message  The client's original message.
 */
export const wait = async (channel: Channel, message: Message) => {
  return sendMessage(channel, message.properties, { type: 'wait' })
}

/**
 * Replies to the client with a given response. Because this is a reply, the client's
 * message will be `ack`ed in the channel.
 *
 * If the `response` is an error, it will be serialized according to the error's config.
 * Otherwise, the response is serialized and sent as-is.
 *
 * @param {Channel}              channel  The Amqp channel to use.
 * @param {Message}              message  The client's original message.
 * @param {RpcServerError | any} response What to send back to the client.
 */
export const reply = async (channel: Channel, message: Message, response?: RpcServerError | any) => {
  response = response && response instanceof RpcServerError
    ? { type: 'error', error: response.toObject() }
    : { type: 'reply', reply: response }

  await sendMessage(channel, message.properties, response)
  await channel.ack(message)
}

/**
 * Handles messages on the .call queue. If the call is valid, its contents are
 * returned, otherwise an error is thrown.
 *
 * @param  {Channel}       channel The AMQP channel where the message arrived from.
 * @param  {Message}       message The AMQP message received from the queue.
 * @return {ClientPayload}         The message content, if valid.
 * @throws {Error}                 If the content cannot be retrieved or the message
 *                                 is in any way invalid.
 */
export const extractCallContent = (message: Message): ClientPayload => {
  let content: ClientPayload

  if (!message.properties.replyTo) throw new Error('Message has no replyTo')
  if (!message.properties.correlationId) throw new Error('Message has no correlationId')

  try {
    content = JSON.parse(message.content.toString()) as ClientPayload
  } catch (err) {
    throw new Error(`Message could not be parsed: ${err.message}`)
  }

  return content
}

/**
 * Returns a function that, when called with another function, sends the first
 * `ack` message to the client and executes the given function. While waiting
 * for a return, if `idleTimeout` is set, every idleTimeout / 3 a `wait`
 * message is sent to the client.
 *
 * The inner function will return or raise whatever the given function returns.
 *
 * @param   {Channel}     channel The AMQP channel where the message arrived from.
 * @param   {Message}     message The AMQP message received from the queue.
 * @param   {TimeoutDesc} timeouts The timeouts set on the RpcClient.
 * @returns {Function}
 */
export const whileSendingHeartbeats = (channel: Channel, message: Message, timeouts: TimeoutDesc) => {
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    await ack(channel, message)

    const idleInterval = timeouts.idleTimeout &&
      setInterval(wait, Math.round(timeouts.idleTimeout / 3), channel, message)

    try {
      return await fn()
    } finally {
      if (idleInterval) clearInterval(idleInterval)
    }
  }
}
