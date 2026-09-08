# Agent Skill 安装指南

本文档记录 `@byted/life-settle-ai-assistant` 在目标项目中的安装和验证流程，团队成员可直接复用。

## 适用范围

默认安装后会把统一入口 skill 写入目标项目的常见 agent 发现路径：

- TRAE: `.trae/skills/life-settle-ai-assistant/SKILL.md`
- Claude Code: `.claude/skills/life-settle-ai-assistant/SKILL.md`
- 通用 / Codex-style agents：`skills/life-settle-ai-assistant/SKILL.md`

同时会在目标项目的 `AGENTS.md` 和 `CLAUDE.md` 中写入一个受控说明块，提示 agent 到上述目录读取统一入口 skill。已有内容会保留，重复安装不会重复追加说明块。

## 安装命令

在目标项目根目录执行：

```bash
npm install @byted/life-settle-ai-assistant --registry=https://bnpm.byted.org
```

指定当前验证过的版本：

```bash
npm install @byted/life-settle-ai-assistant@0.1.9 --registry=https://bnpm.byted.org
```

安装器会先安装项目级 agent skill，再检查并尝试安装外部 CLI 依赖及其全局 agent skill：

```bash
NPM_CONFIG_REGISTRY=http://bnpm.byted.org npm install -g @bytedance-dev/bytedcli@latest
bytedcli self skill install --skill bytedcli -g

NPM_CONFIG_REGISTRY=https://bnpm.byted.org npm install -g @byted/life-bamboo-cli
bamboo agents install --scope global
```

外部 CLI 安装失败不会阻断本包和 skill 安装。安装器会输出每个外部依赖的 `cli` 与 `skill` 状态，常见失败原因包括网络、全局 npm 写权限或 registry 不可用。

## 验证命令

在目标项目根目录执行：

```bash
npm ls @byted/life-settle-ai-assistant --depth=0
find .trae/skills -name SKILL.md | wc -l
find .claude/skills -name SKILL.md | wc -l
find skills -name SKILL.md | wc -l
grep -c 'life-settle-ai-assistant:start' AGENTS.md
grep -c 'life-settle-ai-assistant:start' CLAUDE.md
```

当前 `0.1.9` 版本的预期结果：

```text
@byted/life-settle-ai-assistant@0.1.9
.trae/skills: 1
.claude/skills: 1
skills: 1
AGENTS.md 受控说明块数量: 1
CLAUDE.md 受控说明块数量: 1
```

默认可见 skill 只有：

```text
life-settle-ai-assistant
```

查看包内业务 skill：

```bash
npx life-settle-ai-assistant list
```

扫描飞书群 Bamboo 报警并写入日报 Base 时，直接使用确定性子命令；该阶段无任何 AI 参与：

```bash
npx life-settle-ai-assistant bamboo groups-scan-and-troubleshoot \
  --group-id oc_xxx \
  --scan-dir-url "https://bytedance.larkoffice.com/wiki/xxx" \
  --scan-minutes 60 \
  --preflight-only
```

读取其它业务 skill 指引：

```bash
npx life-settle-ai-assistant bamboo guide alert-troubleshooter
```

## 手动重装

如果目标环境禁用了 npm lifecycle scripts，或安装后没有生成 skill 目录，可手动执行安装器：

```bash
npx life-settle-ai-assistant install
```

也可以直接执行包内脚本：

```bash
node node_modules/@byted/life-settle-ai-assistant/scripts/install-agent-skills.mjs
```

手动执行成功时会输出类似：

```text
[life-settle-ai-assistant] 已以 single 模式安装 3 个 skill 文件到 /path/to/target-project
[life-settle-ai-assistant] 外部依赖 bytedcli: cli=found, skill=installed
[life-settle-ai-assistant] 外部依赖 bamboo: cli=installed, skill=installed
```

`3` 表示统一入口 skill 分别写入了 3 个 agent 目录。

如需兼容旧 agent，可显式展开安装：

```bash
npx life-settle-ai-assistant install --mode=expanded
```

expanded 模式会把包内业务 skill 分别写入 3 个 agent 目录。

如果只想重装项目级 skill，不想检查或安装外部 CLI：

```bash
npx life-settle-ai-assistant install --skip-external-cli
```

## 全局 Agent 安装

如果希望本机所有支持常见全局 skill 目录的 agent 都能发现统一入口 skill，先安装 CLI：

```bash
npm install -g @byted/life-settle-ai-assistant@0.1.9 --registry=https://bnpm.byted.org
```

再执行：

```bash
life-settle-ai-assistant agents install --scope global --force
```

该命令会把统一入口 skill 写入：

```text
~/.trae-cn/skills/life-settle-ai-assistant/SKILL.md
~/.claude/skills/life-settle-ai-assistant/SKILL.md
~/.agents/skills/life-settle-ai-assistant/SKILL.md
```

`--force` 表示覆盖已存在的统一入口 skill；不带 `--force` 时，如果目标文件已存在，命令会停止并提示。

## 跳过自动安装

如果只想安装 npm 包，不想写入目标项目的 agent 目录：

```bash
SETTLE_AI_ASSISTANT_SKIP_INSTALL=1 npm install @byted/life-settle-ai-assistant --registry=https://bnpm.byted.org
```

后续需要启用时，再执行手动重装命令。

如果只想跳过外部 CLI 安装，但仍写入项目级 agent skill：

```bash
SETTLE_AI_ASSISTANT_SKIP_EXTERNAL_CLI_INSTALL=1 npm install @byted/life-settle-ai-assistant --registry=https://bnpm.byted.org
```

## 验证记录

已在临时目标项目做过真实安装验证：

```bash
npm init -y
npm install @byted/life-settle-ai-assistant@0.1.9 --registry=https://bnpm.byted.org
npm ls @byted/life-settle-ai-assistant --depth=0
find .trae/skills -name SKILL.md | wc -l
find .claude/skills -name SKILL.md | wc -l
find skills -name SKILL.md | wc -l
grep -c 'life-settle-ai-assistant:start' AGENTS.md
grep -c 'life-settle-ai-assistant:start' CLAUDE.md
node node_modules/@byted/life-settle-ai-assistant/scripts/install-agent-skills.mjs
```

验证结论：

- npm 包版本解析为 `@byted/life-settle-ai-assistant@0.1.9`
- `.trae/skills`、`.claude/skills`、`skills` 各生成 1 个 `SKILL.md`
- `AGENTS.md` 和 `CLAUDE.md` 均只有 1 个受控说明块
- 直接执行包内安装脚本可重复安装，说明块保持幂等

## 注意事项

- 在目标业务项目根目录执行安装命令，不要在本发布仓库里验证宿主安装效果。
- Codex 没有统一强制的 skill 目录标准，本包通过 `skills/` 目录和 `AGENTS.md` 说明块提供项目级兼容。
- 如果 npm 输出 `allow-scripts` 提示，先检查三个 skill 目录是否已经生成；若未生成，使用手动重装命令。
- 安装器会覆盖本包管理的 skill 文件，但只更新 `AGENTS.md` / `CLAUDE.md` 中的受控块，不会替换用户已有规则。
