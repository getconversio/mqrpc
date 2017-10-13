import test from 'ava'
import { Message } from 'amqplib'
import { extractCallContent } from '../../../lib/RpcServer/comms'

test('[unit] #extractCallContent throws when there is no replyTo in the properties', t => {
  t.throws(() => extractCallContent({ properties: {} } as Message), Error, 'Message has no replyTo')
})

test('[unit] #extractCallContent throws when there is no correlationId in the properties', t => {
  t.throws(
    () => extractCallContent({ properties: { replyTo: 12345} } as Message),
    Error,
    'Message has no correlationId'
  )
})

test('[unit] #extractCallContent throws when the content isn\'t valid JSON', t => {
  t.throws(
    () => extractCallContent({
      content: new Buffer('gibberish'),
      properties: { replyTo: 12345, correlationId: 'a' }
    } as Message),
    Error,
    'Message could not be parsed:'
  )
})

test('[unit] #extractCallContent returns the parsed call content', t => {
  const payload = {
    procedure: 'mqrpc.echo',
    args: [42],
    timeouts: { ackTimeout: 42 }
  }
  const result = extractCallContent({
    content: new Buffer(JSON.stringify(payload)),
    properties: { replyTo: 12345, correlationId: 'a' }
  } as Message)

  t.deepEqual(result, payload)
})
