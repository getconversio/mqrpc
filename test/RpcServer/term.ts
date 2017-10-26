import test from 'ava'
import * as sinon from 'sinon'
import { AMQP_URL } from '../_config'
import RpcServer from '../../lib/RpcServer'

test.beforeEach(async t => {
  t.context.sandbox = sinon.sandbox.create()
  t.context.server = new RpcServer({ amqpClient: { amqpUrl: AMQP_URL } })
  await t.context.server.init()
})

test.afterEach(t => t.context.sandbox.restore())

test('[unit] #term calls #term on the Amqp client', async t => {
  const spy = t.context.sandbox.spy(t.context.server.amqpClient, 'term')

  await t.context.server.term()

  sinon.assert.calledOnce(spy)
  t.pass()
})

test('[unit] #term is idempotent', async t => {
  await t.context.server.term()
  await t.notThrows(t.context.server.term())
})
