# Changelog


## v0.3.8

[compare changes](https://github.com/namesmt/config-rocket/compare/v0.3.7...v0.3.8)

### 🩹 Fixes

- Bad binary ref ([79a1e65](https://github.com/namesmt/config-rocket/commit/79a1e65))

### ❤️ Contributors

- NamesMT ([@NamesMT](https://github.com/NamesMT))

## v0.3.7

[compare changes](https://github.com/namesmt/config-rocket/compare/v0.3.6...v0.3.7)

### 🚀 Enhancements

- **unpack:** Ability to configure non-rocket archive behavior ([3675fc1](https://github.com/namesmt/config-rocket/commit/3675fc1))
- Add `rocket-zip` cli app ([1640c6e](https://github.com/namesmt/config-rocket/commit/1640c6e))

### 🏡 Chore

- Update deps ([ace0fd3](https://github.com/namesmt/config-rocket/commit/ace0fd3))

### ✅ Tests

- **helpers/fs:** Fix fails due to format update commit, style refactors ([26fd97b](https://github.com/namesmt/config-rocket/commit/26fd97b))
- **rocket/unpack:** Add tests ([80ed8f8](https://github.com/namesmt/config-rocket/commit/80ed8f8))

### ❤️ Contributors

- NamesMT ([@NamesMT](https://github.com/NamesMT))

## v0.3.6

[compare changes](https://github.com/namesmt/config-rocket/compare/v0.3.5...v0.3.6)

### 🚀 Enhancements

- Add `typedoc.yml` workflow ([654e264](https://github.com/namesmt/config-rocket/commit/654e264))

### 📖 Documentation

- **README:** Update ([d1fc29a](https://github.com/namesmt/config-rocket/commit/d1fc29a))

### 🌊 Types

- **RocketConfig:** Add example usage ([cf74e31](https://github.com/namesmt/config-rocket/commit/cf74e31))

### 🏡 Chore

- Exports `helpers/fs` ([52b5cef](https://github.com/namesmt/config-rocket/commit/52b5cef))
- Test simplify and fix ci ([455b030](https://github.com/namesmt/config-rocket/commit/455b030))

### ❤️ Contributors

- NamesMT ([@NamesMT](https://github.com/NamesMT))
- Trung Dang ([@NamesMT](https://github.com/NamesMT))

## v0.3.5

[compare changes](https://github.com/namesmt/config-rocket/compare/v0.3.4...v0.3.5)

### 🏡 Chore

- **fileOutput:** More readable result upon merging ([82f7e0b](https://github.com/namesmt/config-rocket/commit/82f7e0b))

### ❤️ Contributors

- NamesMT ([@NamesMT](https://github.com/NamesMT))

## v0.3.4

[compare changes](https://github.com/namesmt/config-rocket/compare/v0.3.3...v0.3.4)

### 🩹 Fixes

- **supplyFuelToResolvedFilesBuilder:** Correct fueling logic ([0aedfbe](https://github.com/namesmt/config-rocket/commit/0aedfbe))

### 🏡 Chore

- Remove `required` from `prompt` because it is usable for `multiselect` only ([0b49bcd](https://github.com/namesmt/config-rocket/commit/0b49bcd))

### ❤️ Contributors

- NamesMT ([@NamesMT](https://github.com/NamesMT))

## v0.3.3

[compare changes](https://github.com/namesmt/config-rocket/compare/v0.3.2...v0.3.3)

### 🩹 Fixes

- `parameters` reference does not work on non-`RocketCondition` input ([26f018f](https://github.com/namesmt/config-rocket/commit/26f018f))

### 🌊 Types

- Add `RocketResolvableString` type ([e4290c6](https://github.com/namesmt/config-rocket/commit/e4290c6))

### ❤️ Contributors

- NamesMT ([@NamesMT](https://github.com/NamesMT))

## v0.3.2

[compare changes](https://github.com/namesmt/config-rocket/compare/v0.3.1...v0.3.2)

### 🚀 Enhancements

- Allow prompt `required` config ([1e33009](https://github.com/namesmt/config-rocket/commit/1e33009))

### ❤️ Contributors

- NamesMT ([@NamesMT](https://github.com/NamesMT))

## v0.3.1

[compare changes](https://github.com/namesmt/config-rocket/compare/v0.3.0...v0.3.1)

### 🚀 Enhancements

- Allows result referrence back to `parameters` ([a97c578](https://github.com/namesmt/config-rocket/commit/a97c578))

### 💅 Refactors

- Minor ([b3b3cec](https://github.com/namesmt/config-rocket/commit/b3b3cec))

### 🏡 Chore

- Some refactor, better asserts for `filesBuildResolver` ([21ffc0f](https://github.com/namesmt/config-rocket/commit/21ffc0f))

### ❤️ Contributors

- NamesMT ([@NamesMT](https://github.com/NamesMT))

## v0.3.0

[compare changes](https://github.com/namesmt/config-rocket/compare/v0.2.2...v0.3.0)

### 🚀 Enhancements

- ⚠️  Introduce `ReactiveArgs`, refactor a bit ([4087e3f](https://github.com/namesmt/config-rocket/commit/4087e3f))
- `simpleWriteFileWithDirs` => `fileOutput`, add `hookable` support ([70a48e8](https://github.com/namesmt/config-rocket/commit/70a48e8))
- **fileOutput:** Support content merging and hooks ([9a8d89b](https://github.com/namesmt/config-rocket/commit/9a8d89b))
- Add `filesBuildResolver` config (+ refactorings) ([ee5eef2](https://github.com/namesmt/config-rocket/commit/ee5eef2))

### 🩹 Fixes

- Should read from original globbed filePath ([4295cbf](https://github.com/namesmt/config-rocket/commit/4295cbf))

### 📖 Documentation

- **README:** Minor ([9bb838c](https://github.com/namesmt/config-rocket/commit/9bb838c))

### ✅ Tests

- Add tests for `assemble` ([695f23d](https://github.com/namesmt/config-rocket/commit/695f23d))
- Add tests for `helpers/fs` ([66db143](https://github.com/namesmt/config-rocket/commit/66db143))
- **rocket/assemble:** Update ([d6a89e2](https://github.com/namesmt/config-rocket/commit/d6a89e2))

#### ⚠️ Breaking Changes

- ⚠️  Introduce `ReactiveArgs`, refactor a bit ([4087e3f](https://github.com/namesmt/config-rocket/commit/4087e3f))

### ❤️ Contributors

- NamesMT ([@NamesMT](https://github.com/NamesMT))

## v0.2.2

[compare changes](https://github.com/namesmt/config-rocket/compare/v0.2.1...v0.2.2)

### 🚀 Enhancements

- ⚠️  Add `hookable` to `unpack`, rename `assembleHookable` => `hookable` ([b680bf2](https://github.com/namesmt/config-rocket/commit/b680bf2))

### 🏡 Chore

- Minor corrections ([60a8007](https://github.com/namesmt/config-rocket/commit/60a8007))

#### ⚠️ Breaking Changes

- ⚠️  Add `hookable` to `unpack`, rename `assembleHookable` => `hookable` ([b680bf2](https://github.com/namesmt/config-rocket/commit/b680bf2))

### ❤️ Contributors

- NamesMT ([@NamesMT](https://github.com/NamesMT))

## v0.2.1

[compare changes](https://github.com/namesmt/config-rocket/compare/v0.2.0...v0.2.1)

### 🚀 Enhancements

- Refactor to expose cli functions for dev-extensible ([3674069](https://github.com/namesmt/config-rocket/commit/3674069))

### ❤️ Contributors

- NamesMT ([@NamesMT](https://github.com/NamesMT))

## v0.2.0


### 📖 Documentation

- Minor ([a3e4baf](https://github.com/namesmt/config-rocket/commit/a3e4baf))

### 🏡 Chore

- Init ([bb1a313](https://github.com/namesmt/config-rocket/commit/bb1a313))

### ❤️ Contributors

- NamesMT ([@NamesMT](https://github.com/NamesMT))

