import test from 'ava'
import { default as CallTimer } from '../../../lib/RpcClient/CallTimer'
import { delay } from '../../_utils'

test.beforeEach(t => {
  t.context.timer = new CallTimer(25, 25, 25)
})

test('[unit] #clearCallTimeouts ignores unknown calls', t => {
  t.notThrows(() => t.context.timer.clearCallTimeouts('an-id'))
})

test('[unit] #clearCallTimeouts clears all set timeouts for a call', t => {
  const startPromise = t.context.timer.startCallTimeouts('an-id')
  t.context.timer.clearCallTimeouts('an-id')

  return delay(25).then(() => t.notThrows(Promise.race([startPromise, Promise.resolve(42)])))
})

test('[unit] #clearCallTimeouts does not afect other calls', t => {
  const goodPromise = t.context.timer.startCallTimeouts('an-id')
  const badPromise = t.context.timer.startCallTimeouts('another-id')
  t.context.timer.clearCallTimeouts('an-id')

  return delay(25).then(async () => {
    await t.throws(badPromise)
    await t.notThrows(Promise.race([goodPromise, Promise.resolve(42)]))
  })
})
