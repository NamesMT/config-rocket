<div align="center">

# Config Rocket

<h3>Easily create and deploy configurable config packs!</h3>
<img src="./branding.svg" alt="Project's branding image" width="320"/>
</div>

# config-rocket ![TypeScript heart icon](https://img.shields.io/badge/♡-%23007ACC.svg?logo=typescript&logoColor=white)

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![Codecov][codecov-src]][codecov-href]
[![Bundlejs][bundlejs-src]][bundlejs-href]
[![jsDocs.io][jsDocs-src]][jsDocs-href]

## Overview

`config-rocket` is a toolkit/engine that helps you create or install configurable config packs.

* `CR` for users:
  + Super easy, safe install of any `config pack`, whether its a public one shared by your friend, or your own, privately-stored.
    + `config-rocket` does not allow any code execution, so the installation of a `config pack` is safe, but you should verify if the files after unpacked are what you expect.

* `CR` for creators:
  * Type-safety and autocompletion while crafting your `config pack`.
  + Supports DX candies like:
    + `fuel` context support that help you reduces duplication work in multiple files.
  + Create a GitHub release, or upload it somewhere, and everyone can use it via `config-rocket` CLI!

+ `CR` for developers:
  + Easily extendable, add your own rules and functionalities via exported functions and hooks support, for example: [Roo Rocket](https://github.com/NamesMT/roo-rocket)

## Usage

### For users

```sh
# On any platform: `Mac / Linux / Windows`, run a command:
npx config-rocket --repo="NamesMT/some-app-config"
# Or by url: `npx config-rocket --url=https://direct.url/to-config.zip`

# Interactively customize the rocket launch if config pack have parameters
# Nothing more, enjoy :)
```

### For creators

* Generate a repo from [`config-packs-template`](https://github.com/NamesMT/config-packs-template)
  * It's a template to create your own `config packs` for `config-rocket` ecosystem.
* Start shipping!

### Community Terms Explained:

* `CR`: short for `Config Rocket`

* `rocket assembly` / `config pack`:
  * Refers to an object that `CR` can use to assemble (build out) configurations files, during installations or development hot reloads.

* `Crafting rocket assembly` / `Crafting config pack`:
  * Refers to the act of you creating the required structure for `CR` to work.

* `Rocket launch`:
  * Refers to the process of the user installing your `config pack`, imagine you "ship/launch" your configs on a rocket to the user.

* `Rocket launch customize`:
  * Refers to the user's ability to configure the launch parameters and receive the wanted configs.

## License [![License][license-src]][license-href]

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/config-rocket?labelColor=18181B&color=F0DB4F
[npm-version-href]: https://npmjs.com/package/config-rocket
[npm-downloads-src]: https://img.shields.io/npm/dm/config-rocket?labelColor=18181B&color=F0DB4F
[npm-downloads-href]: https://npmjs.com/package/config-rocket
[codecov-src]: https://img.shields.io/codecov/c/gh/namesmt/config-rocket/main?labelColor=18181B&color=F0DB4F
[codecov-href]: https://codecov.io/gh/namesmt/config-rocket
[license-src]: https://img.shields.io/github/license/namesmt/config-rocket.svg?labelColor=18181B&color=F0DB4F
[license-href]: https://github.com/namesmt/config-rocket/blob/main/LICENSE
[bundlejs-src]: https://img.shields.io/bundlejs/size/config-rocket?labelColor=18181B&color=F0DB4F
[bundlejs-href]: https://bundlejs.com/?q=config-rocket
[jsDocs-src]: https://img.shields.io/badge/Check_out-jsDocs.io---?labelColor=18181B&color=F0DB4F
[jsDocs-href]: https://www.jsdocs.io/package/config-rocket
