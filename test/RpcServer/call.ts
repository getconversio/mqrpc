import test from 'ava'
import RpcServer from '../../lib/RpcServer'
import { InvalidCall, NoSuchProcedure, ProcedureFailed } from '../../lib/RpcServer/errors'

test.beforeEach(t => {
  t.context.server = new RpcServer({ amqpClient: { amqpUrl: '' } })
})

test('[unit] #call throws when no procedure name is given', t => {
  return t.throws(t.context.server.call('', []), InvalidCall)
})

test('[unit] #call throws when the procedure does not exist', t => {
  return t.throws(t.context.server.call('noop', []), NoSuchProcedure)
})

test('[unit] #call returns what the procedure resolves', async t => {
  t.context.server.register('meaning.of.life', () => 42)
  t.is(await t.context.server.call('meaning.of.life', []), 42)
})

test('[unit] #call throws wrapped procedure errors', async t => {
  t.plan(5)

  t.context.server.register('meaning.of.life', () => Promise.reject(new Error('42')))

  return t.context.server.call('meaning.of.life', [])
    .catch(err => {
      t.true(err instanceof ProcedureFailed)
      t.truthy(err.cause)
      t.true(err.cause instanceof Error)
      t.is(err.cause.message, '42')
      t.is(err.stack, err.cause.stack)
    })
})
