import { SerializedError } from '../RpcServer/errors'

export class UnparseableContent extends Error {
  constructor(content: any) {
    super(`Received unparseable reply from server: ${content}`)
  }
}

export class UnknownReply extends Error {
  constructor(content: any) {
    super(`Cannot handle reply: ${content}`)
  }
}

export class ServerError extends Error {
  remoteErrorStack?: string

  constructor(error: SerializedError) {
    super(`Server Error - ${error.name}: ${error.message}`)
    if (error.stack) this.remoteErrorStack = error.stack
  }
}

export class ProcedureFailed extends Error {
  causeStack?: string

  constructor(cause: SerializedError) {
    super(`Remote procedure failed with error - ${cause.name}: ${cause.message}`)
    this.causeStack = cause && cause.stack
  }
}

export class CallTerminated extends Error {
  constructor() {
    super('Call terminated upon client shutdown')
  }
}
