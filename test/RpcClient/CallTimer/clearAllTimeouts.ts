import test from 'ava'
import { default as CallTimer } from '../../../lib/RpcClient/CallTimer'
import { delay } from '../../_utils'

test.beforeEach(t => {
  t.context.timer = new CallTimer(25, 25, 25)
})

test('[unit] #clearAllTimeouts clears all active timeouts of all calls', t => {
  const promises = [
    t.context.timer.startCallTimeouts('an-id'),
    t.context.timer.startCallTimeouts('an-id-too'),
    t.context.timer.startCallTimeouts('an-id-also'),
    Promise.resolve(42) // for .race
  ]

  t.context.timer.clearAllTimeouts()

  return delay(25).then(() => t.notThrows(Promise.race(promises)))
})
