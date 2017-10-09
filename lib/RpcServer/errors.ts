export interface SerializedError {
  message: string
  name: string
  stack?: string
}

export interface WrappedError extends SerializedError {
  cause: SerializedError
}

export class RpcServerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
  }

  get includeStack() {
    return false
  }

  toObject(): SerializedError {
    const error: SerializedError = { message: this.message, name: this.name }
    if (this.includeStack) error.stack = this.stack
    return error
  }
}

export class NoSuchOperation extends RpcServerError {
  constructor(operation: string) {
    super(`No operation named "${operation}" has been registered`)
  }
}

export class InvalidCall extends RpcServerError { }

export class ProcedureFailed extends RpcServerError {
  cause: Error

  constructor(err: Error) {
    super(`Operation failed with error: ${err.message}`)
    this.stack = err.stack
    this.cause = err
  }

  toObject(): WrappedError {
    return Object.assign(super.toObject(), { cause: {
      name: this.cause.name,
      stack: this.cause.stack,
      message: this.cause.message
    } })
  }
}
