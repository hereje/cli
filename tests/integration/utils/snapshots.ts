const baseNormalizers: Normalizer[] = [
  // Information about the package and the OS
  { pattern: /netlify-cli\/.+node-.+/g, value: 'netlify-cli/test-version test-os test-node-version' },
  { pattern: /@netlify\/build (\d+\.\d+\.\d+)/g, value: '@netlify/build 0.0.0' },
  // windows specific
  { pattern: /\\/gu, value: '/' },
  { pattern: /\r\n/gu, value: '\n' },
  { pattern: /❯/gu, value: '>' },
  { pattern: /»/gu, value: '›' },
  // normalize exit code from different OSes
  { pattern: /code \d+/, value: 'code *' },
  // this is specific to npm v6
  { pattern: /@ (\w+).+\/.+netlify-cli-tests-v[\d{2}].+/, value: '$1' },
  { pattern: /It should be one of.+/gm, value: 'It should be one of: *' },
]

type Normalizer = { pattern: RegExp; value: string }

const optionalNormalizers: Record<string, Normalizer> = {
  // File paths
  filePath: { pattern: /(^|[ "'(=])((?:\.{0,2}|([A-Z]:)|file:\/\/)(\/[^ "')\n]+))/gm, value: '/file/path' },

  // Durations
  duration: { pattern: /(\d[\d.]*(ms|m|s)( )?)+/g, value: 'Xms' },
}

export const normalize = (
  inputString: string,
  { duration, filePath }: { duration?: boolean | undefined; filePath?: boolean | undefined } = {},
) =>
  [
    ...baseNormalizers,
    duration ? optionalNormalizers.duration : undefined,
    filePath ? optionalNormalizers.filePath : undefined,
  ]
    .filter((normalizer) => normalizer !== undefined)
    .reduce((acc, { pattern, value }) => acc.replace(pattern, value), inputString)
    .trim()
