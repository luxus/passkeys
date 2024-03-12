import { type RouterOps, RpcClient } from '@passlock/shared/dist/rpc/rpc'
import { Effect as E, Layer as L, LogLevel, Logger, pipe } from 'effect'
import { NoSuchElementException } from 'effect/Cause'
import { describe, expect, test } from 'vitest'
import { mock } from 'vitest-mock-extended'
import { EmailService, EmailServiceLive } from './email'
import * as Fixture from './email.fixture'
import { AuthenticationService } from '../authentication/authenticate'
import { StorageService } from '../storage/storage'

describe('verifyEmailCode should', () => {
  test('return true when the verification is successful', async () => {
    const assertions = E.gen(function* (_) {
      const service = yield* _(EmailService)
      const result = yield* _(service.verifyEmailCode({ code: '123' }))

      expect(result).toBe(true)
    })

    const service = pipe(
      EmailServiceLive,
      L.provide(Fixture.locationSearchTest),
      L.provide(Fixture.authenticationServiceTest),
      L.provide(Fixture.storageServiceTest),
      L.provide(Fixture.rpcClientTest),
    )

    const effect = pipe(E.provide(assertions, service), Logger.withMinimumLogLevel(LogLevel.None))

    return E.runPromise(effect)
  })

  test('check for a token in local storage', async () => {
    const assertions = E.gen(function* (_) {
      const service = yield* _(EmailService)
      yield* _(service.verifyEmailCode({ code: '123' }))

      const storageService = yield* _(StorageService)
      expect(storageService.getToken).toHaveBeenCalledWith('passkey')
    })

    const storageServiceTest = L.effect(
      StorageService,
      E.sync(() => {
        const storageServiceMock = mock<StorageService>()

        storageServiceMock.getToken.mockReturnValue(E.succeed(Fixture.storedToken))
        storageServiceMock.clearToken.mockReturnValue(E.unit)

        return storageServiceMock
      }),
    )

    const service = pipe(
      EmailServiceLive,
      L.provide(Fixture.locationSearchTest),
      L.provide(Fixture.authenticationServiceTest),
      L.provide(storageServiceTest),
      L.provide(Fixture.rpcClientTest),
    )

    const layers = L.merge(service, storageServiceTest)
    const effect = pipe(E.provide(assertions, layers), Logger.withMinimumLogLevel(LogLevel.None))

    return E.runPromise(effect)
  })

  test('re-authenticate the user if no local token', async () => {
    const assertions = E.gen(function* (_) {
      const service = yield* _(EmailService)
      yield* _(service.verifyEmailCode({ code: '123' }))

      const authService = yield* _(AuthenticationService)
      expect(authService.authenticatePasskey).toHaveBeenCalled()
    })

    const storageServiceTest = L.effect(
      StorageService,
      E.sync(() => {
        const storageServiceMock = mock<StorageService>()

        storageServiceMock.getToken.mockReturnValue(E.fail(new NoSuchElementException()))
        storageServiceMock.clearToken.mockReturnValue(E.unit)

        return storageServiceMock
      }),
    )

    const authServiceTest = L.effect(
      AuthenticationService,
      E.sync(() => {
        const authServiceMock = mock<AuthenticationService>()

        authServiceMock.authenticatePasskey.mockReturnValue(E.succeed(Fixture.principal))

        return authServiceMock
      }),
    )

    const service = pipe(
      EmailServiceLive,
      L.provide(Fixture.locationSearchTest),
      L.provide(authServiceTest),
      L.provide(storageServiceTest),
      L.provide(Fixture.rpcClientTest),
    )

    const layers = L.mergeAll(service, storageServiceTest, authServiceTest)
    const effect = pipe(E.provide(assertions, layers), Logger.withMinimumLogLevel(LogLevel.None))

    return E.runPromise(effect)
  })

  test('call the backend', async () => {
    const assertions = E.gen(function* (_) {
      const service = yield* _(EmailService)
      yield* _(service.verifyEmailCode({ code: Fixture.code }))

      const rpcClient = yield* _(RpcClient)
      expect(rpcClient.verifyEmail).toHaveBeenCalledWith(Fixture.verifyEmailReq)
    })

    const rpcClientTest = L.effect(
      RpcClient,
      E.sync(() => {
        const rpcMock = mock<RouterOps>()

        rpcMock.verifyEmail.mockReturnValue(E.succeed(Fixture.verifyEmailRes))

        return rpcMock
      }),
    )

    const service = pipe(
      EmailServiceLive,
      L.provide(Fixture.locationSearchTest),
      L.provide(Fixture.authenticationServiceTest),
      L.provide(Fixture.storageServiceTest),
      L.provide(rpcClientTest),
    )

    const layers = L.merge(service, rpcClientTest)
    const effect = pipe(E.provide(assertions, layers), Logger.withMinimumLogLevel(LogLevel.None))

    return E.runPromise(effect)
  })
})

describe('verifyEmailLink should', () => {
  test('extract the code from the current url', async () => {
    const assertions = E.gen(function* (_) {
      const service = yield* _(EmailService)
      yield* _(service.verifyEmailLink())

      // LocationSearch return ?code=code
      // and we expect rpcClient to be called with code
      const rpcClient = yield* _(RpcClient)
      expect(rpcClient.verifyEmail).toBeCalledWith(Fixture.verifyEmailReq)
    })

    const rpcClientTest = L.effect(
      RpcClient,
      E.sync(() => {
        const rpcMock = mock<RouterOps>()

        rpcMock.verifyEmail.mockReturnValue(E.succeed(Fixture.verifyEmailRes))

        return rpcMock
      }),
    )

    const service = pipe(
      EmailServiceLive,
      L.provide(Fixture.locationSearchTest),
      L.provide(Fixture.storageServiceTest),
      L.provide(Fixture.authenticationServiceTest),
      L.provide(rpcClientTest),
    )

    const layers = L.merge(service, rpcClientTest)
    const effect = pipe(E.provide(assertions, layers), Logger.withMinimumLogLevel(LogLevel.None))

    return E.runPromise(effect)
  })
})
