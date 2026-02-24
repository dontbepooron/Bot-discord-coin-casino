import { AsyncLocalStorage } from 'node:async_hooks'

const requestContextStorage = new AsyncLocalStorage()

export function runWithRequestContext(context, fn) {
  return requestContextStorage.run(context || {}, fn)
}

export function getRequestContext() {
  return requestContextStorage.getStore() || null
}
