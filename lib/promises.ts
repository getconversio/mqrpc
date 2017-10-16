export interface PromiseCallbacks {
  resolve: Function
  reject: Function
}

/**
 * Creates a new Promise, returns it and its callbacks.
 */
export const newPromiseAndCallbacks = (): [Promise<any>, PromiseCallbacks] => {
  // the noop business is because TypeScript doesn't know the callback is
  // invoked immediately, and the error-disabling comment isn't available in
  // 2.5.0
  const noop = () => {}

  let resolve: Function = noop
  let reject: Function = noop

  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })

  return [promise, { resolve, reject }]
}
