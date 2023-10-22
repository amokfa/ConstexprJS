/* eslint-disable */
new Promise((resolve) => {
  setTimeout(() => resolve({ status: 'timeout' }), $[jobTimeout])
  window._ConstexprJS_.triggerCompilationHook = () => resolve({
    status: 'ok',
    deducedDependencies: window._ConstexprJS_.deducedDependencies,
    deducedExclusions: window._ConstexprJS_.deducedExclusions,
    addedExclusions: window._ConstexprJS_.addedExclusions,
    addedDependencies: window._ConstexprJS_.addedDependencies,
    addedPaths: window._ConstexprJS_.addedPaths
  })
  window._ConstexprJS_.compilationErrorHook = (message) => resolve({ status: 'abort', message })
})
/* eslint-enable */
