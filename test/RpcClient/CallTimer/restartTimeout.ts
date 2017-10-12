import test from 'ava'
import { default as CallTimer } from '../../../lib/RpcClient/CallTimer'
import { delay } from '../../_utils'

test.beforeEach(t => {
  t.context.timer = new CallTimer(25, 0, 0)
})

test.afterEach(t => t.context.timer.clearAllTimeouts())

test('[unit] #restartTimeout ignores missing calls', t => {
  t.notThrows(() => t.context.timer.restartTimeout('an-id'))
})

test('[unit] #restartTimeout ignores unset timeouts', t => {
  t.context.timer.startCallTimeouts('an-id')
  t.notThrows(() => t.context.timer.restartTimeout('an-id', 'idleTimeout'))
})

test('[unit] #restartTimeout restarts the given timeout', async t => {
  t.plan(2)

  const start = Date.now()
  const promise = t.context.timer.startCallTimeouts('an-id')

  await delay(15)

  t.context.timer.restartTimeout('an-id', 'ackTimeout')

  await promise.catch(err => {
    t.regex(err.message, /ackTimeout.*25/)
    t.true(Date.now() >= start + 40)
  })
})
