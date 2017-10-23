import test from 'ava'
import * as sinon from 'sinon'
import * as amqp from 'amqplib'
import { AMQP_URL } from '../_config'
import RpcClient from '../../lib/RpcClient'
import AmqpClient from '../../lib/AmqpClient'

test.afterEach(async t => {
  if (t.context.client) await t.context.client.term()
})

test('[unit] #init instances an AmqpClient', async t => {
  t.context.client = new RpcClient({ amqpClient: { amqpUrl: AMQP_URL } })
  await t.context.client.init()

  t.true(t.context.client.amqpClient instanceof AmqpClient)
})

test.serial('[unit] #init starts listening for replies', async t => {
  const connection = await amqp.connect(AMQP_URL)
  const channel = await connection.createChannel()
  const consumeSpy = sinon.spy(channel, 'consume')

  sinon.stub(connection, 'createChannel').resolves(channel)
  t.context.client = new RpcClient({ amqpClient: { connection } })
  await t.context.client.init()

  sinon.assert.calledWith(
    consumeSpy, 'amq.rabbitmq.reply-to', sinon.match.func, { noAck: true }
  )

  t.pass()
})
