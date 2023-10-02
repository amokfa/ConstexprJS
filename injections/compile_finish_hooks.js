new Promise((resolve) => {
  setTimeout(() => resolve({status: 'timeout'}), ${jobTimeout})
  window._ConstexprJS_.triggerCompilationHook = () => resolve({
    status: 'ok',
    deducedExclusions: window._ConstexprJS_.deducedExclusions,
    addedExclusions: window._ConstexprJS_.addedExclusions,
    addedDependencies: window._ConstexprJS_.addedDependencies,
    addedPaths: window._ConstexprJS_.addedPaths,
    logs: window._ConstexprJS_.loggedStatements
  })
  window._ConstexprJS_.compilationErrorHook = (message) => resolve({status: 'abort', message})
})
