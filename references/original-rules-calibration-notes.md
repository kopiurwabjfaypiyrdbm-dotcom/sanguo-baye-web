# 原版规则校准与战术身份记录

本记录只提炼可以由固定 MIT C 源码或用户提供的同源本地快照重复核验的语义。产品运行不读取本地路径，也不包含生成的资源数组。

## 补充参考身份

- 仓库：`https://github.com/erduoniba/baye-fmj-app.git`
- 锁定提交：`60c41ea2d9932b295833ece7004394497610596a`
- 本地相对路径：`baye_c/src/pconst.c`
- SHA-256：`924286b7547c05cd2fba37b8ab4c4f22767c2a7b3b4618df1ea83c2fecd92b43`
- 用途：核验运行时命令消耗和生成常量表的语义形状。
- 边界：该文件不加入 vendor allowlist；其中的嵌入式数组不复制进仓库。仓库只保存下述人工提炼的标量与语义分类。

## 已采用事实

### 开局与太守

- `tactic.c:LoadPeriod` 在载入时期后把所有人物的体力与兵力初始化为 100。
- `tactic.c:SetCitySatrap` 每次重算时，君主在城则由君主任太守；否则选择城内智力最高的在职武将。
- Web 新战役的 `baye-classic-v1` 采用上述规则；`modern-balanced-v1` 保留历史存档的 400 兵力与有效手动任命。

### 运行时命令消耗

以下数值来自本地 `pconst.c` 的 `ConsumeThew` 与 `ConsumeMoney` 标量表，并由命令枚举顺序复核：

| 命令 | 体力 | 金钱 |
|---|---:|---:|
| 开垦 / 招商 | 8 | 50 |
| 搜寻 | 8 | 0 |
| 治理 / 出巡 | 8 | 50 |
| 招降 | 15 | 100 |
| 赏赐道具 | 0 | 0 |
| 交易 | 12 | 0 |
| 宴请 | 0 | 100 |
| 输送 | 8 | 0 |
| 调动 | 0 | 0 |
| 离间 / 招揽 / 策反 | 20 | 50 |
| 劝降 | 10 | 50 |
| 侦察 | 10 | 20 |
| 征兵 | 12 | 按兵量另算 |
| 掠夺 | 20 | 0 |
| 出征 | 0 | 0 |

`src/core/rulesets.ts` 是产品中的版本化表达。所有领域命令、AI 预筛和 UI 文案从同一规则集读取。

### 普通攻击形状

`FgtPkAi.c:FgtGetCmdRng` 证明普通攻击从 `dFgtAtRange` 读取 5×5 掩码；本地生成常量只用于离线人工分类，原数组未复制。六兵种按顺序归纳为：

- 骑兵、水兵、玄兵：四个正交相邻格。
- 步兵、极兵：八个相邻格。
- 弓兵：曼哈顿距离恰好为 2 的八格环，不能贴身攻击。

`src/compat/baye/tacticalState.ts` 以三个语义谓词表达这些形状，避免嵌入原 5×5 字节表。

### 道具改变攻击范围

- `attribute.h:GOODS` 定义 `changeAttackRange` 和 30 字节 `atRange`。
- `FgtPkAi.c:FgtGetCmdRng` 依次检查两个装备位，启用改变射程的道具会替换普通攻击掩码，后一件有效道具覆盖前一件。
- Web 已在 `Item.normalAttackPatternOverride` 和战术单位快照中实现相同的“装备替换、后槽覆盖”机制。
- 33 项临时道具目录尚未获得可再分发的逐道具掩码事实，因此当前不把任何现有道具声明为原版射程道具。自动化测试使用人工夹具验证机制。

### 战场与技能的证据边界

- 本地 `dCityMapId` 表明 38 城使用 7 个战场身份，但逐城数组属于生成数据，本阶段不复制。产品提供 7 个可替换的程序化结构战场，当前分配仍是现代稳定映射。
- `FgtPkAi.c:FgtInitArmsJNNum/FgtGetSklBuf` 证明兵种技能数量随兵种和等级增长，另有特有技能与君主技能；确切技能 ID 来自生成资源。当前十项计谋继续明确标为现代数据驱动目录，UI 显示这一来源，不伪称已经恢复原版技能表。

## 可重复检查

```powershell
Get-FileHash D:\06_OtherStorage\baye-fmj-app-main\Baye\baye_c\src\pconst.c -Algorithm SHA256
npm test -- --run src/core/rulesets.test.ts src/core/tacticalBattle.test.ts src/core/saveGame.test.ts
```

缺少本地快照时，产品与普通测试仍可完整构建运行；只有重新核对上述补充事实需要该文件。
