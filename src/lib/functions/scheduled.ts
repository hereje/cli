import type { IncomingHttpHeaders } from 'node:http'

import AnsiToHtml from 'ansi-to-html'
import express from 'express'
import type { LambdaEvent } from 'lambda-local'

import { CLOCKWORK_USERAGENT } from '../../utils/functions/index.js'

import { formatLambdaError } from './utils.js'
import type { InvocationError } from './netlify-function.js'

const ansiToHtml = new AnsiToHtml()

export const buildHelpResponse = ({
  error,
  headers,
  path,
  result,
}: {
  error: null | Error | InvocationError
  headers: IncomingHttpHeaders
  path: string
  result: null | LambdaEvent
}): { contentType: string; message: string; statusCode: number } => {
  const acceptsHtml = headers.accept?.includes('text/html') ?? false

  const paragraph = (text: string) => {
    text = text.trim()

    if (acceptsHtml) {
      return ansiToHtml.toHtml(`<p>${text}</p>`)
    }

    text = text
      .replace(/<pre><code>/gm, '```\n')
      .replace(/<\/code><\/pre>/gm, '\n```')
      .replace(/<code>/gm, '`')
      .replace(/<\/code>/gm, '`')

    return `${text}\n\n`
  }

  const isSimulatedRequest = headers['user-agent'] === CLOCKWORK_USERAGENT

  let message = ''

  if (!isSimulatedRequest) {
    message += paragraph(`
You performed an HTTP request to <code>${path}</code>, which is a scheduled function.
You can do this to test your functions locally, but it won't work in production.
    `)
  }

  if (error) {
    message += paragraph(`
There was an error during execution of your scheduled function:

<pre><code>${formatLambdaError(error)}</code></pre>`)
  }

  if (result) {
    // lambda emulator adds level field, which isn't user-provided
    const { level, ...returnValue } = { ...result }

    const { statusCode } = returnValue
    if (statusCode != null && statusCode >= 500) {
      message += paragraph(`
Your function returned a status code of <code>${statusCode.toString()}</code>.
At the moment, Netlify does nothing about that. In the future, there might be a retry mechanism based on this.
`)
    }

    const allowedKeys = new Set(['statusCode'])
    const returnedKeys = Object.keys(returnValue)
    const ignoredKeys = returnedKeys.filter((key) => !allowedKeys.has(key))

    if (ignoredKeys.length !== 0) {
      message += paragraph(
        `Your function returned ${ignoredKeys
          .map((key) => `<code>${key}</code>`)
          .join(', ')}. Is this an accident? It won't be interpreted by Netlify.`,
      )
    }
  }

  const statusCode = error ? 500 : 200
  return acceptsHtml
    ? {
        statusCode,
        contentType: 'text/html',
        message: `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/water.css@2/out/water.css">\n
                ${message}`,
      }
    : {
        statusCode,
        contentType: 'text/plain',
        message,
      }
}

export const handleScheduledFunction = ({
  error,
  request,
  response,
  result,
}: {
  error: null | Error | InvocationError
  request: express.Request
  response: express.Response
  result: null | LambdaEvent
}): void => {
  const { contentType, message, statusCode } = buildHelpResponse({
    error,
    headers: request.headers,
    path: request.path,
    result,
  })

  response.status(statusCode)
  response.set('Content-Type', contentType)
  response.send(message)
}
