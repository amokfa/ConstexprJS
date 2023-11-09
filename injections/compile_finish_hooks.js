/* eslint-disable */
new Promise((resolve) => {
  setTimeout(() => resolve({ status: 'timeout' }), $[jobTimeout])
  window._ConstexprJS_.triggerCompilationHook = () => resolve({
    status: 'ok',
    addedPaths: window._ConstexprJS_.addedPaths,
    addedExclusions: window._ConstexprJS_.addedExclusions,
    addedDependencies: window._ConstexprJS_.addedDependencies,
    deducedDependencies: window._ConstexprJS_.deducedDependencies,
  })
  window._ConstexprJS_.compilationErrorHook = (message) => resolve({ status: 'abort', message })
})
/* eslint-enable */
