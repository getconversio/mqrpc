import test from 'ava'
import * as sinon from 'sinon'
import { AMQP_URL } from '../_config'
import RpcClient from '../../lib/RpcClient'
import { CallTerminated } from '../../lib/RpcClient/errors'

test.beforeEach(async t => {
  t.context.client = new RpcClient({
    amqpClient: { amqpUrl: AMQP_URL },
    rpcClient: { idleTimeout: 30 }
  })

  await t.context.client.init()

  t.context.sandbox = sinon.sandbox.create()
  t.context.sandbox.stub(t.context.client.amqpClient.channel, 'publish').resolves()
})

test.afterEach(t => t.context.sandbox.restore())

test('[unit] #term calls #term on the Amqp client', async t => {
  const spy = t.context.sandbox.spy(t.context.client.amqpClient, 'term')

  await t.context.client.term()

  sinon.assert.calledOnce(spy)
  t.pass()
})

test('[unit] #term rejects all pending calls', async t => {
  const promises = [
    t.context.client.call('marco'),
    t.context.client.call('polo')
  ]

  await t.context.client.term()

  await Promise.all(promises.map(promise => {
    return t.throws(promise, CallTerminated)
  }))
})

test('[unit] #term clears all call timeouts', async t => {
  const spy = t.context.sandbox.spy(t.context.client.callTimer, 'clear')

  await t.context.client.term()

  sinon.assert.calledOnce(spy)
  t.pass()
})

test('[unit] #term is idempotent', async t => {
  await t.context.client.term()
  await t.notThrows(t.context.client.term())
})
