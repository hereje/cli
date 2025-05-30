import { OptionValues } from 'commander'
import inquirer from 'inquirer'
import parseGitHubUrl from 'parse-github-url'

import { log } from '../command-helpers.js'
import { Template, GitHubRepo } from '../types.js'

import { getTemplatesFromGitHub } from './utils.js'

export const fetchTemplates = async (token: string): Promise<Template[]> => {
  const templatesFromGitHubOrg: GitHubRepo[] = await getTemplatesFromGitHub(token)

  return (
    templatesFromGitHubOrg
      // adding this filter because the react-based-templates has multiple templates in one repo so doesn't work for this command
      .filter((repo: GitHubRepo) => !repo.archived && !repo.disabled && repo.name !== 'react-based-templates')
      .map((template: GitHubRepo) => ({
        name: template.name,
        sourceCodeUrl: template.html_url,
        slug: template.full_name,
      }))
  )
}

export const getTemplateName = async ({
  ghToken,
  options,
  repository,
}: {
  ghToken: string
  options: OptionValues
  repository: string
}) => {
  if (repository) {
    const parsedUrl = parseGitHubUrl(repository)
    return parsedUrl?.repo || `netlify-templates/${repository}`
  }

  if (options.url) {
    const urlFromOptions = new URL(options.url)
    return urlFromOptions.pathname.slice(1)
  }

  const templates = await fetchTemplates(ghToken)

  log(`Choose one of our starter templates. Netlify will create a new repo for this template in your GitHub account.`)

  const { templateName } = await inquirer.prompt([
    {
      type: 'list',
      name: 'templateName',
      message: 'Template:',
      choices: templates.map((template) => ({
        value: template.slug,
        name: template.name,
      })),
    },
  ])

  return templateName
}

export const deployedSiteExists = async (name: string): Promise<boolean> => {
  const resp = await fetch(`https://${name}.netlify.app`, {
    method: 'GET',
  })

  return resp.status === 200
}

export const getGitHubLink = ({ options, templateName }: { options: OptionValues; templateName: string }): string =>
  (options.url as string | undefined) || `https://github.com/${templateName}`
