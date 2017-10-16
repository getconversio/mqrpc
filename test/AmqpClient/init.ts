import test from 'ava'
import * as sinon from 'sinon'
import * as amqp from 'amqplib'
import { AMQP_URL } from '../_config'
import AmqpClient from '../../lib/AmqpClient'

test.afterEach(async t => {
  if (t.context.client) await t.context.client.term()
})

test('[unit] #init fails when given neither a connection nor a URL', async t => {
  const client = new AmqpClient({})
  await t.throws(client.init())
})

test('[unit] #init connects to RabbitMQ when given a URL', async t => {
  t.context.client = new AmqpClient({ amqpUrl: AMQP_URL })
  await t.context.client.init()

  t.truthy(t.context.client.connection)
  t.true(t.context.client.ownConnection)
})

test('[unit] #init reuses a given connection', async t => {
  const connection = await amqp.connect(AMQP_URL)
  t.context.client = new AmqpClient({ connection })

  await t.context.client.init()

  t.is(t.context.client.connection, connection)
})

test('[unit] #init creates a channel', async t => {
  const connection = await amqp.connect(AMQP_URL)
  t.context.client = new AmqpClient({ connection })

  await t.context.client.init()

  t.is(t.context.client.connection, connection)
})
