import test from 'ava'
import { RpcClient, RpcServer } from '../lib'
import Server from '../lib/RpcServer'
import Client from '../lib/RpcClient'

test('[unit] the server & client are root exports', t => {
  t.is(RpcClient, Client)
  t.is(RpcServer, Server)
})
