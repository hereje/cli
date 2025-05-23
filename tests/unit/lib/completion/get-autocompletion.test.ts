import { expect, describe, test } from 'vitest'

import getAutocompletion from '../../../../src/lib/completion/get-autocompletion.js'

const cookingFixtures = {
  cook: {
    name: 'cook',
    description: 'cooking',
    options: [],
  },
  bake: {
    name: 'bake',
    description: 'baking',
    options: [
      { name: '--heat', description: 'heated' },
      { name: '--duration', description: 'duration' },
      { name: '--heat-type', description: 'type' },
    ],
  },
}

describe('getAutocompletion', () => {
  test('should not autocomplete anything when completion is turned off', () => {
    // @ts-expect-error FIXME(ndhoule): Breaks type safety, I don't think this is a realistic scenario?
    expect(getAutocompletion({}, cookingFixtures)).toBeUndefined()
    // @ts-expect-error FIXME(ndhoule): Breaks type safety, I don't think this is a realistic scenario?
    expect(getAutocompletion({ complete: false }, cookingFixtures)).toBeUndefined()
    // @ts-expect-error FIXME(ndhoule): Breaks type safety, I don't think this is a realistic scenario?
    expect(getAutocompletion({ complete: false, words: 2 }, cookingFixtures)).toBeUndefined()
  })

  test('should get the correct autocompletion for the base command', () => {
    const completion = getAutocompletion({ complete: true, words: 1, lastPartial: '', line: '' }, cookingFixtures)
    expect(completion).toEqual([
      { name: 'cook', description: 'cooking' },
      { name: 'bake', description: 'baking' },
    ])
  })

  test('should get the correct autocompletion for the base command if there is already a word', () => {
    const completion = getAutocompletion({ complete: true, words: 1, lastPartial: 'ba', line: 'ba' }, cookingFixtures)
    expect(completion).toEqual([{ name: 'bake', description: 'baking' }])
  })

  test('should get no flags if the command has no flags', () => {
    const completion = getAutocompletion(
      { complete: true, words: 2, lastPartial: '', line: 'netlify cook' },
      cookingFixtures,
    )
    expect(completion).toEqual([])
  })

  test('should get the correct flags for the command', () => {
    const completion = getAutocompletion(
      { complete: true, words: 2, lastPartial: '', line: 'netlify bake' },
      cookingFixtures,
    )
    expect(completion).toEqual(cookingFixtures.bake.options)
  })

  test('should get the correct left over flags for the command', () => {
    const completion = getAutocompletion(
      { complete: true, words: 3, lastPartial: '', line: 'netlify bake --heat' },
      cookingFixtures,
    )
    expect(completion).toEqual([
      { name: '--duration', description: 'duration' },
      { name: '--heat-type', description: 'type' },
    ])
  })

  test('should get no results if the command has no left over flags anymore', () => {
    const completion = getAutocompletion(
      { complete: true, words: 4, lastPartial: '', line: 'netlify bake --heat --heat-type --duration' },
      cookingFixtures,
    )
    expect(completion).toEqual([])
  })

  test('should autocomplete flags', () => {
    const completion = getAutocompletion(
      { complete: true, words: 4, lastPartial: '--hea', line: 'netlify bake --heat --hea' },
      cookingFixtures,
    )
    expect(completion).toEqual([{ name: '--heat-type', description: 'type' }])
  })
})
