import test from 'ava'
import * as sinon from 'sinon'
import { Message } from 'amqplib'
import { AMQP_URL } from '../../_config'
import AmqpClient from '../../../lib/AmqpClient'
import { reply } from '../../../lib/RpcServer/comms'
import { NoSuchProcedure, ProcedureFailed } from '../../../lib/RpcServer/errors'

const sampleMessage = {
  fields: { deliveryTag: 1234567890987654321 },
  properties: { replyTo: 'amqp.rabbitmq.reply-to', correlationId: '123456' }
} as Message

const amqpClient = new AmqpClient({ amqpUrl: AMQP_URL })

test.before(() => amqpClient.init())
test.after.always(() => amqpClient.term())

test.beforeEach(t => t.context.sandbox = sinon.sandbox.create())
test.afterEach.always(t => t.context.sandbox.restore())

test.serial('[unit] #reply acks the given message', async t => {
  const spy = t.context.sandbox.spy(amqpClient.channel, 'ack')

  await reply(amqpClient.channel, sampleMessage)

  sinon.assert.calledWith(spy, sampleMessage)
  t.pass()
})

test.serial('[unit] #reply publishes to the given replyTo with the given correlationId', async t => {
  const spy = t.context.sandbox.spy(amqpClient.channel, 'publish')

  await reply(amqpClient.channel, sampleMessage)

  sinon.assert.calledWith(
    spy, '', 'amqp.rabbitmq.reply-to', sinon.match.any, { correlationId: '123456', deliveryMode: undefined }
  )
  t.pass()
})

test.serial('[unit] #reply serializes the response as JSON', async t => {
  t.plan(5)

  const spy = t.context.sandbox.spy(amqpClient.channel, 'publish')
  await reply(amqpClient.channel, sampleMessage, { meaning: 42 })

  const contentMatcher = sinon.match((content: Buffer) => {
    t.true(content instanceof Buffer)

    const json = JSON.parse(content.toString())

    t.is(json.type, 'reply')
    t.truthy(json.reply)
    t.deepEqual(json.reply, { meaning: 42 })
    t.is(json.error, undefined)

    return true
  })

  sinon.assert.calledWith(
    spy, sinon.match.string, sinon.match.string, contentMatcher, sinon.match.any
  )
})

test.serial('[unit] #reply handles undefined responses', async t => {
  const spy = t.context.sandbox.spy(amqpClient.channel, 'publish')
  await reply(amqpClient.channel, sampleMessage)

  sinon.assert.calledWith(
    spy, sinon.match.string, sinon.match.string, sinon.match({}), sinon.match.any
  )

  t.pass()
})

test.serial('[unit] #reply handles null responses', async t => {
  t.plan(1)
  const spy = t.context.sandbox.spy(amqpClient.channel, 'publish')
  await reply(amqpClient.channel, sampleMessage, null)

  const contentMatcher = sinon.match((content: Buffer) => {
    t.is(JSON.parse(content.toString()).reply, null)
    return true
  })

  sinon.assert.calledWith(
    spy, sinon.match.string, sinon.match.string, contentMatcher, sinon.match.any
  )
})

test.serial('[unit] #reply sends error responses under an error key', async t => {
  t.plan(4)

  const spy = t.context.sandbox.spy(amqpClient.channel, 'publish')
  await reply(amqpClient.channel, sampleMessage, new NoSuchProcedure('oops'))

  const contentMatcher = sinon.match((content: Buffer) => {
    const json = JSON.parse(content.toString())

    t.is(json.reply, undefined)
    t.is(json.type, 'error')
    t.truthy(json.error)
    t.deepEqual(
      json.error,
      { name: 'NoSuchProcedure', message: 'No procedure named "oops" has been registered' }
    )

    return true
  })

  sinon.assert.calledWith(
    spy, sinon.match.string, sinon.match.string, contentMatcher, sinon.match.any
  )
})

test.serial('[unit] #reply serializes errors according to their own implementation', async t => {
  t.plan(4)

  const spy = t.context.sandbox.spy(amqpClient.channel, 'publish')
  const error = new Error('oops')
  await reply(amqpClient.channel, sampleMessage, new ProcedureFailed(error))

  const contentMatcher = sinon.match((content: Buffer) => {
    const json = JSON.parse(content.toString())

    t.is(json.reply, undefined)
    t.is(json.type, 'error')
    t.truthy(json.error)
    t.deepEqual(
      json.error,
      {
        name: 'ProcedureFailed',
        message: 'Operation failed with error: oops',
        cause: {
          name: 'Error',
          message: 'oops',
          stack: error.stack
        }
      }
    )

    return true
  })

  sinon.assert.calledWith(
    spy, sinon.match.string, sinon.match.string, contentMatcher, sinon.match.any
  )
})
