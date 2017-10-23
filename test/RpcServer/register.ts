import test from 'ava'
import * as sinon from 'sinon'
import RpcServer from '../../lib/RpcServer'

test('[unit] #register registers a new operation', async t => {
  const server = new RpcServer({ amqpClient: { amqpUrl: 'fake' } })
  const spy = sinon.spy()

  server.register('anOp', spy)

  t.true(server.procedures.has('anOp'))
  t.is(server.procedures.get('anOp'), spy)

  const fn: (...args: any[]) => void = server.procedures.get('anOp') as (...args: any[]) => void
  fn(1, 2, 3)

  sinon.assert.calledWith(spy, 1, 2, 3)
})
