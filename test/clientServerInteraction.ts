import test from 'ava'
import * as uuid from 'uuid/v4'
import * as amqp from 'amqplib'
import * as sinon from 'sinon'
import { AMQP_URL } from './_config'
import RpcServer from '../lib/RpcServer'
import RpcClient from '../lib/RpcClient'
import * as clientErrors from '../lib/RpcClient/errors'

let connection: amqp.Connection;

test.before(async () => {
  connection = await amqp.connect(AMQP_URL)
})

test.after.always(async () => {
  await connection.close()
})

test.beforeEach(async t => {
  const rpcExchangeName = `mqrpc.${uuid()}` // make sure each call goes to the right server
  t.context.client = new RpcClient({ amqpClient: { connection }, rpcClient: { rpcExchangeName } })
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
