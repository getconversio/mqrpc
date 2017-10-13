import test from 'ava'
import Timer from '../../lib/Timer'
import { delay } from '../_utils'

const timeout = { id: 'ackTo', length: 25 }

test.beforeEach(t => t.context.timer = new Timer())

test('[unit] #clear stops all active timeouts for all calls', t => {
  const promises = [
    t.context.timer.addTimeouts('an-id', timeout),
    t.context.timer.addTimeouts('an-id-too', timeout, { id: 'fast!', length: 15 }),
    t.context.timer.addTimeouts('an-id-also', timeout),
    Promise.resolve(42) // for .race
  ]

  t.context.timer.clear()

  return delay(25).then(() => t.notThrows(Promise.race(promises)))
})

test('[unit] #clear removes all calls', t => {
  const promises = [
    t.context.timer.addTimeouts('an-id', timeout),
    t.context.timer.addTimeouts('an-id-too', timeout)
  ]

  t.context.timer.clear()

  const otherPromises = [
    t.context.timer.addTimeouts('an-id', timeout),
    t.context.timer.addTimeouts('an-id-too', timeout)
  ]

  t.not(promises[0], otherPromises[0])
  t.not(promises[1], otherPromises[1])

  t.context.timer.clear() // cleanup
})
