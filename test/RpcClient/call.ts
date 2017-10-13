import test from 'ava'
import * as sinon from 'sinon'
import { delay } from '../_utils'
import { AMQP_URL } from '../_config'
import RpcClient from '../../lib/RpcClient'
import { TimeoutExpired } from '../../lib/Timer'

test.beforeEach(async t => {
  t.context.client = new RpcClient({
    amqpClient: { amqpUrl: AMQP_URL },
    rpcClient: { callTimeout: 25 }
  })

  await t.context.client.init()

  t.context.sandbox = sinon.sandbox.create()
  t.context.publishStub = t.context.sandbox.stub(
    t.context.client.amqpClient.channel, 'publish'
  ).resolves()
})

test.afterEach(t => {
  t.context.sandbox.restore()
  return t.context.client.term()
})

// Most of the tests for this function rely on RabbitMQ and a responding server,
// so they're mostly integration tests.
//
// @see test/clientServerInteraction.ts

test('[unit] publishes the procedure call', async t => {
  t.context.client.call('marco', 'polo', 42).catch(err => { /* call-term */ })

  await delay(1) // let the publish happen

  const payload = JSON.stringify({ procedure: 'marco', args: ['polo', 42] })
  sinon.assert.calledWith(
    t.context.publishStub,
    'mqrpc',
    'call',
    sinon.match(buffer => buffer.toString() === payload),
    { replyTo: 'amq.rabbitmq.reply-to', correlationId: sinon.match.string }
  )
  t.pass()
})

test('[unit] #call rejects on an expired timeout', async t => {
  const promise = t.context.client.call('marco')

  await delay(25)

  await t.throws(promise, TimeoutExpired, 'callTimeout expired after 25ms')
})

test('[unit] #call clears all call timeouts on reject', async t => {
  const spy = t.context.sandbox.spy(t.context.client.callTimer, 'addTimeouts')
  t.context.client.call('marco').catch(err => { /* timeout */ })

  await delay(30)

  sinon.assert.calledOnce(spy)
  sinon.assert.calledWith(spy, t.context.publishStub.getCall(0).args[3].correlationId)
  t.pass()
})
