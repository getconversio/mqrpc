const vhost = process.env.RABBITMQ_VHOST || '/'
const AMQP_URL = 'amqp://guest:guest@localhost' + vhost
export { AMQP_URL }
