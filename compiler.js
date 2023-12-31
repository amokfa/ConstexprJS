const urljoin = require('url-join')
const fs = require('fs').promises
const path = require('path')
const hp = require('node-html-parser')
const injections = require('./injections')
const { fileExists, clog, log, warn, error, align, randomColor } = require('./utils')
const _ = require('lodash')
const formatHtml = require('js-beautify').html
// eslint-disable-next-line
const { trace, thread } = require('./utils')

async function compileFile (browser, httpBase, jobTimeout, generator, output, idx) {
  const { targetId } = await browser.send('Target.createTarget', {
    url: 'about:blank'
  })
  const page = await browser.attachToTarget(targetId)
  await page.send('Page.enable')
  await page.send('Network.enable')
  await page.send('Runtime.enable')
  await page.send('Network.clearBrowserCache')

  const killSwitches = [
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
      value: result
    }
  } = await page.send('Runtime.evaluate', {
    expression: injections.compileFinishHooks.replace('$[jobTimeout]', jobTimeout),
    awaitPromise: true,
    returnByValue: true
  })
  result.idx = idx
  result.output = output
  result.generator = generator

  if (result.status === 'abort' || result.status === 'timeout') {
    return result
  }

  result.addedPaths.forEach(p => log(`${generator} added extra path ${p.output} to be generated using ${p.generator}`))

  const html = (await page.send('DOM.getOuterHTML', {
    nodeId: (await page.send('DOM.getDocument')).root.nodeId
  })).outerHTML
  await browser.send('Target.closeTarget', { targetId })
  await Promise.all(killSwitches.map(s => s()))

  const finalDeps = result.deducedDependencies
    .filter(e => e.startsWith(httpBase))
    .map(e => e.replace(httpBase, ''))
  finalDeps.push(...result.addedDependencies)
  finalDeps.sort()

  return _.assign(result, {
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
  let next = 0
  let done = 0
  while (true) {
    const tasks = Object.values(taskQueue)
    if (next === entryPoints.length && tasks.length === 0) {
      break
    }
    if (tasks.length < config.jobCount && next < entryPoints.length) {
      const col = COLORS[next]
      taskQueue[next] = compileFile(browser, `http://localhost:${config.port}`, config.jobTimeout, entryPoints[next].generator, entryPoints[next].output, next)
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

      if (result.status === 'abort') {
        warn(align(`Page ${result.generator} signalled an abortion, message:`), `"${result.message}"`)
      } else if (result.status === 'timeout') {
        error(align('Timeout reached when processing file:'), `${result.generator}`)
      }

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
  return formatHtml(
    root.toString(),
    {
      unformatted: ['style', 'prog'],
      preserve_newlines: false
    }
  )
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
        await fs.rm(out, { recursive: true })
      }
      const dir = path.dirname(out)
      await fs.mkdir(dir, { recursive: true })
      try {
        await fs.cp(inp, out, { recursive: true })
      } catch (e) {
        console.log(e)
        warn(align('Couldn\'t copy file:'), `${inp}`)
      }
    }
  }
}

module.exports = {
  compile,
  compileFile
}
