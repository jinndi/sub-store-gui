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
  throw new Error(`Sub-Store 后端校验失败: ${backendSha256}`)
}
if (frontendTreeSha256 !== lock.frontend.treeSha256) {
  throw new Error(`Sub-Store 前端校验失败: ${frontendTreeSha256}`)
}
if (backendLicenseSha256 !== lock.backend.licenseSha256) {
  throw new Error(`Sub-Store 后端许可证校验失败: ${backendLicenseSha256}`)
}
if (frontendLicenseSha256 !== lock.frontend.licenseSha256) {
  throw new Error(`Sub-Store 前端许可证校验失败: ${frontendLicenseSha256}`)
}

console.log(`校验通过：Sub-Store ${lock.backend.version} / Front-End ${lock.frontend.version}`)
