import test from 'ava'
import { delay } from '../_utils'
import RpcClient from '../../lib/RpcClient'
import { newPromiseAndCallbacks } from '../../lib/promises'
import { TimeoutExpired } from '../../lib/Timer'
import { UnparseableContent, UnknownReply, ProcedureFailed as ClientProcFailed } from '../../lib/RpcClient/errors'
import { ProcedureFailed as ServerProcFailed } from '../../lib/RpcServer/errors'

test.beforeEach(t => {
  t.context.client = new RpcClient({ amqpClient: { amqpUrl: '' } })

  const [promise, callbacks] = newPromiseAndCallbacks()
  t.context.workingPromise = promise
  t.context.client.calls.set('works', callbacks)
})

test('[unit] #makeReplyHandler returns a function', t => {
  t.true(t.context.client.makeReplyHandler() instanceof Function)
})

test('[unit] #makeReplyHandler does not throw if the call is missing', t => {
  t.context.client.makeReplyHandler()({ properties: { correlationId: '1234' } })
  t.pass()
})

test('[unit] #makeReplyHandler rejects the call promise when reply cannot be parsed', t => {
  t.plan(1)

  const message = { properties: { correlationId: 'works' }, content: new Buffer('gibberish') }
  t.context.client.makeReplyHandler()(message)

  return t.context.workingPromise.catch(err => {
    t.true(err instanceof UnparseableContent)
  })
})

test('[unit] #makeReplyHandler resolves the call with the reply', async t => {
  const payload = { type: 'reply', reply: 42 }
  const message = { properties: { correlationId: 'works' }, content: new Buffer(JSON.stringify(payload)) }
  t.context.client.makeReplyHandler()(message)

  t.is(await t.context.workingPromise, 42)
})

test('[unit] #makeReplyHandler rejects a call on a received error', async t => {
  const payload = { type: 'error', error: new ServerProcFailed(new TypeError('42')).toObject() }
  const message = { properties: { correlationId: 'works' }, content: new Buffer(JSON.stringify(payload)) }
  t.context.client.makeReplyHandler()(message)

  return t.context.workingPromise.catch(err => {
    t.true(err instanceof ClientProcFailed)
    t.is(err.message, 'Remote procedure failed with error - TypeError: 42')
    t.is(err.causeStack, payload.error.cause.stack)
  })
})

test('[unit] #makeReplyHandler clears the ackTimeout when an `ack` message is received', async t => {
  const message = { properties: { correlationId: 'works' }, content: new Buffer('{"type":"ack"}') }
  t.context.client.callTimer.addTimeouts('works', { id: 'ackTimeout', length: 25 })
  t.context.client.makeReplyHandler()(message)

  await delay(30)

  await t.notThrows(Promise.race([t.context.workingPromise, Promise.resolve(42)]))
})

test('[unit] #makeReplyHandler sets the idleTimeout on an `ack` message, if defined', async t => {
  t.plan(1)

  t.context.client.idleTimeout = 25

  const timerPromise = t.context.client.callTimer.addTimeouts('works')
  const message = { properties: { correlationId: 'works' }, content: new Buffer('{"type":"ack"}') }
  t.context.client.makeReplyHandler()(message)

  timerPromise.catch(err => {
    t.true(err instanceof TimeoutExpired)
  })

  await delay(35)
})

test('[unit] #makeReplyHandler does not set the idleTimeout on an `ack` message, if not defined', async t => {
  const timerPromise = t.context.client.callTimer.addTimeouts('works')
  const message = { properties: { correlationId: 'works' }, content: new Buffer('{"type":"ack"}') }
  t.context.client.makeReplyHandler()(message)

  await delay(35)

  return t.notThrows(Promise.race([timerPromise, Promise.resolve(42)]))
})

test('[unit] #makeReplyHandler restarts the idleTimeout when a `wait` message is received', async t => {
  t.plan(2)

  const timerPromise = t.context.client.callTimer.addTimeouts('works', { id: 'idleTimeout', length: 40 })
  const message = { properties: { correlationId: 'works' }, content: new Buffer('{"type":"wait"}') }

  await delay(20)

  t.context.client.makeReplyHandler()(message)

  await delay(25)

  await t.notThrows(Promise.race([timerPromise, Promise.resolve(42)]))

  timerPromise.catch(err => {
    t.true(err instanceof TimeoutExpired)
  })

  await delay(25)
})

test('[unit] #makeReplyHandler rejects the call if an unknown message is received', async t => {
  t.plan(2)

  const message = { properties: { correlationId: 'works' }, content: new Buffer('{"type":"quoi"}') }
  t.context.client.makeReplyHandler()(message)

  return t.context.workingPromise.catch(err => {
    t.true(err instanceof UnknownReply)
    t.regex(err.message, /Cannot handle reply/)
  })
})
