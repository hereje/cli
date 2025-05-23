import { OptionValues } from 'commander'

import BaseCommand from '../base-command.js'

export const createCompletionCommand = (program: BaseCommand) => {
  program
    .command('completion:install')
    .alias('completion:generate')
    .description('Generates completion script for your preferred shell')
    .action(async (options: OptionValues, command: BaseCommand) => {
      const { completionGenerate } = await import('./completion.js')
      await completionGenerate(options, command)
    })

  program
    .command('completion:uninstall', { hidden: true })
    .alias('completion:remove')
    .description('Uninstalls the installed completions')
    .addExamples(['netlify completion:uninstall'])
    .action(async (options: OptionValues, command: BaseCommand) => {
      const { completionUninstall } = await import('./completion.js')
      await completionUninstall(options, command)
    })

  return program
    .command('completion')
    .description('Generate shell completion script\nRun this command to see instructions for your shell.')
    .addExamples(['netlify completion:install'])
    .action((_options: OptionValues, command: BaseCommand) => {
      command.help()
    })
}
