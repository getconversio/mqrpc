import { Channel, Message } from 'amqplib'
import { RpcServerError } from './errors'

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
const sendMessage = async (channel: Channel, { replyTo, correlationId }: any, response: object) => {
  await channel.publish(
    '',
    replyTo,
    new Buffer(JSON.stringify(response)),
    { correlationId }
  )
}

/**
 * Replies to the client with a given response. Because this is a reply, the client's
 * message will be `ack`ed.
 *
 * If the `response` is an error, it will be serialized according to the error's config.
 * Otherwise, the response is serialized and sent as-is.
 *
 * @param {Channel}              channel  The Amqp channel to use.
 * @param {Message}              message  The client's original message.
 * @param {RpcServerError | any} response What to send back to the client.
 */
export const reply = async (channel: Channel, message: Message, response?: RpcServerError | any) => {
  const reply = response && response instanceof RpcServerError
    ? { error: response.toObject() }
    : { res: response }

  await sendMessage(channel, message.properties, reply)
  await channel.ack(message)
}
