// Handlers are meant to be async outside tests
import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import { Agent } from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { HandlerEvent } from '@netlify/functions'
import { describe, test } from 'vitest'
import nodeFetch from 'node-fetch'
import execa from 'execa'
import dedent from 'dedent'

import { curl } from '../../utils/curl.js'
import { withDevServer } from '../../utils/dev-server.js'
import { withMockApi } from '../../utils/mock-api.js'
import { withSiteBuilder } from '../../utils/site-builder.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const testMatrix = [{ args: [] }]

const generateSSLCertificate = async () => {
  const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), 'certs-'))

  await fs.writeFile(
    path.join(tmpdir, 'certconf'),
    dedent`
      [dn]
      CN=localhost
      [req]
      distinguished_name = dn
      [EXT]
      subjectAltName=DNS:localhost
      keyUsage=digitalSignature
      extendedKeyUsage=serverAuth
    `,
  )
  await execa(
    'openssl',
    [
      'req',
      '-x509',
      '-out',
      'localhost.crt',
      '-keyout',
      'localhost.key',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-sha256',
      '-subj',
      '/CN=localhost',
      '-extensions',
      'EXT',
      '-config',
      'certconf',
    ],
    { cwd: tmpdir },
  )

  return {
    cert: path.join(tmpdir, 'localhost.crt'),
    key: path.join(tmpdir, 'localhost.key'),
  }
}

describe.concurrent.each(testMatrix)('withSiteBuilder with args: $args', ({ args }) => {
  test('should handle query params in redirects', async (t) => {
    await withSiteBuilder(t, async (builder) => {
      await builder
        .withContentFile({
          path: 'public/index.html',
          content: 'home',
        })
        .withNetlifyToml({
          config: {
            build: { publish: 'public' },
            functions: { directory: 'functions' },
          },
        })
        .withRedirectsFile({
          redirects: [
            { from: '/api/*', to: '/.netlify/functions/echo?a=1&a=2', status: '200' },
            { from: '/foo', to: '/', status: '302' },
            { from: '/bar', to: '/?a=1&a=2', status: '302' },
            { from: '/test id=:id', to: '/?param=:id' },
            { from: '/baz/*', to: '/.netlify/functions/echo?query=:splat' },
          ],
        })
        .withFunction({
          path: 'echo.js',
          handler: (event: HandlerEvent) =>
            Promise.resolve({
              statusCode: 200,
              body: JSON.stringify(event),
            }),
        })
        .build()

      await withDevServer({ cwd: builder.directory, args }, async (server) => {
        const [fromFunction, queryPassthrough, queryInRedirect, withParamMatching, functionWithSplat] =
          await Promise.all([
            nodeFetch(`${server.url}/api/test?foo=1&foo=2&bar=1&bar=2`).then((res) => res.json()),
            nodeFetch(`${server.url}/foo?foo=1&foo=2&bar=1&bar=2`, { redirect: 'manual' }),
            nodeFetch(`${server.url}/bar?foo=1&foo=2&bar=1&bar=2`, { redirect: 'manual' }),
            nodeFetch(`${server.url}/test?id=1`, { redirect: 'manual' }),
            nodeFetch(`${server.url}/baz/abc`).then((res) => res.json()),
          ])

        // query params should be taken from redirect rule for functions
        t.expect(fromFunction).toHaveProperty('multiValueQueryStringParameters', { bar: ['1', '2'], foo: ['1', '2'] })

        // query params should be passed through from the request
        t.expect(queryPassthrough.headers.get('location')).toEqual('/?foo=1&foo=2&bar=1&bar=2')

        // query params should be taken from the redirect rule
        t.expect(queryInRedirect.headers.get('location')).toEqual('/?a=1&a=2')

        // query params should be taken from the redirect rule
        t.expect(withParamMatching.headers.get('location')).toEqual('/?param=1')

        // splat should be passed as query param in function redirects
        t.expect(functionWithSplat).toHaveProperty('queryStringParameters', { query: 'abc' })
      })
    })
  })

  test('Should not use the ZISI function bundler if not using esbuild', async (t) => {
    await withSiteBuilder(t, async (builder) => {
      builder
        .withNetlifyToml({ config: { functions: { directory: 'functions' } } })
        .withContentFile({
          path: path.join('functions', 'esm-function', 'package.json'),
          content: JSON.stringify({ type: 'commonjs' }),
        })
        .withContentFile({
          path: path.join('functions', 'esm-function', 'esm-function.js'),
          content: `
export async function handler(event, context) {
  return {
    statusCode: 200,
    body: 'esm',
  };
}
    `,
        })

      await builder.build()

      await withDevServer({ cwd: builder.directory, args }, async (server) => {
        const resp = await nodeFetch(`${server.url}/.netlify/functions/esm-function`)
        t.expect(await resp.text()).toContain(`SyntaxError: Unexpected token 'export'`)
      })
    })
  })

  test('Should use the ZISI function bundler and serve ESM functions if using esbuild', async (t) => {
    await withSiteBuilder(t, async (builder) => {
      builder
        .withNetlifyToml({ config: { functions: { directory: 'functions', node_bundler: 'esbuild' } } })
        .withContentFile({
          path: path.join('functions', 'esm-function', 'package.json'),
          content: JSON.stringify({ type: 'commonjs' }),
        })
        .withContentFile({
          path: path.join('functions', 'esm-function', 'esm-function.js'),
          content: `
export async function handler(event, context) {
  return {
    statusCode: 200,
    body: 'esm',
  };
}
    `,
        })

      await builder.build()

      await withDevServer({ cwd: builder.directory, args }, async (server) => {
        const response = await nodeFetch(`${server.url}/.netlify/functions/esm-function`).then((res) => res.text())
        t.expect(response).toEqual('esm')
      })
    })
  })

  test('Should use the ZISI function bundler and serve TypeScript functions if using esbuild', async (t) => {
    await withSiteBuilder(t, async (builder) => {
      builder
        .withNetlifyToml({ config: { functions: { directory: 'functions', node_bundler: 'esbuild' } } })
        .withContentFile({
          path: path.join('functions', 'ts-function', 'ts-function.ts'),
          content: `
type CustomResponse = string;

export const handler = async function () {
  const response: CustomResponse = "ts";

  return {
    statusCode: 200,
    body: response,
  };
};

    `,
        })

      await builder.build()

      await withDevServer({ cwd: builder.directory, args }, async (server) => {
        const response = await nodeFetch(`${server.url}/.netlify/functions/ts-function`).then((res) => res.text())
        t.expect(response).toEqual('ts')
      })
    })
  })

  test('Should use the ZISI function bundler and serve TypeScript functions if not using esbuild', async (t) => {
    await withSiteBuilder(t, async (builder) => {
      builder.withNetlifyToml({ config: { functions: { directory: 'functions' } } }).withContentFile({
        path: path.join('functions', 'ts-function', 'ts-function.ts'),
        content: `
type CustomResponse = string;

export const handler = async function () {
  const response: CustomResponse = "ts";

  return {
    statusCode: 200,
    body: response,
  };
};

    `,
      })

      await builder.build()

      await withDevServer({ cwd: builder.directory, args }, async (server) => {
        const response = await nodeFetch(`${server.url}/.netlify/functions/ts-function`).then((res) => res.text())
        t.expect(response).toEqual('ts')
      })
    })
  })

  test(`should start https server when https dev block is configured`, async (t) => {
    const { expect } = t

    await withSiteBuilder(t, async (builder) => {
      await builder
        .withNetlifyToml({
          config: {
            build: { publish: 'public' },
            functions: { directory: 'functions' },
            dev: { https: { certFile: 'localhost.crt', keyFile: 'localhost.key' } },
            edge_functions: [
              {
                function: 'hello',
                path: '/',
              },
            ],
          },
        })
        .withContentFile({
          path: 'public/index.html',
          content: 'index',
        })
        .withContentFile({
          path: 'public/origin.html',
          content: 'origin',
        })
        .withRedirectsFile({
          redirects: [{ from: `/api/*`, to: `/.netlify/functions/:splat`, status: '200' }],
        })
        .withFunction({
          path: 'hello.js',
          handler: async (event: HandlerEvent) =>
            Promise.resolve({
              statusCode: 200,
              body: JSON.stringify({ rawUrl: event.rawUrl, blobs: (event as typeof event & { blobs: unknown }).blobs }),
            }),
        })
        .withEdgeFunction({
          // @ts-expect-error Types on EdgeFunction are incorrect
          handler: async (req, { next }) => {
            if (req.url.includes('?ef=true')) {
              const res = await next()
              const text = await res.text()

              return new Response(text.toUpperCase(), res)
            }

            if (req.url.includes('?ef=fetch')) {
              const url = new URL('/origin', req.url)

              return await fetch(url)
            }

            if (req.url.includes('?ef=url')) {
              return new Response(req.url)
            }
          },
          name: 'hello',
        })
        .build()

      const certificatePaths = await generateSSLCertificate()
      await Promise.all([
        fs.copyFile(certificatePaths.cert, path.join(builder.directory, 'localhost.crt')),
        fs.copyFile(certificatePaths.key, path.join(builder.directory, 'localhost.key')),
      ])
      await withDevServer({ cwd: builder.directory, args }, async ({ port }) => {
        const options = {
          agent: new Agent({ rejectUnauthorized: false }),
        }

        expect(await nodeFetch(`https://localhost:${port.toString()}`, options).then((res) => res.text())).toEqual(
          'index',
        )
        expect(
          await nodeFetch(`https://localhost:${port.toString()}?ef=true`, options).then((res) => res.text()),
        ).toEqual('INDEX')
        expect(
          await nodeFetch(`https://localhost:${port.toString()}?ef=fetch`, options).then((res) => res.text()),
        ).toEqual('origin')

        const hello = await nodeFetch(`https://localhost:${port.toString()}/api/hello`, options).then((res) =>
          res.json(),
        )

        expect(hello).toHaveProperty('rawUrl', `https://localhost:${port.toString()}/api/hello`)

        const blobsContext = JSON.parse(Buffer.from((hello as { blobs: any }).blobs, 'base64').toString())

        expect(blobsContext).toHaveProperty('url')
        expect(blobsContext).toHaveProperty('token')

        // the fetch will go against the `https://` url of the dev server, which isn't trusted system-wide.
        // this is the expected behaviour for fetch, so we shouldn't change anything about it.
        expect(
          await nodeFetch(`https://localhost:${port.toString()}?ef=fetch`, options).then((res) => res.text()),
        ).toEqual('origin')
      })
    })
  })

  test(`should use custom functions timeouts`, async (t) => {
    await withSiteBuilder(t, async (builder) => {
      await builder
        .withNetlifyToml({
          config: {
            build: { publish: 'public' },
            functions: { directory: 'functions' },
          },
        })
        .withFunction({
          path: 'hello.js',
          handler: async () => {
            await new Promise((resolve) => {
              const SLEEP_TIME = 2000
              setTimeout(resolve, SLEEP_TIME)
            })
            return {
              statusCode: 200,
              body: 'Hello World',
            }
          },
        })
        .build()

      const siteInfo = {
        account_slug: 'test-account',
        id: 'site_id',
        name: 'site-name',
        functions_config: { timeout: 1 },
      }

      const routes = [
        { path: 'sites/site_id', response: siteInfo },

        { path: 'sites/site_id/service-instances', response: [] },
        {
          path: 'accounts',
          response: [{ slug: siteInfo.account_slug }],
        },
      ]

      await withMockApi(routes, async ({ apiUrl }) => {
        await withDevServer(
          {
            cwd: builder.directory,
            offline: false,
            env: {
              NETLIFY_API_URL: apiUrl,
              NETLIFY_SITE_ID: 'site_id',
              NETLIFY_AUTH_TOKEN: 'fake-token',
            },
          },
          async ({ url }) => {
            const error = await nodeFetch(`${url}/.netlify/functions/hello`).then((res) => res.text())
            t.expect(error.includes('TimeoutError: Task timed out after 1.00 seconds')).toBe(true)
          },
        )
      })
    })
  })

  // we need curl to reproduce this issue
  test.skipIf(os.platform() === 'win32')(`don't hang on 'Expect: 100-continue' header`, async (t) => {
    await withSiteBuilder(t, async (builder) => {
      await builder
        .withNetlifyToml({
          config: {
            functions: { directory: 'functions' },
          },
        })
        .withFunction({
          path: 'hello.js',
          handler: async () => Promise.resolve({ statusCode: 200, body: 'Hello' }),
        })
        .build()

      await withDevServer({ cwd: builder.directory, args }, async (server) => {
        await t
          .expect(
            curl(`${server.url}/.netlify/functions/hello`, [
              '-i',
              '-v',
              '-d',
              '{"somefield":"somevalue"}',
              '-H',
              'Content-Type: application/json',
              '-H',
              `Expect: 100-continue' header`,
            ]),
          )
          .resolves.not.toThrowError()
      })
    })
  })

  test(`serves non ascii static files correctly`, async (t) => {
    await withSiteBuilder(t, async (builder) => {
      await builder
        .withContentFile({
          path: 'public/范.txt',
          content: 'success',
        })
        .withNetlifyToml({
          config: {
            build: { publish: 'public' },
            redirects: [{ from: '/*', to: '/index.html', status: 200 }],
          },
        })
        .build()

      await withDevServer({ cwd: builder.directory, args }, async (server) => {
        const response = await nodeFetch(`${server.url}/${encodeURIComponent('范.txt')}`)
        t.expect(await response.text()).toEqual('success')
      })
    })
  })

  test(`returns headers set by function`, async (t) => {
    await withSiteBuilder(t, async (builder) => {
      await builder
        .withFunction({
          pathPrefix: 'netlify/functions',
          path: 'custom-headers.js',
          handler: async () =>
            Promise.resolve({
              statusCode: 200,
              body: '',
              headers: { 'single-value-header': 'custom-value' },
              multiValueHeaders: { 'multi-value-header': ['custom-value1', 'custom-value2'] },
              metadata: { builder_function: true },
            }),
        })
        .build()

      await withDevServer({ cwd: builder.directory, args }, async (server) => {
        const response = await nodeFetch(`${server.url}/.netlify/functions/custom-headers`)
        t.expect(response.headers.get('etag')).toBeFalsy()
        t.expect(response.headers.get('single-value-header')).toEqual('custom-value')
        t.expect(response.headers.get('multi-value-header')).toEqual('custom-value1, custom-value2')

        const builderResponse = await nodeFetch(`${server.url}/.netlify/builders/custom-headers`)
        t.expect(builderResponse.headers.get('etag')).toBeFalsy()
        t.expect(builderResponse.headers.get('single-value-header')).toEqual('custom-value')
        t.expect(builderResponse.headers.get('multi-value-header')).toEqual('custom-value1, custom-value2')
      })
    })
  })

  test('should match redirect when path is URL encoded', async (t) => {
    await withSiteBuilder(t, async (builder) => {
      await builder
        .withContentFile({ path: 'static/special[test].txt', content: `special` })
        .withRedirectsFile({ redirects: [{ from: '/_next/static/*', to: '/static/:splat', status: 200 }] })
        .build()

      await withDevServer({ cwd: builder.directory, args }, async (server) => {
        const [response1, response2] = await Promise.all([
          nodeFetch(`${server.url}/_next/static/special[test].txt`).then((res) => res.text()),
          nodeFetch(`${server.url}/_next/static/special%5Btest%5D.txt`).then((res) => res.text()),
        ])
        t.expect(response1).toEqual('special')
        t.expect(response2).toEqual('special')
      })
    })
  })

  test(`should not redirect POST request to functions server when it doesn't exists`, async (t) => {
    await withSiteBuilder(t, async (builder) => {
      await builder.build()

      await withDevServer({ cwd: builder.directory, args }, async (server) => {
        // an error is expected since we're sending a POST request to a static server
        // the important thing is that it's not proxied to the functions server
        const error = await nodeFetch(`${server.url}/api/test`, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: 'some=thing',
        })

        t.expect(error.status).toBe(405)
        t.expect(await error.text()).toEqual('Method Not Allowed')
      })
    })
  })
})
