import test from 'ava'
import Timer from '../../lib/Timer'
import { delay } from '../_utils'

const timeout = { id: 'ackTo', length: 40 }

test.beforeEach(t => t.context.timer = new Timer())
test.afterEach(t => t.context.timer.clear())

test('[unit] #restartTimeouts throws on missing entries', t => {
  t.throws(() => t.context.timer.restartTimeouts('an-id'))
})

test('[unit] #restartTimeouts throws on missing timeouts', t => {
  t.context.timer.addTimeouts('an-id', timeout)
  t.throws(() => t.context.timer.restartTimeouts('an-id', 'otherTo'))
})

test('[unit] #restartTimeouts restarts the given timeout', async t => {
  t.plan(2)

  const start = Date.now()
  const promise = t.context.timer.addTimeouts('an-id', timeout, { id: 'slowTo', length: 50 })

  await delay(20)

  t.context.timer.restartTimeouts('an-id', timeout.id, 'slowTo')

  await promise.catch(err => {
    t.regex(err.message, /ackTo.*40/)
    t.true(Date.now() >= start + 60)
  })
})

test('[unit] #restartTimeouts does not affect other timeouts', async t => {
  t.plan(2)

  const start = Date.now()
  const promise = t.context.timer.addTimeouts('an-id', timeout, { id: 'slowTo', length: 50 })

  await delay(20)

  t.context.timer.restartTimeouts('an-id', timeout.id)

  await promise.catch(err => {
    t.regex(err.message, /slowTo.*50/)
    t.true(Date.now() >= start + 50)
  })
})
