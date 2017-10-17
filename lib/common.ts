export interface TimeoutDesc {
  ackTimeout?: number
  idleTimeout?: number
  callTimeout?: number
}

export interface ClientPayload {
  procedure: string
  args?: any[]
  timeouts: TimeoutDesc
}

export interface ServerPayload {
  type: 'ack' | 'wait' | 'error' | 'reply'
  error?: any
  reply?: any
}

export interface StandardLogger {
  info: (message: string, ...args: any[]) => void
  warn: (message: string, ...args: any[]) => void
  error: (message: string, ...args: any[]) => void
}
