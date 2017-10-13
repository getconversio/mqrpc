import test from 'ava'
import Timer from '../../lib/Timer'
import { delay } from '../_utils'

test.beforeEach(t => t.context.timer = new Timer())
test.afterEach(t => t.context.timer.clear())

test('[unit] #remove ignores unknown entries', t => {
  t.notThrows(() => t.context.timer.remove('an-id'))
})

test('[unit] #remove clears all set timeouts for an entry', t => {
  const startPromise = t.context.timer.addTimeouts('an-id', { id: 'ackTo', length: 25 })
  t.context.timer.remove('an-id')

  return delay(25).then(() => t.notThrows(Promise.race([startPromise, Promise.resolve(42)])))
})

test('[unit] #remove does not afect other entries', t => {
  const goodPromise = t.context.timer.addTimeouts('an-id', { id: 'ackTo', length: 25 })
  const badPromise = t.context.timer.addTimeouts('another-id', { id: 'ackTo', length: 25 })
  t.context.timer.remove('an-id')

  return delay(25).then(async () => {
    await t.throws(badPromise)
    await t.notThrows(Promise.race([goodPromise, Promise.resolve(42)]))
  })
})

test('[unit] #remove removes the existing entry', t => {
  const firstPromise = t.context.timer.addTimeouts('an-id', { id: 'ackTo', length: 25 })
  t.context.timer.remove('an-id')
  const secondPromise = t.context.timer.addTimeouts('an-id', { id: 'ackTo', length: 25 })

  t.not(firstPromise, secondPromise)
})
