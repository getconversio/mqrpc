import test from 'ava'
import * as sinon from 'sinon'
import { Message } from 'amqplib'
import { Channel } from 'amqplib/lib/channel_model'
import { delay } from '../../_utils'
import { whileSendingHeartbeats } from '../../../lib/RpcServer/comms'

const fakeMessage = { properties: { replyTo: 1234, correlationId: '12345' } } as Message
const expectMessage = (mock, type, times = 1) => {
  mock.expects('publish')
    .exactly(times)
    .withExactArgs('', 1234, new Buffer(JSON.stringify({ type })), { correlationId: '12345' })
    .resolves()
}

test.beforeEach(t => {
  t.context.sandbox = sinon.sandbox.create()
  t.context.fakeChannel = new Channel({})
  t.context.channelMock = sinon.mock(t.context.fakeChannel)
})

test.afterEach.always(t => t.context.sandbox.restore())

test('[unit] #whileSendingHeartbeats sends nothing when called, returns a function', t => {
  t.context.channelMock.expects('publish').never()

  const res = whileSendingHeartbeats(t.context.fakeChannel, fakeMessage, { })
  t.true(res instanceof Function)

  t.context.channelMock.verify()
})

test('[unit] #whileSendingHeartbeats sends an `ack` message when return function is called', async t => {
  expectMessage(t.context.channelMock, 'ack')

  await whileSendingHeartbeats(t.context.fakeChannel, fakeMessage, { })(async () => { /* */ })

  t.context.channelMock.verify()
  t.pass()
})

test('[unit] #whileSendingHeartbeats resolves to whatever the inner function resolves', async t => {
  expectMessage(t.context.channelMock, 'ack')

  t.is(
    await whileSendingHeartbeats(t.context.fakeChannel, fakeMessage, { })(async () => 42),
    42
  )

  t.context.channelMock.verify()
})

test('[unit] #whileSendingHeartbeats does not send `wait` messages if idleTimeout is not set', async t => {
  expectMessage(t.context.channelMock, 'ack')

  await whileSendingHeartbeats(t.context.fakeChannel, fakeMessage, { })(async () => { /* */ })
  await delay(50)

  t.context.channelMock.verify()
  t.pass()
})

test('[unit] #whileSendingHeartbeats sends `wait` messages if idleTimeout is set', async t => {
  expectMessage(t.context.channelMock, 'ack')
  expectMessage(t.context.channelMock, 'wait', 2)

  const fn = () => delay(140)
  await whileSendingHeartbeats(t.context.fakeChannel, fakeMessage, { idleTimeout: 150 })(fn)

  t.context.channelMock.verify()
  t.pass()
})

test('[unit] #whileSendingHeartbeats stops sending `wait` messages after function returns', async t => {
  expectMessage(t.context.channelMock, 'ack')
  expectMessage(t.context.channelMock, 'wait', 2)

  const fn = () => delay(140)
  await whileSendingHeartbeats(t.context.fakeChannel, fakeMessage, { idleTimeout: 150 })(fn)
  await delay(50)

  t.context.channelMock.verify()
  t.pass()
})

test('[unit] #whileSendingHeartbeats does not send `wait` messages if function returns quickly', async t => {
  expectMessage(t.context.channelMock, 'ack')

  const fn = () => delay(1)
  await whileSendingHeartbeats(t.context.fakeChannel, fakeMessage, { idleTimeout: 30 })(fn)

  t.context.channelMock.verify()
  t.pass()
})
