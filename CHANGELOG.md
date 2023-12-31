# 1.4.1

* Allow users to specify HTML tags whose content shouldn't be formatted

# 1.4.0

* Format output HTML
* Use only static analysis for finding resource dependencies 

# 1.3.{0,1}

* Dependency resolution bugfix

# 1.2.2

* depfile not generating bugfix
* some resources not getting detected bugfix

# 1.2.{0,1}

* code cleanup
* replace --noheadless with --headless
* linting

# 1.1.1

* bugfixes

# 1.1.0

* forward console logs and uncaught exceptions to stdout

# 1.0.0

* bugfixes

# 0.8.{1,2,3}

* bugfixes

# 0.8.0

* guess jobscount

* implementation changes

* Binary name changed to `constexprjs` (`constexpr.js` is incompatible with windows)

# 0.7.4

* perf improvement

# 0.7.3

* bugfix

# 0.7.2

* removed restriction on input/output directories

* logging fix

# 0.7.1

* Minor fixes

# 0.7.0

* Removed automatic HTML discovery

* Added `addDependency` hook ([Guide](https://amokfa.github.io/posts/constexprjs_dependency_resolution.html))

* Replaced `addPaths` with `addPath`
  
* Replaced `addExclusions` with `addExclusion`

* Removed `--exclusion`

# 0.6.0

* `--entry` option ([Guide](https://amokfa.github.io/posts/constexprjs_entry_points.html))

* `log` hook

* `--jobs` is changehd to `--jobcount`

* `--exclusions` is replaced by `--exclusion` (can be used multiple times)

* Better cli help

* Better depfiles

# 0.5.1

* `addExclusions`

# 0.5.0

* Generator pages. ([Guide](https://amokfa.github.io/posts/constexprjs_generator_pages.html))

# 0.4.1

* Colored log output

* Added `--depfile` option

# 0.4.0

* Added `--jobtimeout` option

* Added `window._ConstexprJS_.abort(message)` callback.
