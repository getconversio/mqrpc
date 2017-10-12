import test from 'ava'
import { default as CallTimer } from '../../../lib/RpcClient/CallTimer'

test('[unit] #startCallTimeouts returns a promise', t => {
  const timer = new CallTimer(0, 0, 0)
  t.true(timer.startCallTimeouts('an-id') instanceof Promise)
})

test('[unit] #startCallTimeouts rejects with an expired ackTimeout', t => {
  t.plan(2)

  const timer = new CallTimer(25, 0, 0)
  const start = Date.now()

  return timer.startCallTimeouts('an-id')
    .catch(err => {
      t.regex(err.message, /ackTimeout.*25/)
      t.true(Date.now() >= start + 25)
    })
})

test('[unit] #startCallTimeouts rejects with an expired idleTimeout', t => {
  t.plan(2)

  const timer = new CallTimer(0, 25, 0)
  const start = Date.now()

  return timer.startCallTimeouts('an-id')
    .catch(err => {
      t.regex(err.message, /idleTimeout.*25/)
      t.true(Date.now() >= start + 25)
    })
})

test('[unit] #startCallTimeouts rejects with an expired callTimeout', t => {
  t.plan(2)

  const timer = new CallTimer(0, 0, 25)
  const start = Date.now()

  return timer.startCallTimeouts('an-id')
    .catch(err => {
      t.regex(err.message, /callTimeout.*25/)
      t.true(Date.now() >= start + 25)
    })
})

test('[unit] #startCallTimeouts rejects with the first, when multiple are set', t => {
  t.plan(3)

  const timer = new CallTimer(25, 50, 75)
  const start = Date.now()

  return timer.startCallTimeouts('an-id')
    .catch(err => {
      t.regex(err.message, /ackTimeout.*25/)
      t.true(Date.now() >= start + 25)
      t.false(Date.now() >= start + 50)
    })
})

test('[unit] #startCallTimeouts handles multiple calls independently', async t => {
  const timer = new CallTimer(25, 0, 0)
  const start = Date.now()

  const onePromise = timer.startCallTimeouts('an-id')
  const twoPromise = timer.startCallTimeouts('an-id-too')

  await t.throws(onePromise)
  await t.throws(twoPromise)
  t.true(Date.now() >= start + 25)
})
