# 可再生参考样本

本目录只保存最小数值输出和溯源元数据，不保存原始游戏、`.lib`、图像、字体或预构建运行时。

## RNG

`rng-web-wasm.json` 由用户本地参考中的 WebAssembly 导出函数直接产生：

```powershell
node scripts/collect-baye-rng-reference.mjs --source <path-to-Baye> --output references/fixtures/rng-web-wasm.json
```

它验证 Web 移植的非 Windows `rand_r` 路径。原设备头文件把 `gam_rand` 映射到 `SysRand`，但当前参考没有 `SysRand` 实现，因此样本不能被描述为设备端 RNG 已还原。

## 战斗公式

`battle-c-oracle.json` 由 GCC 编译 `tools/reference/baye-battle-oracle.c` 后产生：

```powershell
.\scripts\collect-baye-battle-reference.ps1 -SourcePath <path-to-Baye>
```

oracle 固化 `FgtCount.c` 的 C 浮点到 `U16` 截断、无符号乘法、6×6 兵种矩阵、8 类地形防御系数、`GetArmType` 的双装备槽覆盖顺序，以及 `FgtCountWon` 的概率边界。它不链接进产品代码。

所有样本都记录期望上游提交和实际使用文件的 SHA-256。当前用户提供的是不含 `.git` 的 ZIP 快照，所以 `snapshotCommitVerified` 必须保持 `false`；以后从锁定提交成功检出并重新生成后，才可提升该状态。

## 数据结构布局

`structure-layout.json` 直接包含上游 `attribute.h`，由 GCC 计算结构大小、字段偏移和字段宽度：

```powershell
.\scripts\collect-baye-structure-reference.ps1 -SourcePath <path-to-Baye>
```

该探针是 `data-structure-map.md` 中 19/37/66 字节结论的机器可重复证据，也用于防止过期源码注释被误当成二进制布局。

## 原版 `.lib` 容器

`lib-original.json` 由本地 `dat.lib.orig` 采集，只保存资源头、条目长度和解密后 SHA-256，不保存资源内容：

```powershell
node scripts/collect-baye-lib-reference.mjs --source <path-to-Baye> --output references/fixtures/lib-original.json
```

它覆盖 `dFgtLandF`、时期 1 城市/人物/人物队列/道具队列，以及首条城市、人物和道具名称。设置 `BAYE_REFERENCE_SOURCE` 后运行测试，可让正式 TypeScript 解析器直接复核本地库：

```powershell
$env:BAYE_REFERENCE_SOURCE = '<path-to-Baye>'
npm test -- --run src/compat/baye/libArchive.reference.test.ts
```

本地原版库使用 12 字节资源头和 4 字节变长索引；当前 C 移植的 `datman.h` 已将相应字段扩宽，不能混用两种布局。
