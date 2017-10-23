export interface PromiseCallbacks {
  resolve: (result?: any) => void
  reject: (err: Error) => void
}

/**
 * Creates a new Promise, returns it and its callbacks.
 */
export const newPromiseAndCallbacks = (): [Promise<any>, PromiseCallbacks] => {
  // the noop business is because TypeScript doesn't know the callback is
  // invoked immediately, and the error-disabling comment isn't available in
  // 2.5.0
  const noop = () => { /* noop */ }

  let resolve = noop
  let reject = noop

  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })

  return [promise, { resolve, reject }]
}
