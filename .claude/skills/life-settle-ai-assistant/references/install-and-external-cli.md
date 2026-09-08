# 安装指令与外部 CLI 依赖

本文档整理 `@byted/life-settle-ai-assistant` 的安装命令、自动安装行为，以及本项目依赖的外部 CLI。

## 推荐安装

在目标项目根目录执行：

```bash
npm install @byted/life-settle-ai-assistant --registry=https://bnpm.byted.org
```

指定当前验证过的版本：

```bash
npm install @byted/life-settle-ai-assistant@0.1.9 --registry=https://bnpm.byted.org
```

安装完成后，目标项目会生成统一入口 skill：

```text
.trae/skills/life-settle-ai-assistant/SKILL.md
.claude/skills/life-settle-ai-assistant/SKILL.md
skills/life-settle-ai-assistant/SKILL.md
```

安装器还会更新目标项目的 `AGENTS.md` 和 `CLAUDE.md` 受控说明块，提示 agent 读取统一入口 skill。已有内容会保留，重复安装不会重复追加说明块。

## 外部 CLI 依赖

安装器会检查并尝试安装本项目依赖的外部 CLI 及其全局 agent skill。

### bytedcli

用途：

- 读取和操作飞书/Lark 资源。
- 查询 Codebase、TCE、RPC 相关内部研发平台能力。
- 为结算排障 skill 提供统一的内部 CLI 命令面。

安装命令：

```bash
NPM_CONFIG_REGISTRY=http://bnpm.byted.org npm install -g @bytedance-dev/bytedcli@latest
```

安装 bytedcli agent skill：

```bash
bytedcli self skill install --skill bytedcli -g
```

### bamboo

用途：

- 查询 Bamboo 数据质量规则、报警结果和异常数据。
- 支撑 Bamboo 报警扫描、排障、归因和回写流程。

安装命令：

```bash
NPM_CONFIG_REGISTRY=https://bnpm.byted.org npm install -g @byted/life-bamboo-cli
```

安装 bamboo agent skill：

```bash
bamboo agents install --scope global
```

## 安装器行为

默认安装流程：

1. 安装项目级统一入口 skill。
2. 检查 `bytedcli` 是否存在；缺失时尝试安装。
3. 执行 `bytedcli self skill install --skill bytedcli -g`。
4. 检查 `bamboo` 是否存在；缺失时尝试安装。
5. 执行 `bamboo agents install --scope global`。

外部 CLI 安装失败不会阻断本包和项目级 skill 安装。安装器会输出每个外部依赖的状态，例如：

```text
[life-settle-ai-assistant] 外部依赖 bytedcli: cli=found, skill=installed
[life-settle-ai-assistant] 外部依赖 bamboo: cli=installed, skill=installed
```

常见失败原因包括网络不可用、全局 npm 写权限不足、registry 不可用，或本机 CLI 认证状态异常。修复后可重新执行安装器。

## 跳过外部 CLI 安装

如果只想安装本项目 skill，不想检查或安装外部 CLI：

```bash
SETTLE_AI_ASSISTANT_SKIP_EXTERNAL_CLI_INSTALL=1 npm install @byted/life-settle-ai-assistant --registry=https://bnpm.byted.org
```

安装后也可以手动重装项目级 skill，并跳过外部 CLI：

```bash
npx life-settle-ai-assistant install --skip-external-cli
```

## 手动重装

如果目标环境禁用了 npm lifecycle scripts，或安装后没有生成 skill 目录，可手动执行：

```bash
npx life-settle-ai-assistant install
```

也可以直接执行包内脚本：

```bash
node node_modules/@byted/life-settle-ai-assistant/scripts/install-agent-skills.mjs
```

## 验证

在目标项目根目录执行：

```bash
npm ls @byted/life-settle-ai-assistant --depth=0
find .trae/skills -name SKILL.md | wc -l
find .claude/skills -name SKILL.md | wc -l
find skills -name SKILL.md | wc -l
grep -c 'life-settle-ai-assistant:start' AGENTS.md
grep -c 'life-settle-ai-assistant:start' CLAUDE.md
command -v bytedcli
command -v bamboo
```

读取包内业务 skill 指引：

```bash
npx life-settle-ai-assistant list
npx life-settle-ai-assistant bamboo guide alert-troubleshooter
```
