const fs = require('fs')
const path = require('path')

module.exports = {
  newPageScript: fs.readFileSync(path.resolve(__dirname) + '/new_page.js').toString(),
  compileFinishHooks: fs.readFileSync(path.resolve(__dirname) + '/compile_finish_hooks.js').toString()
}
