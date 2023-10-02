const fs = require('fs')

module.exports = {
  newPageScript: fs.readFileSync(__dirname + '/new_page.js').toString(),
  compileFinishHooks: fs.readFileSync(__dirname + '/compile_finish_hooks.js').toString(),
}
