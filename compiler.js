const formatHtml = s => s
const urljoin = require('url-join')
const fs = require('fs').promises
const path = require('path')
const hp = require('node-html-parser')
const { logLine } = require('./utils')
const injections = require('./injections')
const { fileExists, clog, log, warn, error, align, randomColor } = require('./utils')
const _ = require('lodash')
const chalk = require('chalk')
// eslint-disable-next-line
const { trace, thread } = require('./utils')

async function compileFile (page, httpBase, jobTimeout, generator, output, idx) {
  await page.send('Page.enable')
  await page.send('Network.enable')
  await page.send('Runtime.enable')

  const deps = []
  const killSwitches = [
    thread(async () => {
      const { request: { url } } = await page.until('Network.requestWillBeSent')
      deps.push(url)
    }),
    thread(async () => {
      const resp = await page.until('Runtime.consoleAPICalled')
      console[resp.type].apply(null, _.concat(generator, ':', resp.args.map((e) => e.value)))
    }),
    thread(async () => {
      const resp = await page.until('Runtime.exceptionThrown')
      resp.exceptionDetails.exception.description.split('\n')
        .forEach((l) => console.log(generator, ':', l))
    })
  ]

  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: injections.newPageScript
  })

  await page.send('Page.navigate', {
    url: urljoin(httpBase, generator)
  })

  const {
    result: {
      value: {
        status,
        message,
        deducedExclusions: _deducedExclusions,
        addedExclusions,
        addedDependencies,
        addedPaths,
        logs
      }
    }
  } = await page.send('Runtime.evaluate', {
    expression: injections.compileFinishHooks.replace('$[jobTimeout]', jobTimeout),
    awaitPromise: true,
    returnByValue: true
  })

  const result = {
    generator,
    output,
    logs,
    idx
  }

  if (status === 'abort') {
    return _.assign(result, {
      status: 'abortion',
      message
    })
  } else if (status === 'timeout') {
    return _.assign(result, {
      status: 'timeout'
    })
  }

  const deducedExclusions = _deducedExclusions.filter(e => e.startsWith(httpBase)).map(e => e.replace(httpBase, ''))

  _.assign(result, {
    addedPaths,
    addedExclusions,
    addedDependencies,
    deducedExclusions
  })

  addedPaths.forEach(p => log(`${generator} added extra path ${p.output} to be generated using ${p.generator}`))

  const html = formatHtml(
    (await page.send('DOM.getOuterHTML', {
      nodeId: (await page.send('DOM.getDocument')).root.nodeId
    })).outerHTML,
    {
      lineSeparator: '\n'
    }
  )
  killSwitches.forEach((s) => s())
  const constexprResources = [...deducedExclusions]
  constexprResources.push(...addedExclusions)

  const finalDeps = deps
    .filter(e => !constexprResources.some(ex => urljoin(httpBase, ex) === e))
    .filter(e => e.startsWith(httpBase))
    .map(e => e.replace(httpBase, ''))
    .filter(e => !e.endsWith(generator))
  finalDeps.push(...addedDependencies)

  return _.assign(result, {
    status: 'ok',
    html,
    deps: finalDeps
  })
}

const { range } = require('lodash')

async function compilePaths (config, browser) {
  const entryPoints = config.paths.map(p => ({ generator: p, output: p }))
  const COLORS = range(entryPoints.length).map((i) => randomColor(i))

  const allResults = []
  const results = []
  const linkMapping = {}
  const taskQueue = {}
  const targetIds = {}
  let next = 0
  let done = 0
  while (true) {
    const tasks = Object.values(taskQueue)
    if (next === entryPoints.length && tasks.length === 0) {
      break
    }
    if (tasks.length < config.jobCount && next < entryPoints.length) {
      const col = COLORS[next]
      const { targetId } = await browser.send('Target.createTarget', {
        url: 'about:blank'
      })
      targetIds[next] = targetId
      taskQueue[next] = compileFile(await browser.attachToTarget(targetId), `http://localhost:${config.port}`, config.jobTimeout, entryPoints[next].generator, entryPoints[next].output, next)
      next++
      clog(col, align(`Queued file #${next}:`), `${entryPoints[next - 1].output}`)
    } else {
      let result
      try {
        result = await Promise.race(tasks)
      } catch (e) {
        console.log(e)
        error('Unrecoverable error, aborting')
        process.exit(1)
      }

      result.logs.forEach((msg) => logLine(chalk.hex(COLORS[result.idx]), `${result.generator}: ${msg}`))
      if (result.status === 'abort') {
        warn(align(`Page ${result.generator} signalled an abortion, message:`), `"${result.message}"`)
      } else if (result.status === 'timeout') {
        error(align('Timeout reached when processing file:'), `${result.generator}`)
      }

      await browser.send('Target.closeTarget', { targetId: targetIds[result.idx] })
      allResults.push(result)
      done++
      delete taskQueue[result.idx]
      if (result.status === 'ok') {
        result.addedPaths.forEach(
          p => {
            entryPoints.push(p)
            COLORS.push(randomColor(entryPoints.length))
            if (p.generator !== p.output) {
              if (linkMapping[p.generator]) {
                warn(`Output paths: "${linkMapping[p.generator]}" and "${p.output}" both use the same generator call: "${p.generator}"`)
              } else {
                linkMapping[p.generator] = p.output
              }
            }
          }
        )
        clog(COLORS[result.idx], align(`(${done}/${entryPoints.length}) Finished:`), `${result.generator}`)
        results.push(result)
      }
    }
  }
  try {
    if (config.depFile) {
      await fs.writeFile(config.depFile, JSON.stringify(
        {
          commandLine: process.argv,
          allResults: allResults.map(res => _.omit(res, 'html'))
        },
        null,
        4
      ))
      warn(align('Wrote depfile:'), config.depFile)
    }
  } catch (e) {
    error(align('Encountered error when writing depfile:'), e.message)
  }
  return {
    results,
    linkMapping
  }
}

function mapLinks (html, linkMapping) {
  const root = hp.parse(html)
  root.querySelectorAll('a')
    .filter(a => linkMapping[a.getAttribute('href')])
    .forEach(a => a.setAttribute('href', linkMapping[a.getAttribute('href')]))
  return root.toString()
}

async function compile (config, browser) {
  const { results, linkMapping } = await compilePaths(config, browser)
  const allDepsSet = new Set()
  results.forEach(res => {
    res.deps.forEach(d => allDepsSet.add(d))
    delete res.deps
  })
  const allDeps = [...allDepsSet]
  const allFilesToCopy = allDeps.map(dep => path.join(config.input, dep))

  const htmls = {}
  for (let i = 0; i < results.length; i++) {
    htmls[path.join(config.input, results[i].output)] = mapLinks(results[i].html, linkMapping)
  }

  for (const p of Object.keys(htmls)) {
    const out = p.replace(config.input, config.output)
    const dir = path.dirname(out)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(out, htmls[p])
  }
  if (config.copyResources) {
    for (const inp of allFilesToCopy) {
      log(align('Copying resource:'), `${inp}`)
      const out = inp.replace(config.input, config.output)
      if (await fileExists(out)) {
        continue
      }
      const dir = path.dirname(out)
      await fs.mkdir(dir, { recursive: true })
      try {
        await fs.copyFile(inp, out)
      } catch (e) {
        warn(align('Couldn\'t copy file:'), `${inp}`)
      }
    }
  }
}

module.exports = {
  compile,
  compileFile
}
