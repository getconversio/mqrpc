import test from 'ava'
import { default as CallTimer } from '../../../lib/RpcClient/CallTimer'

test('[unit] #constructor initializes the timeouts to the given values', t => {
  const timer = new CallTimer(1000, 2000, 3000)
  t.is(timer.ackTimeout, 1000)
  t.is(timer.idleTimeout, 2000)
  t.is(timer.callTimeout, 3000)
})
