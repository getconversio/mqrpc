import test from 'ava'
import * as sinon from 'sinon'
import { Message } from 'amqplib'
import { AMQP_URL } from '../../_config'
import AmqpClient from '../../../lib/AmqpClient'
import { ack, wait } from '../../../lib/RpcServer/comms'

const sampleMessage = {
  fields: { deliveryTag: 1234567890987654321 },
  properties: { replyTo: 'amqp.rabbitmq.reply-to', correlationId: '123456', deliveryMode: 2 }
} as Message

const amqpClient = new AmqpClient({ amqpUrl: AMQP_URL })

test.before(() => amqpClient.init())
test.after.always(() => amqpClient.term())

test.beforeEach(t => t.context.sandbox = sinon.sandbox.create())
test.afterEach.always(t => t.context.sandbox.restore())

test.serial('[unit] #ack sends an ack message to the client', async t => {
  const spy = t.context.sandbox.spy(amqpClient.channel, 'publish')
  await ack(amqpClient.channel, sampleMessage)

  sinon.assert.calledWith(
    spy, '', 'amqp.rabbitmq.reply-to', new Buffer('{"type":"ack"}'), { correlationId: '123456', deliveryMode: 2 }
  )
  t.pass()
})

test.serial('[unit] #wait sends a wait message to the client', async t => {
  const spy = t.context.sandbox.spy(amqpClient.channel, 'publish')
  await wait(amqpClient.channel, sampleMessage)

  sinon.assert.calledWith(
    spy, '', 'amqp.rabbitmq.reply-to', new Buffer('{"type":"wait"}'), { correlationId: '123456', deliveryMode: 2 }
  )
  t.pass()
})
