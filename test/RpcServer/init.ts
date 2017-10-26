import test from 'ava'
import * as sinon from 'sinon'
import * as amqp from 'amqplib'
import { AMQP_URL } from '../_config'
import RpcServer from '../../lib/RpcServer'
import AmqpClient from '../../lib/AmqpClient'

const amqpClient = new AmqpClient({ amqpUrl: AMQP_URL })

test.before(() => amqpClient.init())
test.after(() => amqpClient.term())

test.beforeEach(t => t.context.sandbox = sinon.sandbox.create())
test.afterEach(async t => {
  t.context.sandbox.restore()
  if (t.context.server) await t.context.server.term()
  await Promise.all([
    amqpClient.channel.deleteQueue('mqrpc.call'),
    amqpClient.channel.deleteQueue('conversio.mqrpc.call'),
    amqpClient.channel.deleteExchange('mqrpc'),
    amqpClient.channel.deleteExchange('conversio.mqrpc')
  ])
})

test.serial('[unit] #init instances an AmqpClient', async t => {
  t.context.server = new RpcServer({ amqpClient: { amqpUrl: AMQP_URL } })
  await t.context.server.init()

  t.true(t.context.server.amqpClient instanceof AmqpClient)
})

test.serial('[unit] #init asserts the client\'s exchange', async t => {
  t.context.server = new RpcServer({ amqpClient: { amqpUrl: AMQP_URL } })
  await t.context.server.init()

  t.notThrows(() => amqpClient.channel.checkExchange(t.context.server.rpcExchangeName))
})

test.serial('[unit] #init asserts the call queue and binds it to the exchange', async t => {
  const channel = await amqpClient.connection.createChannel()
  const bindSpy = t.context.sandbox.spy(channel, 'bindQueue') // There's no way to check if the queue is bound
  t.context.sandbox.stub(amqpClient.connection, 'createChannel').resolves(channel)

  t.context.server = new RpcServer({ amqpClient: { connection: amqpClient.connection } })
  await t.context.server.init()

  t.notThrows(() => amqpClient.channel.checkQueue(t.context.server.rpcExchangeName + '.call'))

  sinon.assert.calledWith(bindSpy, 'mqrpc.call', 'mqrpc', 'call')
})

test.serial('[unit] #init changes queue & exchange namespaces as configured', async t => {
  const channel = await amqpClient.connection.createChannel()
  const bindSpy = t.context.sandbox.spy(channel, 'bindQueue') // There's no way to check if the queue is bound
  t.context.sandbox.stub(amqpClient.connection, 'createChannel').resolves(channel)

  t.context.server = new RpcServer({
    amqpClient: { connection: amqpClient.connection },
    rpcServer: { rpcExchangeName: 'conversio.mqrpc' }
  })
  await t.context.server.init()

  t.notThrows(() => amqpClient.channel.checkExchange('conversio.mqrpc'))
  t.notThrows(() => amqpClient.channel.checkQueue('conversio.mqrpc.call'))

  sinon.assert.calledWith(bindSpy, 'conversio.mqrpc.call', 'conversio.mqrpc', 'call')
})

test.serial('[unit] #init starts listening for calls', async t => {
  const channel = await amqpClient.connection.createChannel()
  const consumeSpy = t.context.sandbox.spy(channel, 'consume')

  t.context.sandbox.stub(amqpClient.connection, 'createChannel').resolves(channel)

  t.context.server = new RpcServer({ amqpClient: { connection: amqpClient.connection } })
  await t.context.server.init()

  sinon.assert.calledWith(consumeSpy, 'mqrpc.call', sinon.match.func)

  t.pass()
})
