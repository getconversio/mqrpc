import test from 'ava'

import { AMQP_URL } from '../_config'
import AmqpClient from '../../lib/AmqpClient'

test.beforeEach(async t => {
  t.context.client = new AmqpClient({ amqpUrl: AMQP_URL })
  await t.context.client.init()
})

test('[unit] #term closes the channel', async t => {
  t.context.client.channel.on('close', () => t.pass())
  await t.context.client.term()
})

test('[unit] #term closes the connection', async t => {
  t.context.client.connection.on('close', () => t.pass())
  await t.context.client.term()
})
