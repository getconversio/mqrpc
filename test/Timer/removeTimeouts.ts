import test from 'ava'
import Timer from '../../lib/Timer'
import { delay } from '../_utils'

const timeout = { id: 'ackTo', length: 25 }

test.beforeEach(t => t.context.timer = new Timer())
test.afterEach(t => t.context.timer.clear())

test('[unit] #removeTimeouts throws when the entry does not exist', t => {
  t.throws(() => t.context.timer.removeTimeouts('an-id', 'ackTo'))
})

test('[unit] #removeTimeouts ignores missing timeouts', t => {
  t.context.timer.addTimeouts('an-id', timeout)
  t.notThrows(() => t.context.timer.removeTimeouts('an-id', 'otherTo'))
})

test('[unit] #removeTimeouts stops & removes the given timeouts', t => {
  const promise = t.context.timer.addTimeouts('an-id', timeout, { id: 'otherTo', length: 15 })
  t.context.timer.removeTimeouts('an-id', timeout.id, 'otherTo')

  return delay(25).then(() => t.notThrows(Promise.race([promise, Promise.resolve(42)])))
})

test('[unit] #removeTimeouts does not affect other timeouts in the same entry', t => {
  t.plan(2)

  const start = Date.now()
  const promise = t.context.timer.addTimeouts('an-id', timeout, { id: 'otherTo', length: 15 })
  t.context.timer.removeTimeouts('an-id', 'otherTo')

  return promise.catch(err => {
    t.regex(err.message, /ackTo.*25/)
    t.true(Date.now() >= start + 25)
  })
})
