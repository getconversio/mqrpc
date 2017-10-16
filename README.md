# MQRPC

> Easy RPC over RabbitMQ

Easily implement RPC over your RabbitMQ broker with a few lines of code:

```javascript
import { RpcClient, RpcServer } from 'mqrpc'

const server = new RpcServer({ amqpClient: { amqpUrl: 'amqp://localhost '} })
const client = new RpcClient({ amqpClient: { amqpUrl: 'amqp://localhost '} })

server.register('math.add', (a, b) => a + b)

await server.init()
await client.init()

await client.call('math.add', 2, 2) // 4
```

MQRPC leverages [RabbitMQs Direct reply-to](https://www.rabbitmq.com/direct-reply-to.html) functionality to implement an RPC system with reasonable defaults that work out-of-the box. All you need is a RabbitMQ broker and its URL.

## Features

* Any number of servers & clients
* Argument & Return serialization
* Error serialization

## API

Both Server & Client are designed to be simple to use and thus have a low-surface API. The following type definitions follow TypeScript syntax loosely:

#### RpcServer

##### `new RpcServer({ amqpClient: AmqpOpts, rpcServer?: ServerOpts })`

Instances a new server with the given config. `amqpClient` is required:

```typescript
type AmqpOpts = {
  connection?: amqplib.Connection // Pass a live amqplib connection here to re-use it.
  amqpUrl?: string,               // The RabbitMQ URL. Ignored if `connection` is provided.
  socketOptions?: object,         // Customize connection to RabbitMQ.
}

type ServerOpts = {
  rpcExchangeName?: string        // Exchange name for server, defaults to 'mqrpc'.
}
```

Although all configs are optional, one of `amqpClient.connection` or `amqpClient.amqpUrl` must be passed.

##### `async server.init()`

Declares all the exchanges, queues and bindings for the server. Starts listening for calls from clients, _so you should call this after registering all available procedures_.

##### `server.register(procedure: string, handler: Function)`

Registers a new procedure and its handler in the server. The handler can be synchronous or return a Promise.

```javascript
server.register('util.echo', arg => arg)
server.register('time.now', () => Date.now())
server.register('math.average', (...args) => args.reduce((acc, val) => acc + val) / args.length)
server.register('meaning.of.life', async () => 42)
```

`register` should be called before `init` to ensure the server won't receive any unknown calls by clients that are already live.

##### `async server.term()`

Neatly shut down the server. Closes the AMQP channel and, if one wasn't provided, the connection as well.

#### RpcClient

##### `new RpcClient({ amqpClient: AmqpOpts, rpcClient?: ClientOpts })`

Instances a new client with the given config. `amqpClient` is required:

```typescript
type AmqpOpts = {
  connection?: amqplib.Connection // Pass a live amqplib connection here to re-use it.
  amqpUrl?: string,               // The RabbitMQ URL. Ignored if `connection` is provided.
  socketOptions?: object,         // Customize connection to RabbitMQ.
}

type ClientOpts = {
  rpcExchangeName?: string        // Exchange name for server, defaults to 'mqrpc'.
}
```

Although all configs are optional, one of `amqpClient.connection` or `amqpClient.amqpUrl` must be passed.

##### `async client.init()`

Connects to RabbitMQ and starts listening for replies from servers.

##### `async client.call(procedure: string, ...args: any[])`

Calls the named `procedure` on an RpcServer with the given `args`. Resolves to whatever the procedure returns. Rejects if the procedure throws, or there is a connection error or an error in the server.

##### `async client.term()`

Neatly shut down the client. Closes the AMQP channel and, if one wasn't provided, the connection as well.

###### Errors

The following error types may be thrown from `client.call`:

* `ProcedureFailed`: The most common (hopefully), is thrown when the procedure itself throws. The remote error stack may be included in `error.causeStack`.
* `ServerError`: When an error occurs in the server while processing the call. Eg: the requested procedure is not registered.
* `UnparseableContent`: Whatever reply we got from a server could not be parsed.
* `UnknownReply`: Reply was parseable, but the format isn't understood.

## Future Features

* Call timeouts
* Publisher drain management

## Testing

`$ yarn test`

## Contributing

Feel free to submit PRs. Please include unit tests for any new features.

## Why TypeScript

Because I wanted to try it out ¯\\_(ツ)_/¯
