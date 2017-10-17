import test from 'ava'
import * as uuid from 'uuid/v4'
import * as amqp from 'amqplib'
import * as sinon from 'sinon'
import { AMQP_URL } from './_config'
import { delay } from './_utils'
import RpcServer from '../lib/RpcServer'
import RpcClient from '../lib/RpcClient'
import * as clientErrors from '../lib/RpcClient/errors'
import { TimeoutExpired } from '../lib/Timer'

let connection: amqp.Connection;

test.before(async () => {
  connection = await amqp.connect(AMQP_URL)
})

test.after.always(async () => {
  await connection.close()
})

test.beforeEach(async t => {
  const rpcExchangeName = `mqrpc.${uuid()}` // make sure each call goes to the right server
  t.context.client = new RpcClient({ amqpClient: { connection }, rpcClient: { rpcExchangeName, idleTimeout: 50 } })
  t.context.server = new RpcServer({ amqpClient: { connection }, rpcServer: { rpcExchangeName } })

  await t.context.server.init()
  await t.context.client.init()

  t.context.server.registerDebugProcedures()
})

test.afterEach(async t => {
  await Promise.all([
    t.context.client.term(),
    t.context.server.term()
  ])
})

test('[integration] an RPC call resolves to the returned value from the procedure', async t => {
  const res = await t.context.client.call('mqrpc.echo', 42)
  t.is(res, 42)
})

test('[integration] calling an unknown procedure raises', async t => {
  await t.throws(
    t.context.client.call('doesnt.exist'),
    clientErrors.ServerError,
   'Server Error - NoSuchOperation: No operation named "doesnt.exist" has been registered'
 )
})

test('[integration] works nicely with no arguments and no returns', async t => {
  t.context.server.register('noop', () => {})
  t.is(await t.context.client.call('noop'), undefined)
})

test.serial('[integration] clears call timeouts on resolution and rejection', async t => {
  const resolves = t.context.client.call('mqrpc.echo', 42)
  const rejects = t.context.client.call('doesnt.exist')
  const errorMsg = 'Server Error - NoSuchOperation: No operation named "doesnt.exist" has been registered'

  const unhandledListener = err => t.fail(`Uncaught Error: ${err.message}`)
  process.on('unhandledRejection', unhandledListener)

  await t.notThrows(resolves)
  await t.throws(rejects, clientErrors.ServerError, errorMsg)

  await delay(50)

  process.removeListener('unhandledRejection', unhandledListener)

  t.pass()
});

test('[integration] a slow call still works with well configured timeouts', async t => {
  t.context.server.register('mqrpc.slow', () => delay(200).then(() => 42))

  // works fine locally with smaller numbers, but not over the wire in CI
  t.context.client.idleTimeout = 150
  t.context.client.ackTimeout = 250
  t.context.client.callTimeout = 500

  t.is(await t.context.client.call('mqrpc.slow'), 42)
})

test('[integration] a slow call fails with a short callTimeout', async t => {
  t.context.server.register('mqrpc.slow', () => delay(100).then(() => 42))
  t.context.client.callTimeout = 50

  await t.throws(
    t.context.client.call('mqrpc.slow'),
    TimeoutExpired,
    'callTimeout expired after 50ms'
  )

  await delay(100) // dont close channel yet (server will still reply)
})
