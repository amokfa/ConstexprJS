(() => {
  window._ConstexprJS_ = {}
  window._ConstexprJS_.addedPaths = []
  window._ConstexprJS_.addedExclusions = []
  window._ConstexprJS_.addedDependencies = []
  window._ConstexprJS_.deducedDependencies = []
  window._ConstexprJS_.triggerCompilationHook = null
  window._ConstexprJS_.compilationErrorHook = null

  function callWhenAvailable (fnr, ...args) {
    function f () {
      const fn = fnr()
      if (fn) {
        fn(...args)
      } else {
        setTimeout(f, 100)
      }
    }
    f()
  }

  window._ConstexprJS_.compile = () => {
    document.querySelectorAll('[constexpr]').forEach(
      el => el.remove()
    )

    Array.from(document.querySelectorAll('[src]'))
      .forEach(el => window._ConstexprJS_.deducedDependencies.push(el.src))
    Array.from(document.querySelectorAll('link[rel=stylesheet]'))
      .forEach(el => window._ConstexprJS_.deducedDependencies.push(el.href))
    Array.from(document.querySelectorAll('link[rel=icon]'))
      .forEach(el => window._ConstexprJS_.deducedDependencies.push(el.href))

    callWhenAvailable(() => window._ConstexprJS_.triggerCompilationHook)
  }
  window._ConstexprJS_.abort = (message) => {
    callWhenAvailable(() => window._ConstexprJS_.compilationErrorHook, message)
  }
  window._ConstexprJS_.addPath = (path) => {
    if (typeof (path) !== 'object' || typeof (path.generator) !== 'string' || typeof (path.output) !== 'string') {
      throw new Error('"path" must be objects with keys "generator" and "output" having strings as values')
    }
    window._ConstexprJS_.addedPaths.push({ generator: path.generator, output: path.output })
  }
  window._ConstexprJS_.addExclusion = (path) => {
    if (typeof (path) !== 'string') {
      throw new Error('"path" must be a string')
    }
    window._ConstexprJS_.addedExclusions.push(path)
  }
  window._ConstexprJS_.addDependency = (path) => {
    if (typeof (path) !== 'string') {
      throw new Error('"path" must be a string')
    }
    window._ConstexprJS_.addedDependencies.push(path)
  }
})()
