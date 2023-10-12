const formatHtml = s => s
const urljoin = require('url-join')
const fs = require("fs").promises
const path = require("path")
const hp = require('node-html-parser')
const {logLine} = require("./utils")
const injections = require('./injections')
const {fileExists, clog, log, warn, error, align, randomColor} = require("./utils")
const _ = require('lodash')
const chalk = require("chalk");
const {trace} = require("./utils");

let jobsCount = 5
let jobTimeout = 999999999

async function addDeps(page, deps, logFlag) {
  while (logFlag.value) {
    try {
      const {request: {url}} = await page.until('Network.requestWillBeSent')
      deps.push(url)
    } catch (e) {
      return
    }
  }
}
async function printLogs(page, generator, logFlag) {
  while (logFlag.value) {
    try {
      const resp = await page.until('Runtime.consoleAPICalled')
      console[resp.type].apply(null, _.concat(generator, ":", resp.args.map((e) => e.value)))
    } catch (e) {
      return
    }
  }
}

async function printExceptions(page, generator, logFlag) {
  while (logFlag.value) {
    try {
      const resp = await page.until('Runtime.exceptionThrown')
      resp.exceptionDetails.exception.description.split('\n')
          .forEach((l) => console.log(generator, ":", l))
    } catch (e) {
      return
    }
  }
}

async function compileFile(page, httpBase, generator, output, idx) {
  await page.send('Page.enable')
  await page.send('Network.enable')
  await page.send('Runtime.enable')

  const deps = []
  const logFlag = {value: true}
  addDeps(page, deps, logFlag)
  printLogs(page, generator, logFlag)
  printExceptions(page, generator, logFlag)

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
    expression: injections.compileFinishHooks.replace('${jobTimeout}', jobTimeout),
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
      status: 'timeout',
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
  logFlag.value = false
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

const {range} = require('lodash')

async function compilePaths(_paths, httpBase, browser, depFile) {
  const paths = _paths.map(p => ({generator: p, output: p}))
  const COLORS = range(paths.length).map((i) => randomColor(i))

  const allResults = []
  const results = []
  const linkMapping = {}
  const taskQueue = {}
  const targetIds = {}
  let next = 0
  let done = 0
  while (true) {
    const tasks = Object.values(taskQueue)
    if (next === paths.length && tasks.length === 0) {
      break
    }
    if (tasks.length < jobsCount && next < paths.length) {
      const col = COLORS[next]
      const {targetId} = await browser.send('Target.createTarget', {
        url: 'about:blank',
      })
      targetIds[next] = targetId
      taskQueue[next] = compileFile(await browser.attachToTarget(targetId), httpBase, paths[next].generator, paths[next].output, next)
      next++
      clog(col, align(`Queued file #${next}:`), `${paths[next - 1].output}`)
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
        error(align(`Timeout reached when processing file:`), `${result.generator}`)
      }

      await browser.send('Target.closeTarget', {targetId: targetIds[result.idx]})
      allResults.push(result)
      done++
      delete taskQueue[result.idx]
      if (result.status === 'ok') {
        result.addedPaths.forEach(
          p => {
            paths.push(p)
            COLORS.push(randomColor(paths.length))
            if (p.generator !== p.output) {
              if (linkMapping[p.generator]) {
                warn(`Output paths: "${linkMapping[p.generator]}" and "${p.output}" both use the same generator call: "${p.generator}"`)
              } else {
                linkMapping[p.generator] = p.output
              }
            }
          }
        )
        clog(COLORS[result.idx], align(`(${done}/${paths.length}) Finished:`), `${result.generator}`)
        results.push(result)
      }
    }
  }
  try {
    if (depFile) {
      await fs.writeFile(depFile, JSON.stringify(
        {
          commandLine: process.argv,
          allResults: allResults.map(res => _.omit(res, 'html'))
        },
        null,
        4
      ))
      warn(align(`Wrote depfile:`), depFile)
    }
  } catch (e) {
    error(align(`Encountered error when writing depfile:`), e.message)
  }
  return {
    results,
    linkMapping
  };
}

function mapLinks(html, linkMapping) {
  const root = hp.parse(html)
  root.querySelectorAll('a')
    .filter(a => linkMapping[a.getAttribute('href')])
    .forEach(a => a.setAttribute('href', linkMapping[a.getAttribute('href')]))
  return root.toString()
}

async function compile(fsBase, outFsBase, httpBase, paths, browser, depFile, copyResources) {
  log(align(`Using job count:`), `${jobsCount}`)
  log(align(`Using job timeout:`), `${jobTimeout}`)
  const {results, linkMapping} = await compilePaths(paths, httpBase, browser, depFile);
  const allDepsSet = new Set()
  results.forEach(res => {
    res.deps.forEach(d => allDepsSet.add(d))
    delete res.deps
  })
  const allDeps = [...allDepsSet]
  const allFilesToCopy = allDeps.map(dep => path.join(fsBase, dep))

  const htmls = {}
  for (let i = 0; i < results.length; i++) {
    htmls[path.join(fsBase, results[i].output)] = mapLinks(results[i].html, linkMapping)
  }

  for (let p of Object.keys(htmls)) {
    const out = p.replace(fsBase, outFsBase)
    const dir = path.dirname(out)
    await fs.mkdir(dir, {recursive: true})
    await fs.writeFile(out, htmls[p])
  }
  if (copyResources) {
    for (let inp of allFilesToCopy) {
      log(align(`Copying resource:`), `${inp}`)
      const out = inp.replace(fsBase, outFsBase)
      if (await fileExists(out)) {
        continue
      }
      const dir = path.dirname(out)
      await fs.mkdir(dir, {recursive: true})
      try {
        await fs.copyFile(inp, out)
      } catch (e) {
        warn(align(`Couldn't copy file:`), `${inp}`)
      }
    }
  }
}

module.exports = {
  compile,
  compileFile,
  setJobCount: (n) => jobsCount = n,
  setJobTimeout: (n) => jobTimeout = n
}
