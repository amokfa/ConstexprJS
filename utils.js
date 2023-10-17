const fs = require('fs')
const fsp = require('fs').promises
const path = require('path')

async function htmlFiles (fsBase, dir, isExcluded) {
  const files = (await fsp.readdir(dir)).filter(e => !e.startsWith('.')).map(file => path.join(dir, file))
  const stats = await Promise.all(files.map(file => fsp.stat(file)))
  const htmls = []
  for (let i = 0; i < files.length; i++) {
    if (stats[i].isFile() && files[i].toLowerCase().endsWith('.html')) {
      const path = files[i].replace(fsBase, '')
      if (isExcluded(path)) {
        warn(align('Ignoring path:'), `${path}`)
      } else {
        log(align('Found path:'), `${path}`)
        htmls.push(path)
      }
    } else if (stats[i].isDirectory()) {
      htmls.push(...(await htmlFiles(fsBase, files[i], isExcluded)))
    }
  }
  return htmls
}

async function sleep (n) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), n)
  })
}

function fileExists (f) {
  return new Promise((resolve) => {
    fs.access(f, (err) => {
      if (err) {
        resolve(false)
      } else {
        resolve(true)
      }
    })
  })
}

const isChildOf = (child, parent) => {
  if (child === parent) return false
  const parentTokens = parent.split('/').filter(i => i.length)
  const childTokens = child.split('/').filter(i => i.length)
  return parentTokens.every((t, i) => childTokens[i] === t)
}

let verbose = false
function enableVerbose () {
  verbose = true
}

const chalk = require('chalk')
function logLine (c, ...args) {
  console.log(c(...args))
}

function clog (color, ...args) {
  if (verbose) {
    if (color) {
      logLine(chalk.hex(color), ...args)
    } else {
      logLine(chalk, ...args)
    }
  }
}
function log (...args) {
  clog(false, ...args)
}
function warn (...args) {
  clog('#ffff00', ...args)
}
function error (...args) {
  logLine(chalk.hex('#ff0000').underline, ...args)
}

function align (s) {
  if (s.length >= 60) {
    return s + '\n' + '-'.repeat(60)
  } else {
    return s + '-'.repeat(60 - s.length)
  }
}

const fac = 0.7
function tooClose (r1, r2, r3) {
  const sorted = [r1, r2, r3].sort((a, b) => a - b)
  // console.log(sorted)
  return sorted[0] / sorted[1] > fac || sorted[1] / sorted[2] > fac
}

function shuffle (rand, arr) {
  const result = []
  while (arr.length !== 0) {
    const idx = rand(arr.length)
    result.push(arr[idx])
    arr.splice(idx, 1)
  }
  return result
}

const random = require('random-seed')
function randomColor (s) {
  const rand = random.create(s)
  let r
  let g
  let b
  do {
    const r1 = rand(200) + 56
    const r2 = rand(200) + 56
    const r3 = rand(200) + 56
    const cols = shuffle(rand, [r1, r2, r3])
    r = cols[0]
    g = cols[1]
    b = cols[2]
  } while (tooClose(r, g, b))
  return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0')
}

if (require.main === module) {
  verbose = true
  for (let i = 0; i < 100; i++) {
    const color = randomColor(i)
    // let color = rc({
    //   luminosity: 'bright'
    // });
    clog(color, color)
  }
}

function thread (afn) {
  let ended = false;
  (async () => {
    // eslint-disable-next-line
    while (!ended) {
      try {
        await afn()
      } catch (e) {
        break
      }
    }
  })()
  return () => {
    ended = true
  }
}

function trace (value) {
  console.log(value)
  return value
}

module.exports = {
  htmlFiles,
  sleep,
  fileExists,
  logLine,
  clog,
  log,
  warn,
  error,
  align,
  randomColor,
  enableVerbose,
  isChildOf,
  thread,
  trace
}
