#!/usr/bin/env node

const { spawnChrome } = require('chrome-debugging-client')

const { ArgumentParser } = require('argparse')
const { version } = require('./package.json')

const fs = require('fs')
const os = require('os')
const path = require('path')
// eslint-disable-next-line
const { trace } = require('./utils')
const { compile } = require('./compiler')
const { error } = require('./utils')
const { enableVerbose } = require('./utils')
const express = require('express')

async function main () {
  const parser = createArgParser()
  const argv = parser.parse_args()

  if (argv.verbose) {
    enableVerbose()
  }

  const config = {
    depFile: argv.depFile,
    jobCount: argv.jobcount,
    jobTimeout: argv.jobtimeout * 1000,
    copyResources: !argv.skipResources,
    paths: argv.entryPoints,
    input: path.resolve(argv.input),
    output: path.resolve(argv.output)
  }

  if (!fs.existsSync(config.output)) {
    fs.mkdirSync(config.output)
  }
  if (!fs.lstatSync(config.output).isDirectory()) {
    parser.print_help()
    process.exit(1)
  }
  if (config.input === config.output) {
    error('"input" and "output" must be different directories')
    process.exit(1)
  }
  if (argv.entryPoints.length === 0) {
    error('Must provide at least one entry point')
    process.exit(1)
  }

  const app = express()
  app.use(express.static(config.input))
  const server = app.listen(0)
  config.port = server.address().port

  try {
    const chrome = spawnChrome({
      headless: argv.headless
    })
    const browser = chrome.connection

    await compile(config, browser)

    await chrome.dispose()
  } catch (e) {
    console.log(e)
  }
  await server.close()
}

function createArgParser () {
  const parser = new ArgumentParser({
    description: 'A static site generator without a templating language'
  })

  parser.add_argument('-v', '--version', { action: 'version', version })
  parser.add_argument('--input', {
    required: true,
    metavar: 'INPUT_DIRECTORY',
    help: 'Input website root directory'
  })
  parser.add_argument('--output', {
    required: true,
    metavar: 'OUTPUT_DIRECTORY',
    help: 'Output directory'
  })
  parser.add_argument('--entry', {
    action: 'append',
    dest: 'entryPoints',
    help: 'Add an HTML file to be used as entry point, paths must be relative to the website root, can be used multiple times, must provide at least one entry point',
    default: []
  })
  parser.add_argument('--skip-resources', {
    action: 'store_true',
    dest: 'skipResources',
    help: 'Do not copy resources to the output directory'
  })
  parser.add_argument('--jobcount', {
    help: 'Number of compilation jobs to run in parallel',
    type: 'int',
    default: Math.floor(os.cpus().length * 1.5)
  })
  parser.add_argument('--jobtimeout', {
    help: 'Time in milliseconds for which the compiler will wait for the pages to render',
    type: 'int',
    default: 10
  })
  parser.add_argument('--depfile', {
    help: 'A JSON object containing the command line arguments, file dependency, compilation results will be written to this path'
  })
  parser.add_argument('--headless', {
    action: 'store_true',
    help: 'Run chrome in headless mode, can be used for running in environments without display server'
  })
  parser.add_argument('--verbose', {
    action: 'store_true',
    help: 'Enable verbose logging'
  })

  return parser
}

main()
  .then(() => process.exit(0))
