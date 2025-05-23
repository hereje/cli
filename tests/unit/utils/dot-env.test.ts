import process from 'process'

import { expect, test } from 'vitest'

import { tryLoadDotEnvFiles } from '../../../src/utils/dot-env.js'
import { withSiteBuilder } from '../../integration/utils/site-builder.js'

test('should return an empty array for a site with no .env file', async (t) => {
  await withSiteBuilder(t, async (builder) => {
    await builder.build()

    const results = await tryLoadDotEnvFiles({ projectDir: builder.directory })
    expect(results).toEqual([])
  })
})

test('should read env vars from .env file', async (t) => {
  process.env.NODE_ENV = 'development'
  await withSiteBuilder(t, async (builder) => {
    builder.withEnvFile({
      path: '.env',
      env: { TEST: 'FROM_ENV' },
    })
    await builder.build()

    const results = await tryLoadDotEnvFiles({ projectDir: builder.directory })
    expect(results).toEqual([{ file: '.env', env: { TEST: 'FROM_ENV' } }])
  })
})

test('should read env vars from .env.development file', async (t) => {
  process.env.NODE_ENV = 'development'
  await withSiteBuilder(t, async (builder) => {
    builder.withEnvFile({
      path: '.env.development',
      env: { TEST: 'FROM_DEVELOPMENT_ENV' },
    })
    await builder.build()

    const results = await tryLoadDotEnvFiles({ projectDir: builder.directory })
    expect(results).toEqual([{ file: '.env.development', env: { TEST: 'FROM_DEVELOPMENT_ENV' } }])
  })
})

test('should read env vars from .env.local file', async (t) => {
  process.env.NODE_ENV = 'development'
  await withSiteBuilder(t, async (builder) => {
    builder.withEnvFile({
      path: '.env.local',
      env: { TEST: 'FROM_LOCAL_ENV' },
    })
    await builder.build()

    const results = await tryLoadDotEnvFiles({ projectDir: builder.directory })
    expect(results).toEqual([{ file: '.env.local', env: { TEST: 'FROM_LOCAL_ENV' } }])
  })
})

test('should read env vars from .env.development.local file', async (t) => {
  process.env.NODE_ENV = 'development'
  await withSiteBuilder(t, async (builder) => {
    builder.withEnvFile({
      path: '.env.development.local',
      env: { TEST: 'FROM_LOCAL_DEVELOPMENT_ENV' },
    })
    await builder.build()

    const results = await tryLoadDotEnvFiles({ projectDir: builder.directory })
    expect(results).toEqual([{ file: '.env.development.local', env: { TEST: 'FROM_LOCAL_DEVELOPMENT_ENV' } }])
  })
})

test('should read env vars from all four .env[.development][.local] files', async (t) => {
  process.env.NODE_ENV = 'development'
  await withSiteBuilder(t, async (builder) => {
    builder
      .withEnvFile({
        path: '.env',
        env: { ONE: 'FROM_ENV', TWO: 'FROM_ENV' },
      })
      .withEnvFile({
        path: '.env.development',
        env: { ONE: 'FROM_DEVELOPMENT_ENV', THREE: 'FROM_DEVELOPMENT_ENV' },
      })
      .withEnvFile({
        path: '.env.local',
        env: { ONE: 'FROM_LOCAL_ENV', FOUR: 'FROM_LOCAL_ENV' },
      })
      .withEnvFile({
        path: '.env.development.local',
        env: { ONE: 'FROM_LOCAL_DEVELOPMENT_ENV', FIVE: 'FROM_LOCAL_DEVELOPMENT_ENV' },
      })
    await builder.build()

    const results = await tryLoadDotEnvFiles({ projectDir: builder.directory })
    expect(results).toEqual([
      { file: '.env', env: { ONE: 'FROM_ENV', TWO: 'FROM_ENV' } },
      { file: '.env.development', env: { ONE: 'FROM_DEVELOPMENT_ENV', THREE: 'FROM_DEVELOPMENT_ENV' } },
      { file: '.env.local', env: { ONE: 'FROM_LOCAL_ENV', FOUR: 'FROM_LOCAL_ENV' } },
      {
        file: '.env.development.local',
        env: { ONE: 'FROM_LOCAL_DEVELOPMENT_ENV', FIVE: 'FROM_LOCAL_DEVELOPMENT_ENV' },
      },
    ])
  })
})

test('should handle empty .env file', async (t) => {
  await withSiteBuilder(t, async (builder) => {
    builder.withEnvFile({
      path: '.env',
    })

    await builder.build()

    const results = await tryLoadDotEnvFiles({ projectDir: builder.directory })
    expect(results).toEqual([{ file: '.env', env: {} }])
  })
})
