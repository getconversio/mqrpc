import test from 'ava'
import AmqpClient from '../../lib/AmqpClient'

const AMQP_URL = 'amqp://guest:guest@localhost/test'

test('[unit] #constructor returns an instance of AmqpClient', t => {
  const client = new AmqpClient({ amqpUrl: AMQP_URL })
  t.true(client instanceof AmqpClient)
})
