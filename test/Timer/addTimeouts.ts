import test from 'ava'
import Timer from '../../lib/Timer'

test.beforeEach(t => t.context.timer = new Timer())
test.afterEach(t => t.context.timer.clear())

test('[unit] #addTimeouts returns a promise', t => {
  t.true(t.context.timer.addTimeouts('an-id', { id: 'ackTo', length: 25 }) instanceof Promise)
})

test('[unit] #addTimeouts rejects with an expired timeout', t => {
  t.plan(2)

  const start = Date.now()

  return t.context.timer.addTimeouts('an-id', { id: 'ackTo', length: 25 })
    .catch(err => {
      t.regex(err.message, /ackTo.*25/)
      t.true(Date.now() >= start + 25)
    })
})

test('[unit] #addTimeouts rejects with the first, when multiple are set', t => {
  t.plan(2)

  const start = Date.now()
  const tFast = { id: 'fastTo', length: 25 }
  const tSlow = { id: 'slowTo', length: 50 }

  return t.context.timer.addTimeouts('an-id', tSlow, tFast)
    .catch(err => {
      t.regex(err.message, /fastTo.*25/)
      t.true(Date.now() >= start + 25)
    })
})

test('[unit] #addTimeouts handles multiple entries independently', async t => {
  const start = Date.now()

  const onePromise = t.context.timer.addTimeouts('an-id', { id: 'ackTo', length: 25 })
  const twoPromise = t.context.timer.addTimeouts('an-id-too', { id: 'ackTo', length: 25 })

  t.not(onePromise, twoPromise)
  await t.throws(onePromise)
  await t.throws(twoPromise)
  t.true(Date.now() >= start + 25)
})

test('[unit] #addTimeouts re-uses the same promise for multiple adds on the same entry', async t => {
  const onePromise = t.context.timer.addTimeouts('an-id', { id: 'ackTo', lenght: 50 })
  const twoPromise = t.context.timer.addTimeouts('an-id', { id: 'callTo', lenght: 50 })

  t.is(onePromise, twoPromise)
})

test('[unit] #addTimeouts throws when the same timeout ID is re-used', t => {
  const to = { id: 'ackTo', lenght: 50 }

  t.context.timer.addTimeouts('an-id', to)
  t.throws(() => t.context.timer.addTimeouts('an-id', to))
  t.throws(() => t.context.timer.addTimeouts('an-id-too', to, to))
})
