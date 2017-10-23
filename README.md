# MQRPC

> 💫 Easy RPC over RabbitMQ

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
* Timeout management

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
  logger?: object                 // For custom logger injection.
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
  logger?: object                 // For custom logger injection.
  ackTimeout?: number             // How long should the client wait for a Server to start working on a call. Default 0 (no timeout).
  idleTimeout?: number            // How long can the server be idle until it is considered "dead". Default 0 (no timeout).
  callTimeout?: number            // Maximum time from making a call to receiving a reply. Default 900 000 (15 minutes).
}
```

Although all configs are optional, one of `amqpClient.connection` or `amqpClient.amqpUrl` must be passed. Every timeout is in milliseconds and will throw `TimeoutExpired` when breached. See [timeouts](#timeouts) below for more info.

##### `async client.init()`

Connects to RabbitMQ and starts listening for replies from servers.

##### `async client.call(procedure: string, ...args: any[])`

Calls the named `procedure` on an RpcServer with the given `args`. Resolves to whatever the procedure returns. Rejects if the procedure throws, or there is a connection error or an error in the server.

###### Errors

The following error types may be thrown:

* `ProcedureFailed`: The most common (hopefully), is thrown when the procedure itself throws. The remote error stack may be included in `error.causeStack`.
* `ServerError`: When an error occurs in the server while processing the call. Eg: the requested procedure is not registered.
* `UnparseableContent`: Whatever reply we got from a server could not be parsed.
* `UnknownReply`: Reply was parseable, but the format isn't understood.

##### `async client.term()`

Neatly shut down the client. Closes the AMQP channel and, if one wasn't provided, the connection as well.

## Timeouts

Since it may not be sensible to wait forever for a call to resolve, the client exposes three configurable timeouts that will interrupt a call when expired. These are:

### `ackTimeout`

When a server receives a procedure call it will send an `ack` message back to the client, immediately before beginning execution. This signals the client that a server is handling their call. This timeout signals how long to wait until the `ack` is received.

This timeout is disabled by default, since it's sensible to expect a server will eventually pick up a client's call. However, it may be used to control for times of high message congestion, for example.

### `idleTimeout`

While the server is executing a procedure, it'll periodically send `wait` messages back to the client (behind the scenes). This works as a heartbeat of sorts and indicates to the client that the server hasn't crashed, or in some way disconnected. This timeout indicates how long a server may be silent before aborting the call.

This timeout is disabled by default, since RabbitMQ has its own hearbeat functionality that, in conjunction with its own `ack` mode, guarantees at-least-once execution. You may enable this if operating in `noAck` mode.

### `callTimeout`

The overall maximum time a call may take to resolve a request. This timeout starts on a procedure call and terminates when a reply is received.

This timeout is 15 minutes by default.

## Future Features

* Publisher drain management
* Server-side timeout management

## Testing

You'll need a local RabbitMQ broker to run the tests. Optionally set env var `RABBITMQ_VHOST` to specify a vhost, uses `/` by default. Then:

`$ yarn test`

## Contributing

Feel free to submit PRs. Please include unit tests for any new features.

## Why TypeScript

Because I wanted to try it out ¯\\_(ツ)_/¯
