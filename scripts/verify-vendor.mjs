import path from 'node:path'
import {
  readVendorLock,
  sha256File,
  sha256Tree,
  vendorRoot,
} from './vendor-utils.mjs'

const lock = await readVendorLock()
const backendSha256 = await sha256File(
  path.join(vendorRoot, 'backend', lock.backend.output),
)
const frontendTreeSha256 = await sha256Tree(path.join(vendorRoot, 'frontend'))
const backendLicenseSha256 = await sha256File(
  path.join(vendorRoot, 'licenses', 'Sub-Store-AGPL-3.0.txt'),
)
const frontendLicenseSha256 = await sha256File(
  path.join(vendorRoot, 'licenses', 'Sub-Store-Front-End-GPL-3.0.txt'),
)

if (backendSha256 !== lock.backend.sha256) {
  throw new Error(`Sub-Store Ошибка валидации на стороне сервера.: ${backendSha256}`)
}
if (frontendTreeSha256 !== lock.frontend.treeSha256) {
  throw new Error(`Sub-Store Ошибка валидации на стороне клиента: ${frontendTreeSha256}`)
}
if (backendLicenseSha256 !== lock.backend.licenseSha256) {
  throw new Error(`Sub-Store Ошибка валидации лицензии на стороне сервера: ${backendLicenseSha256}`)
}
if (frontendLicenseSha256 !== lock.frontend.licenseSha256) {
  throw new Error(`Sub-Store Ошибка валидации лицензии на стороне клиента: ${frontendLicenseSha256}`)
}

console.log(`Проверка пройдена：Sub-Store ${lock.backend.version} / Front-End ${lock.frontend.version}`)
