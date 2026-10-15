# Project 调用权限

Project 调用权限控制 Project 内 Agent、Workflow 和插件可以调用的下游 RPC、MCP Tool
及 HTTP 目标。权限判断必须发生在 daemon 或操作系统执行边界；提示词不构成权限边界。

## 策略

未配置 `project.permissions` 的旧 Project 保持原行为。用户启用权限后，新策略默认拒绝。

每条规则的动作是 `allow` 或 `deny`。一次调用的判断顺序固定为：

1. 任意匹配的 `deny` 规则拒绝调用。
2. 否则，任意匹配的 `allow` 规则允许调用。
3. 否则，使用策略的 `defaultAction`。

RPC 目标使用稳定命名：

- `paseo-rpc:<request-type>`
- `mcp:<server>/<tool>`
- `plugin-rpc:<plugin-id>/<method>`
- `workflow:<workflow-id>/<operation>`

HTTP 规则分别匹配协议、主机、端口、方法和路径。主机匹配同时校验 DNS 解析后的地址；
每次重定向重新授权，不能沿用上一个 URL 的结果。私网、环回、链路本地和云元数据地址
不因域名白名单自动获得访问权限。

## 强制执行层

权限状态分为：

- `managed`：daemon 内 RPC/MCP、插件/Workflow 托管 HTTP 已强制执行。
- `strict`：除托管出口外，Project 子进程的直接 Socket 也被操作系统限制，只能经过
  Project 出站网关。
- `unavailable`：用户要求严格模式，但当前平台没有可用的操作系统强制能力。此状态
  必须阻止相关 Project 启动新的执行任务，不能降级为仅注入代理环境变量。

Linux 严格模式使用独立 network namespace。macOS 严格模式使用受控网络扩展或特权辅助
进程。`HTTP_PROXY`、`HTTPS_PROXY` 和 Provider 工具白名单只能作为兼容配置，不能把执行
状态提升为 `strict`。

Linux 桌面包包含一个最小权限的 setuid launcher。它创建仅启用 loopback 的匿名 network
namespace，并在该 namespace 内创建只监听本次代理端口的 socket；宿主 namespace 中受
保护的 relay 仅把这个 socket 转发到宿主 loopback 上同一 Paseo 代理端口。隔离环境没有
veth、默认路由或其他网络接口，因此 Project 进程不能绕过 relay 访问宿主其他端口或公网，
也不依赖 iproute2、iptables 或 nftables。随后 helper 清空附加组、降回调用用户、设置
`no_new_privs`，再执行 Provider、Workflow 或 Plugin 进程树。代理凭据通过环境传入
helper，转换为标准 HTTP 代理 URL 后删除原始变量；relay 不接收动态目标并清除原始凭据。
只有 helper、受控代理、所有 Project 进程入口和允许/拒绝/DNS rebinding/逃逸测试同时在
Debian 12 验收通过时，helper 才报告 `project_proxy` 和 `strict_ready=true`。

deb/rpm 安装脚本把 helper 设置为 `root:root`、模式 `4755`。AppImage 挂载内容不能安全地
获得 setuid 权限，因此 AppImage 在单独安装受信任 helper 前保持 `unavailable`。

受控代理使用短期、仅内存保存、访问时滑动续期的 Workspace/Project 凭据。普通 HTTP
请求按完整 URL、Method 和 Path 授权；HTTPS `CONNECT` 只能按协议、主机和端口授权，
因此带 Method 或 Path 限制的规则不能授权 CONNECT 隧道。环回、链路本地、私网、未指定
和组播地址默认拒绝。普通 HTTP 在授权后固定使用已校验的 DNS 地址，同时保留原 Host 和
TLS SNI；每次重定向重新授权和解析，防止 DNS rebinding 与解析后替换。

## 审计

审计记录包含 Project、Workspace、Agent 或任务、调用来源、目标、决策、命中规则和耗时。
默认不保存 Authorization、Cookie、Token、请求正文或响应正文。

拒绝统一使用 `PROJECT_PERMISSION_DENIED`，并向 Agent 会话和任务页面提供目标、命中规则
及恢复操作。规则测试器和审计页面使用同一个权限判断器，禁止复制匹配逻辑。
