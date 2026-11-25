![骏骏通知中转](https://www.junjunloveprogramming.cn/upload/dsh-junjun-transit-logo.png)

# trae-junjun-transit · 骏骏通知中转

> 让 Trae Agent 在完成任务后，把一条浓缩的中文摘要推送到你的手机、邮箱或 Bark。

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20.6-339933)](https://nodejs.org)
[![tests](https://img.shields.io/badge/tests-11%20passing-brightgreen)](#开发与测试)

`trae-junjun-transit` 是一个 Trae 插件，由三部分组成：

- **MCP 服务**注册工具，让 Agent 能主动推送通知、查看配置、一键配置；
- **本地配置页**在浏览器提供配置表单，填昵称即可，无需手写 JSON；
- **Stop Hook** 在每轮对话结束时由宿主直接发通知，**不依赖模型自觉调用**。

| | |
|---|---|
| 插件 ID | `trae-junjun-transit` |
| 工具名 | `junjun_transit_send` / `junjun_transit_setup` / `junjun_transit_status` / `junjun_transit_open_settings` |
| 运行时依赖 | **零**（只用 Node 内置 `fetch` / `AbortSignal`） |

> 源码仓库：[github.com/JunJunLoveProgramming/trae-junjun-transit](https://github.com/JunJunLoveProgramming/trae-junjun-transit)
> 当前版本 `0.1.0`，MIT 开源，欢迎 Issue 与 PR。
> 安装文档：[docs/trae-install-guide.html](docs/trae-install-guide.html)

---

## 目录

- [特性](#特性)
- [环境要求](#环境要求)
- [安装](#安装)
- [赞助](#赞助)
- [配置](#配置)
- [主题设置（本地）](#主题设置本地)
- [使用](#使用)
- [工作方式](#工作方式)
- [MeoW API 行为](#meow-api-行为)
- [Bark API 行为](#bark-api-行为)
- [错误排查](#错误排查)
- [开发与测试](#开发与测试)
- [设计说明](#设计说明)
- [安全建议](#安全建议)
- [作者](#作者)
- [反馈](#反馈)
- [许可](#许可)

---

## 特性

- **配置极简**：本地配置页或一句话对话，MeoW 昵称、SMTP、Bark 至少配置一种即可
- **本地主题**：通知标题、自定义图标 URL、自定义分类，全部本机生效，无需登录
- **强制自动推送**：不提供开关。每轮回答结束前 Agent 必须调用一次 `junjun_transit_send`；宿主支持 Hooks 时再由 Stop Hook 兜底，双重保证不漏推
- **内置总结器**：推送前清理 Markdown、HTML、代码块、表格与长路径，压缩成适合手机阅读的纯文本
- **SMTP 邮件通道**：MeoW、SMTP 与 Bark 按配置自动启用，配好一个就跑一个，配好多个就同时发送
- **Bark 推送**：填入 Bark token 即可使用全能消息推送 JSON API
- **首次使用零 JSON**：服务启动时自动安装技能、自动把 Stop Hook 合并进 `hooks.json`
- **配置缺失有指引**：通道未配置时工具返回明确提示，而不是静默失败
- **符合官方 API 规范**：按 [MeoW Push API 文档](https://www.chuckfang.com/MeoW/api_doc.html) 解析业务状态码（200/400/403/404/429/500）
- **完整 URL 编码**：路径段先做全角替换再编码，中文、空格、`/`、`?`、`#`、`&` 都不会破坏请求
- **遵守官方限流**：客户端强制 3 秒最小发送间隔，并识别 `429` 给出降频建议
- **错误分类清晰**：区分 `invalid` / `timeout` / `aborted` / `network` / `http` / `forbidden` / `nickname` / `ratelimit` / `server`，每类给出可操作提示
- **双重超时保护**：请求超时（默认 10s，可配置）与上游取消信号，任一触发都能干净退出
- **节流防刷屏**：工具调用默认 5 秒内不重复推送；兜底 Hook 与手动推送 30 秒内去重
- **零运行时依赖**：不引入任何第三方包，只用 Node 标准库

---

## 环境要求

| 项 | 要求 |
|---|---|
| Node.js | ≥ 20.6（需要内置 `fetch`、`AbortSignal.timeout`） |
| Trae | 已安装，并能加载 MCP 服务与技能 |
| MeoW（可选） | 鸿蒙手机已安装 MeoW App，且已设置用户昵称 |
| SMTP（可选） | 任一 SMTP 邮箱账号；支持 SSL/TLS、STARTTLS 或内网明文中继 |
| Bark（可选） | 手机已安装「全能消息推送 Bark」App，并取得客户端 token |
| 网络 | 按启用的通道，需能访问 `api.chuckfang.com`、SMTP 服务器或 `www.ggsuper.com.cn` |

---

## 安装

### 从插件市场安装（推荐）

在 Trae 的 **插件市场** 中搜索「骏骏通知中转」并安装。插件自带技能与 MCP 声明，安装后重启 Trae 即可。

### 从源码运行（开源版）

```bash
git clone https://github.com/JunJunLoveProgramming/trae-junjun-transit.git
cd trae-junjun-transit
node test/smoke.mjs     # 可选：先跑一遍冒烟测试
node server/index.mjs   # 以 stdio 启动 MCP 服务
```

也可以把仓库目录直接加入 MCP 配置，见下一节。源码采用 MIT 许可，可自由修改与分发。

### 从本地 MCP 加载

把仓库放到本地后，在 **设置 → MCP** 中添加：

```json
{
  "mcpServers": {
    "trae-junjun-transit": {
      "command": "node",
      "args": ["D:/trae-junjun-transit/server/index.mjs"]
    }
  }
}
```

保存后 MCP 面板应出现四个工具。服务首次启动会自动完成两件事：

1. 把技能复制到 `%USERPROFILE%\.trae-cn\skills\trae-junjun-transit\SKILL.md`；
2. 把 Stop Hook 合并进 `%USERPROFILE%\.trae-cn\hooks.json`（保留已有 Hook，改动前备份为 `.bak`）。

生成的 Hook 配置如下，无需手动编辑：

```json
{
  "version": 1,
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"D:/trae-junjun-transit/server/hook.mjs\"",
            "timeout": 15
          }
        ]
      }
    ]
  }
}
```

> **装完必须重启 Trae**：已加载的 MCP 服务与 Hook 不会热更新。
> 若你的 Trae 版本提供 **设置 → Hooks** 且开关未打开，点一下启用即可；没有该入口则忽略，自动推送由 Agent 每轮强制调用保证。

### 源码调试（不安装）

直接以 stdio 启动 MCP 服务：

```bash
node server/index.mjs
```

单独打开配置页：

```bash
node server/settings.mjs
```

`server/settings.mjs` 会监听 `127.0.0.1` 的随机端口并自动打开浏览器，15 分钟无操作自动关闭。

---

## 赞助

骏骏通知中转（trae-junjun-transit）完全免费开源。如果它在你的 Trae + 鸿蒙工作流里省了时间，欢迎通过赞助方案进行赞助。赞助用于覆盖域名和持续维护成本，不解锁额外功能。

[赞助方案](https://www.junjunloveprogramming.cn/1794977129986)

---

## 配置

**MeoW 昵称、SMTP、Bark 至少配置一种**；`title` / `imgUrl` / `category` 属于**本地主题**，写在配置文件的 `theme` 段。

### 在本地配置页配置（推荐）

对 Agent 说「打开配置界面」，或运行 `node server/settings.mjs`：

| 字段 | 控件 | 说明 | 默认值 |
|---|---|---|---|
| `meow.nickname` | 文本框 | 启用 MeoW 时必填：你的 MeoW 用户昵称（官方文档：不允许包含斜杠） | — |
| `bark.token` | 文本框 | Bark 客户端 token，留空表示不修改 | — |
| `smtp.*` | 表单 | 服务器、端口、加密方式、账号、授权码、收发件人 | — |

保存后写入配置文件，下一次工具调用立即生效，无需重启 Trae。

### 直接编辑配置文件

配置文件路径：

- Windows：`%USERPROFILE%\.trae-cn\trae-junjun-transit\config.json`
- macOS / Linux：`~/.trae-cn/trae-junjun-transit/config.json`

首次调用任意工具会自动生成模板。完整示例：

```json
{
  "meow": {
    "nickname": "你的MeoW昵称",
    "apiBase": "https://api.chuckfang.com"
  },
  "smtp": {
    "host": "smtp.qq.com",
    "port": 465,
    "encryption": "tls",
    "username": "you@qq.com",
    "password": "邮箱授权码",
    "fromEmail": "you@qq.com",
    "toEmail": "you@qq.com"
  },
  "bark": {
    "token": "你的BarkToken"
  },
  "theme": {
    "title": "骏骏消息中转",
    "imgUrl": "https://www.junjunloveprogramming.cn/upload/dsh-junjun-transit-logo.png",
    "category": "Trae插件"
  },
  "options": {
    "timeoutMs": 10000,
    "throttleMs": 5000,
    "autoPushTitle": "骏骏消息中转",
    "autoPushMaxChars": 300
  }
}
```

### 字段说明

| 字段 | 类型 | 必填 | 默认值 | 非法时 |
|---|---|---|---|---|
| `meow.nickname` | string | 启用 MeoW 时必填 | — | 该通道禁用 + 状态提示 |
| `meow.apiBase` | string | — | `https://api.chuckfang.com` | 回退默认值 + warn |
| `smtp.host` / `fromEmail` / `toEmail` | string | 启用 SMTP 时必填 | — | 该通道禁用并提示缺项 |
| `bark.token` | string | 启用 Bark 时必填 | — | 该通道禁用 |
| `theme.title` | string | — | `骏骏消息中转` | 回退默认值 |
| `theme.imgUrl` | string | — | 默认图标 | 非 http/https 时回退默认图标 |
| `theme.category` | string | — | `Trae插件` | 超过 10 字时回退默认分类 |
| `options.timeoutMs` | number | — | `10000` | 夹取到 1000–120000 |
| `options.throttleMs` | number | — | `5000` | 夹取到 0–600000 |
| `options.autoPushTitle` | string | — | `骏骏消息中转` | 回退默认值 |
| `options.autoPushMaxChars` | number | — | `300` | 夹取到 80–1000 |

昵称去掉首尾空格；配置文件**不会**展开 `${ENV_VAR}`，请填写字面量昵称。

> 若三个通道都没配置，工具会返回：
> `❌ 还没有可用的推送通道。`
> 此时可调用 `junjun_transit_setup`，或打开配置页填写。

### 请求细节

| 参数 | 当前实现 | 依据 |
|---|---|---|
| API 地址 | 默认 `https://api.chuckfang.com`，可用 `meow.apiBase` 覆盖 | 官方推荐 HTTPS |
| 请求方法 | `POST` | 正文放 JSON Body，长文本更稳 |
| 请求超时 | 默认 `10000` ms，可配置 | 兼顾慢网络与体验 |
| 消息格式 | `text`（纯文本） | 通知场景以纯文本为主 |
| 分类 | `theme.category`，默认 `Trae插件` | MeoW 限制最多 10 字 |
| 工具节流窗口 | 默认 `5000` ms | 工具被连续误调用时的保护 |
| 自动推送 | 强制开启，每轮调用一次 | 不提供开关，避免「有时不推」 |
| 最小发送间隔 | `3000` ms | 遵守官方「3 秒 1 条」限流 |

---

## 主题设置（本地）

> 云端同步与会员授权不存在。主题完全在本机生效，无需登录。

主题写在 `config.json` 的 `theme` 段：

| 字段 | 说明 |
|---|---|
| `theme.title` | 通知标题，留空使用默认 `骏骏消息中转` |
| `theme.imgUrl` | 自定义图标 URL，留空使用默认图标 |
| `theme.category` | 自定义分类，默认 `Trae插件`，最多 10 字 |

- 主题保存在本机配置文件，不上传任何服务器；
- 默认图标：`https://www.junjunloveprogramming.cn/upload/dsh-junjun-transit-logo.png`；
- 工具推送与自动推送都使用当前主题；
- 站点不可用、断网都不影响本机主题。

---

## 使用

### 工具参数

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `title` | string | — | 消息标题，缺省 `骏骏消息中转` |
| `message` | string | ✅ | 消息内容 |
| `url` | string | — | 点击通知后跳转的链接 |
| `imgUrl` | string | — | 本条消息的通知图标 URL，覆盖主题图标 |

昵称不是 `junjun_transit_send` 的参数 —— 推送目标由配置决定，模型无法在调用时改写。
需要写入昵称时使用 `junjun_transit_setup`，且只应在用户主动提供时调用。
工具会把消息发送到**所有已配置且已启用的通道**（MeoW / SMTP / Bark）。

### 自动推送（强制，无开关）

自动推送**不提供开关**，也不需要征求用户同意：

- 每轮回答结束前，Agent 必须调用一次 `junjun_transit_send`，推送本轮结论摘要；
- 宿主支持 Hooks 时，Stop Hook 会在轮末再兜底一次，30 秒内自动去重，不会重复；
- 用户说「不要推送 / 静音」时本轮跳过，下一轮默认恢复。

正文是模型**最终回答的摘要**：去掉 Markdown、代码块、表格与长路径，截断到 `autoPushMaxChars` 字。

```text
已把验证请求改成 POST，正文走 JSON Body；路径段只保留昵称与标题，不再有斜杠编码问题。
```

推送前会经过内置的**本地总结器**（`server/summarize.mjs`，不调用 LLM）：

- 去掉 Markdown、HTML、代码块、图片、链接与表格；
- 优先在句末截断，避免半句话；
- 输出保证是**纯文本**，不会出现 HTML 标签。

> 为什么不用 LLM 生成总结：Hook 是独立进程，没有可调用的模型；
> 本地抽取式总结既准确又不额外消耗 token，也不需要第二次请求。

**去重**：同一轮里若 Agent 已推送过，宿主 Hook 在 30 秒内会跳过，避免一条任务收到两条。

### 推送通道（MeoW / SMTP / Bark）

三种通道**按配置自动启用**，不需要二选一：

| 通道 | 启用条件 | 说明 |
|---|---|---|
| MeoW 推送 | 昵称非空 | 手机通知，支持本地主题与自定义分类 |
| 邮件推送（SMTP） | 服务器、发件人、收件人已填 | 把同一份中文摘要作为纯文本邮件发送 |
| Bark 推送 | token 已填 | 通过全能消息推送 Bark JSON API 发送 |

- 只配好一种：只走这一种；
- 配好多种：**同时发送**，任意一种成功即视为整体成功，失败通道会在结果里注明；
- 配置页每个通道旁有**红绿灯**：绿色=已配置，红色=未配置；
- 三种都未配置时，工具会提示先配置至少一种。

SMTP 配置项：服务器、端口、加密方式（SSL/TLS 465、STARTTLS 587、不加密 25）、
用户名、密码、发件人邮箱、收件人邮箱。

Bark 配置项：token、通知标题、通知图标 URL、发送者名称。
`msgType` 固定为 `1`（个人信息），`issecure` 固定为 `0`，不需要手填；
默认使用个人推送端点 `sendMsg3_New.php`。
Bark 的通知标题与图标 URL 留空时，自动使用本地主题的标题与默认图标。

- 配置文件含 SMTP 密码与 Bark token，`status` 工具只显示脱敏值；
- 邮件正文固定 UTF-8 纯文本（base64 传输），主题按 RFC 2047 编码；
- Bark 发送 JSON，成功码 `80000000`，错误码会转成中文提示；
- 后续增加通道只需在发送分发处追加实现。

### 手动推送

直接对 Agent 说：

```text
把这次的结果推送到我配置的渠道
```

插件同时向系统提示注册了使用约定，因此 Agent 也会在完成实质任务后主动推送一条**带语义总结**的通知。
模型那条在轮内发出，Hook 那条在轮末补位，所以摘要总是排在最后。

### 命令行验证 MeoW 昵称

排障时可绕过插件直接确认 MeoW 昵称与网络（只验证 MeoW 通道）：

```bash
# Linux / macOS
curl -sS "https://api.chuckfang.com/你的昵称/测试/hi"

# Windows PowerShell
curl.exe -sS "https://api.chuckfang.com/你的昵称/测试/hi"
```

---

## 工作方式

```text
┌─ MCP 服务 server/index.mjs（Node，stdio）
│    loadConfig → 注册工具 send / setup / status / open_settings
│    启动时 bootstrap：装技能 + 合并 Stop Hook
│
├─ 技能 ~/.trae-cn/skills/trae-junjun-transit/SKILL.md
│    约定何时推送、如何排障，由 Agent 按需加载
│
├─ Stop Hook ~/.trae-cn/hooks.json
│    hook.mjs 读 stdin 后立即退出 → hook-worker.mjs 后台推送最终回答
│
└─ 配置页 web/settings.html（仅 127.0.0.1，随机 token）
```

配置从页面到生效的路径：

| 步骤 | 执行者 |
|---|---|
| 1. 用户在配置页填值并保存 | 浏览器 |
| 2. `POST /api/save?k=<token>` | 本地配置页服务 |
| 3. 合并写入 `config.json` | `applyConfigPatch()` |
| 4. 下一次工具调用重新读取配置 | `loadConfig()` |
| 5. 字段归一化与通道校验 | `config.mjs` |

### 三个组成部分

| 命令 / 文件 | 产出 | 说明 |
|---|---|---|
| `server/index.mjs` | MCP 工具 | 注册四个工具；stdio 协议实现见 `server/mcp.mjs` |
| `server/hook.mjs` | Stop Hook 入口 | 立即返回，推送交给 detached 子进程 |
| `web/settings.html` | 配置页 | 零依赖单文件，无构建步骤 |

### 事件与服务依赖

| 依赖 | 用途 |
|---|---|
| Hook 事件 `Stop` | 宿主支持时，轮次结束 → 携带 `last_assistant_message` 兜底推送 |
| 配置页 | 写入昵称、Bark token 与 SMTP 参数 |

自动推送由 **Agent 强制调用**保证：即使宿主不支持 Hooks、或本轮没有最终回复，也必须在结束前调用一次 `junjun_transit_send`。

---

## MeoW API 行为

> 本节内容依据官方文档：**[MeoW Push API 消息推送接口文档](https://www.chuckfang.com/MeoW/api_doc.html)**（REST · v1）。
> 基础地址：`https://api.chuckfang.com/`（官方推荐 HTTPS）或 `http://api.chuckfang.com/`；协议 HTTP / HTTPS，方法 GET · POST。

### 请求形状

本插件固定使用 **POST**，标题放路径，正文放 Body：

```
POST /{昵称}/[title]?url=…&imgUrl=…&category=…&msgType=text
Content-Type: application/json

{ "msg": "内容", "title": "标题", "url": "https://…", "imgUrl": "https://…", "category": "Trae插件" }
```

**GET**（官方支持，本插件不使用）

```
https://api.chuckfang.com/{昵称}/{title}/{msg}?url={url}&imgUrl={imgUrl}&msgType={msgType}&htmlHeight={htmlHeight}&category={category}
# title 可省略
https://api.chuckfang.com/{昵称}/{msg}?...
```

### 参数

| 参数 | 位置 | 必填 | 说明 | 本插件使用方式 |
|---|---|---|---|---|
| 昵称 | 路径 | ✅ | 用户昵称，**不允许包含斜杠** | 配置 `meow.nickname` |
| `title` | 路径 / Body | — | 省略时服务端使用 `MeoW` | 工具参数 `title`，缺省 `骏骏消息中转` |
| `msg` | 路径 / Body | ✅ | 消息内容 | 工具参数 `message` |
| `url` | 查询 / Body | — | 跳转链接（需 URL 编码） | 工具参数 `url` |
| `imgUrl` | 查询 / Body | — | 通知图标 URL，建议 **216×216 PNG**；Body 优先 | 工具参数 `imgUrl` 或主题图标 |
| `category` | 查询 / Body | — | 自定义分类名，去首尾空白后最多 **10 个字**；空表示不分类 | 本地主题 `category`，默认 `Trae插件` |
| `msgType` | 请求参数 | — | `text`（默认，纯文本）或 `html`（App 内渲染） | 固定 `text` |
| `htmlHeight` | 请求参数 | — | 仅 `msgType=html` 生效，像素，默认 `200` | 固定 `200`（当前不发送） |

`msgType` 与 `htmlHeight` 是**请求参数**（查询串），不属于 JSON 参数。

分类补充规则（官方文档）：

- JSON Body 中的 `category` 优先于查询参数；空字符串/纯空白会清除分类；
- 去除首尾空白后最多 10 个字，超出返回业务 `status: 400`，不会自动截断；
- 分类名不能包含换行或控制字符；支持新版 App 的「自定义分类」分组。

### 响应

```jsonc
// 文档形状
{ "status": 200, "message": "推送成功" }

// 实测形状（字段名是 msg，本插件两者都兼容）
{ "status": 200, "data": true, "msg": "发送成功" }
```

**HTTP 状态码恒为 200** —— 成败以 JSON 的 `status` 字段为准：

| `status` | 含义 | 插件分类 | 提示要点 |
|---|---|---|---|
| `200` | 操作成功 | — | 返回 `✅` |
| `400` | 标题或消息参数错误 | `http` | 检查标题/内容是否符合要求 |
| `403` | 内容策略禁止发送 | `forbidden` | 内容被策略拦截 |
| `404` | 昵称未注册 | `nickname` | 检查 `meow.nickname` 是否与 App 内昵称完全一致 |
| `429` | 发送或 IP 频率超限 | `ratelimit` | 见下方限流说明 |
| `500` | 服务器错误 | `server` | 稍后重试 |

### 限流（重要）

官方「通用说明」规定，非会员的发送上限为：

| 窗口 | 上限 |
|---|---|
| 3 秒 | 1 条 |
| 1 分钟 | 15 条 |
| 1 小时 | 60 条 |
| 1 天 | 1000 条 |

超出任一限制返回业务状态码 `429`。本插件的应对：

- **客户端最小间隔保护**：两次成功推送之间强制间隔 **3 秒**（`MIN_SEND_INTERVAL_MS`），避免每轮自动推送把 3 秒窗口打满
- **`429` 单独分类**，提示里直接给出上述阈值与降低频率的建议
- 仍可能触达分钟/小时上限 —— 高频长会话下请留意手机通知数量，必要时对 Agent 说「静音」

> 官方另提示：**尽量不要通过多人共享的公共出口 IP** 请求推送接口，可能被判定为攻击行为；
> 可信 IP 可联系开发者申请白名单。

### 路径段中的斜杠

官方文档明确「昵称不允许包含斜杠」；实测 URL **路径段**里的 `/` 编码后是 `%2F`，
而 MeoW 前置的 Tomcat 默认拒绝它（`ALLOW_ENCODED_SLASH=false`），
会在请求到达应用前返回 `HTTP 400`：

| 请求形状 | 结果 |
|---|---|
| 路径段含 `%2F`（内容里有 `/`） | ❌ 400 |
| `/` 换成全角 `／` 或 `_` | ✅ 200 |
| 查询串含 `%2F`（`?url=a%2Fb`） | ✅ 200 |

因此昵称与标题会先做全角替换再编码：
`/`→`／`、`\`→`＼`、`"`→`＂`、`'`→`＇`、`<`→`＜`、`>`→`＞`、`%`→`％`。
选全角而非删除是为了保留可读性：`72 通过 ／ 0 失败` 仍能看懂。

> 本插件用 POST，路径段只剩昵称与可选标题，正文放 Body，可完全避开这个问题。

### 工具返回值

成功：

```
✅ 通知已推送到 MeoW：{title} - {message}
```

失败时返回 `❌` 开头的中文说明，按分类给出建议（分类与官方 `status` 语义一一对应）：

| 分类 | 触发条件 | 示例 |
|---|---|---|
| `invalid` | `message` 为空，或昵称为空 | `⚠️ 推送失败：message 不能为空。` |
| 被取消 | 调用被上游中止 | `⚠️ 推送已取消：调用在开始前被中止。` |
| 被节流 | `throttleMs` 内重复调用工具 | `⚠️ 推送已节流：5000ms 内只能推送一次，请 3214ms 后重试。` |
| `timeout` | 超时未响应 | `❌ 推送超时：MeoW 在 10000ms 内未响应…` |
| `aborted` | 取消信号触发 | `❌ 推送已取消：调用方中止了操作。` |
| `network` | DNS / 连接失败 / 代理问题 | `❌ 推送失败：无法连接 MeoW（fetch failed）…` |
| `http` | HTTP 非 2xx，或官方 `status: 400` | `❌ 推送失败：MeoW 判定标题或消息参数错误（status 400）…` |
| `forbidden` | 官方 `status: 403` | `❌ 推送被拒绝：内容策略禁止发送（status 403）` |
| `nickname` | 官方 `status: 404` | `❌ 推送失败：MeoW 昵称未注册（status 404）…` |
| `ratelimit` | 官方 `status: 429` | `❌ 推送被限流（status 429）… 非会员上限为 3 秒 1 条、每分钟 15 条、每小时 60 条…` |
| `server` | 官方 `status: 500` 或其他业务码 | `❌ 推送失败：MeoW 服务器错误（status 500）…` |
| `unknown` | 其他未预期错误 | 回显原始错误消息 |

其他保证：

- **进程级节流**：仅成功推送才计入；同一进程内 `throttleMs` 窗口内的重复工具调用会被拒绝
- **全局最小间隔**：两次成功发送之间至少间隔 3 秒（遵守官方限流）
- **自动推送不受工具节流限制**，改为 30 秒去重，避免与手动推送重复
- 服务端返回体超过 300 字符会截断，避免污染上下文

---

## Bark API 行为

> 官方文档：[全能消息推送 Bark API](https://www.ggsuper.com.cn/push/api.html)
> 接口使用 HTTPS，支持离线推送；本插件只使用 **JSON POST 个人推送**。

### 端点

| 用途 | 方法 | 端点 |
|---|---|---|
| 个人推送（JSON，插件使用） | POST | `https://www.ggsuper.com.cn/push/api/v1/sendMsg3_New.php` |
| 个人推送（表单） | POST | `https://www.ggsuper.com.cn/push/api/v1/sendMsg_New.php` |
| 个人推送（GET） | GET | `https://www.ggsuper.com.cn/push/api/v1/sendMsg2_New.php` |
| 频道推送（JSON，文档提供，插件暂未使用） | POST | `https://www.ggsuper.com.cn/push/api/v1/sendChannelMsg2_New.php` |

### 个人推送参数

| 参数 | 必填 | 说明 |
|---|---|---|
| `title` | 是 | 推送标题 |
| `msg` | 是 | 推送内容 |
| `token` | 是 | 接收端客户端注册的 token |
| `issecure` | 是 | 固定值 `0` |
| `url` | 否 | 点击通知跳转链接 |
| `msgType` | 否 | `0` 频道消息 / `1` 个人信息 / `2` 其他信息，默认 `1` |
| `icon` | 否 | 通知图标，必须是 **https** 图片地址；鸿蒙离线图标需 ≤192KB |
| `sender` | 否 | 发送者名称，默认匿名消息 |

### 请求示例

```http
POST /push/api/v1/sendMsg3_New.php HTTP/1.1
Host: www.ggsuper.com.cn
Content-Type: application/json

{
  "title": "骏骏消息中转",
  "msg": "已生成构建产物",
  "token": "接收端Token",
  "issecure": 0,
  "msgType": 1,
  "sender": "骏骏通知中转"
}
```

### 成功响应

```json
{
  "code": "80000000",
  "msg": "Success"
}
```

### 错误码

| `code` | 含义 |
|---|---|
| `0` | 发送失败：网络原因或无效数据 |
| `200` | token 错误或失效 |
| `300` | 请求过于频繁（普通用户 1 小时最多 3 条） |
| `400` | 接收对象当天次数已用完 |
| `500` | 已被对方拉黑，消息无法发出 |
| `1000` | 风控检测异常，账号可能已被限制 |
| `100` | 频道推送：每个频道每 3 秒只能发送一次 |

### 插件实际用法

- 只调用 `sendMsg3_New.php`，固定 `issecure: 0`、`msgType: 1`；
- `title` 留空时使用本地主题标题；`icon` 留空时使用本地主题图标；
- token 由用户填写，保存在本机配置文件；
- 请求超时 15 秒；Bark 业务错误码会转成中文提示；
- 频道推送端点与 `channel_id` 在文档中存在，但本插件当前不启用。

---

## 错误排查

### 启动阶段

| 现象 | 原因 | 解决 |
|---|---|---|
| 工具列表里没有四个 `junjun_transit_*` 工具 | MCP 未加载或配置未保存 | 在 设置 → MCP 确认 `trae-junjun-transit` 已启用，然后重启 Trae |
| 技能列表里没有「骏骏通知中转」 | 自动安装未执行或需要重载 | 重启 Trae；确认 `%USERPROFILE%\.trae-cn\skills\trae-junjun-transit\SKILL.md` 存在 |
| `hooks.json` 没有本插件条目 | 自动安装被跳过或文件非合法 JSON | 重启 Trae；若文件损坏，先修正 JSON 再重启，自动配置只在合法结构上追加 |
| 配置页打不开 | 端口被占用或链接过期 | 让 Agent 重新调用 `junjun_transit_open_settings` |
| 重装插件后行为没变 | 已加载的模块不会热更新 | **重启 Trae** |

### 运行阶段

| 现象 | 原因 | 解决 |
|---|---|---|
| `status 400`（标题或消息参数错误） | 标题/内容不符合 MeoW 要求，或路径段编码异常 | 检查 `title` / `message` 是否为空或含非法字符 |
| `HTTP 400 Bad Request` + Tomcat 页面 | 路径段出现 `%2F` | 使用未做全角替换的旧版本；升级并重启 Trae |
| `status 403`（内容策略禁止发送） | 内容被 MeoW 的内容策略拦截 | 调整消息内容后重试 |
| `status 404`（昵称未注册） | 昵称错误或未在 MeoW 注册 | 用 `curl` 或 MeoW App 核对昵称；注意大小写与特殊字符 |
| `status 429`（频率超限） | 触达非会员限流（3 秒 1 条 / 分 15 / 时 60 / 天 1000） | 减少连续任务数量，或对 Agent 说「静音」 |
| `status 500` | MeoW 服务端异常 | 稍后重试 |
| `无法连接 MeoW（fetch failed）` | 断网 / DNS / 代理 / 防火墙 | 确认能访问 `api.chuckfang.com`；如走代理，为 Trae 进程配置 `HTTP_PROXY` / `HTTPS_PROXY` |
| `推送超时` | 网络、MeoW、SMTP 或 Bark 响应慢 | 检查网络；MeoW 默认 10 秒，SMTP/Bark 默认 15 秒 |
| `SMTP 推送失败：…` | SMTP 认证失败、端口/加密不匹配或被拒收 | 检查账号密码、465 SSL / 587 STARTTLS、发件人与收件人地址 |
| `Bark 发送失败（200）` | Bark token 错误或失效 | 在 Bark App 重新复制 token 并保存 |
| `Bark 发送失败（300）` | Bark 频率超限 | 降低推送频率；普通用户 1 小时最多 3 条 |
| `Bark 发送失败（400/500/1000）` | 当日次数用完 / 被拉黑 / 风控限制 | 按提示检查 Bark 账号状态 |
| `还没有可用的推送通道` | 三种通道都未配置 | 至少填写 MeoW 昵称、SMTP 或 Bark token 中的一种 |
| `推送已节流` | `throttleMs` 内重复调用**工具** | 等待提示的毫秒数。自动推送不受此限制 |
| 通知图标没变 | 传入的 `imgUrl` 不是可公开访问的图片 | 使用公网可访问的 URL，建议 216×216 PNG |
| 某些回合没有自动推送 | 技能未加载，或 MCP 指令未生效 | 重启 Trae 让技能与 MCP 重新加载；确认对话中已选中本插件 |
| 自动推送正文只有开头一段 | 最终回答被去掉代码块并截断到 `autoPushMaxChars` | 属预期行为，可调大该值 |
| 推送成功但手机没收到 | MeoW/Bark App 未登录、通知权限被关、免打扰 | 先看 MeoW 或 Bark 的**消息列表**：有记录说明投递成功，只是通知未弹出 |

---

## 开发与测试

```bash
node test/smoke.mjs    # 冒烟测试：MCP 协议 + 自动配置 + 配置页 + Hook
```

测试覆盖 **11 个用例**：

| 用例 | 覆盖内容 |
|---|---|
| `initialize 握手` | MCP 协议版本、服务信息 |
| `ping` | 空响应心跳 |
| `tools/list 返回四个工具` | 工具清单与 `send` 的必填参数 |
| `status 生成并读取配置模板` | 模板字段、强制推送说明 |
| `自动安装技能与 Stop Hook（保留已有配置）` | 只追加、不覆盖、`.bak` 备份 |
| `未配置通道时 send 返回指引` | 空配置降级提示 |
| `setup 一键写入配置且不重复装 Hook` | 配置合并、幂等性 |
| `未知工具返回 JSON-RPC 错误` | 错误码与文案 |
| `MeoW 编码 / 脱敏 / 限流窗口 / 摘要压缩` | 纯函数边界 |
| `配置页：页面 / token 校验 / 保存 / 脱敏状态` | 本地配置页 API |
| `Stop Hook 空回复快速退出` | Hook 入口不阻塞 |

### 目录结构

```text
trae-junjun-transit/
├── .trae-plugin/plugin.json        # 插件清单
├── .mcp.json                       # MCP 声明
├── package.json                    # 零依赖，仅用于元信息
├── skills/trae-junjun-transit/SKILL.md  # 技能：使用约定与排障
├── hooks/hooks.example.json        # Stop Hook 配置样例
├── server/
│   ├── index.mjs                   # MCP 入口：四个工具
│   ├── mcp.mjs                     # 极简 MCP stdio 协议实现
│   ├── config.mjs                  # 配置模板、加载与归一化、旧配置迁移
│   ├── bootstrap.mjs               # 自动安装技能 / Hook、一键写配置
│   ├── push.mjs                    # 多通道分发与结果聚合
│   ├── meow.mjs                    # MeoW 通道
│   ├── smtp.mjs                    # 零依赖 SMTP 客户端
│   ├── bark.mjs                    # Bark 通道
│   ├── hook.mjs                    # Stop Hook 入口（立即返回）
│   ├── hook-worker.mjs             # 后台推送最终回答
│   ├── settings.mjs                # 本地配置页服务（仅 127.0.0.1）
│   ├── summarize.mjs               # 最终回答压缩
│   └── state.mjs                   # 与手动推送去重
├── web/settings.html               # 可视化配置页（零依赖单文件）
└── test/smoke.mjs                  # 冒烟测试
```

### 发布

```bash
# 打包整个插件目录为 zip，作为本地插件导入
Compress-Archive -Path .\* -DestinationPath ..\trae-junjun-transit.zip

git tag v0.1.0
git push origin v0.1.0    # 随后在 GitHub 创建 Release 并上传压缩包
```

---

## 设计说明

面向二次开发者的取舍说明。

1. **配置不合法时返回错误，而不是让服务崩溃**
   MCP 服务是常驻进程，抛异常会让四个工具一起不可用。
   单个通道配置非法只禁用该通道，其余通道照常工作，错误文案直接说明缺哪一项。

2. **`nickname` 不进 `send` 入参**
   推送目标是安全边界，只能由使用者通过配置决定，不能让模型在调用时改写。
   需要写入昵称时走 `junjun_transit_setup`，且由用户主动提供。

3. **不引入任何第三方依赖**
   Trae 的 MCP 服务安装位置不保证能解析额外包。协议层、SMTP、配置、配置页全部手写，
   只使用 Node 标准库，避免版本漂移与安装失败。

4. **自动推送采用「强制指令 + 可选 Hook」两层**
   仅靠提示词让模型自觉调用工具是概率性合规，因此 MCP 握手时通过 `instructions`
   与技能双重声明「每轮必须推送」，不提供关闭选项；宿主支持 Hooks 时再在轮末兜底。
   Hook 层刻意绕过工具级节流，改为按状态文件去重（30 秒）。

5. **业务结果分别以各通道协议为准**
   MeoW 依据 [官方文档](https://www.chuckfang.com/MeoW/api_doc.html)，HTTP 状态码恒为 200，
   成败在 JSON 的 `status` 字段；Bark 依据 [Bark API](https://www.ggsuper.com.cn/push/api.html)，
   `code=80000000` 成功；SMTP 以协议响应码为准。三者都转成统一的中文结果提示。

6. **对话总结不调用 LLM**
   Hook 是独立进程，没有可用的模型，也没有必要为一个通知再跑一次推理。
   直接清洗最终回答，剥离代码块与标记，输出适合锁屏阅读的纯文本。

7. **测试针对真实协议**
   测试通过 stdio 启动真实的 MCP 服务，用 JSON-RPC 调用工具，
   而不是只测内部函数，确保宿主能用的路径与测试路径一致。

8. **自带配置页**
   Trae 插件没有内置设置页机制。若不做配置页，用户只能手改 JSON；
   因此服务内置一个只监听 `127.0.0.1` 的临时页面，随机 token 保护，用完自动关闭。

9. **自动安装技能与 Hook**
   Trae 的 Hook 配置在用户目录，无法由插件清单声明。服务启动时只「追加」自己的条目，
   并在改动前备份，既做到零配置，又不破坏用户已有的 Hook。

---

## 安全建议

- **`config.json` 包含明文凭据**：昵称本身不是密钥，但 SMTP 授权码与 Bark token 是，请勿提交到 Git 或分享
- **默认走 HTTPS**：MeoW 使用 `https://api.chuckfang.com`，Bark 使用 `https://www.ggsuper.com.cn`；SMTP 建议使用 SSL/TLS 或 STARTTLS
- **不要在通知正文里放密钥**：通知会经第三方服务传输，并在手机锁屏上可见
- **配置页链接等同临时凭据**：页面只监听本机并带随机 token，但仍不要截图或转发链接
- **昵称会明文存在配置文件中**：分享该文件前请先抹掉昵称、token 与密码

---

## 作者

| 角色 | 姓名 |
|---|---|
| 作者 | **骏骏爱编程** |
| 技术支持 | **方程 chuckfang**（MeoW API 与 MeoW App） |
| 技术支持 | **佛山七只猪科技有限公司**（Bark API 与全能消息推送 Bark） |

---

## 反馈

| 类型 | 联系方式 |
|---|---|
| 项目反馈（插件本身的问题、建议、使用疑问） | [junjunloveprogramming@junjunloveprogramming.cn](mailto:junjunloveprogramming@junjunloveprogramming.cn) |
| 开源协作（Bug、功能建议、Pull Request） | [GitHub Issues](https://github.com/JunJunLoveProgramming/trae-junjun-transit/issues) |
| MeoW App 反馈（推送未送达、账号问题、App 功能建议） | [chuckfang@qq.com](mailto:chuckfang@qq.com) |
| QQ用户沟通群（群号 **1026696694**） | [点击加入](https://qm.qq.com/q/xXDYAyFI40) |

上文表格里的「点击加入」直接进群；也可以在 QQ 里搜索群号 **1026696694** 手动申请加入。
群里可以直接提问、反馈问题、交流用法。

提交项目问题时，建议附上以下信息以便快速定位：

- Trae 版本与操作系统
- `config.json` 的 `meow` / `options` 段（**请先抹掉昵称、token 与密码**）
- 启动日志里与 `trae-junjun-transit` 相关的行
- 推送失败时的完整返回文案（例如 `❌ 推送失败：MeoW 返回 HTTP 400…`）

> 若「推送成功但手机没收到」，请先查看 **MeoW App 内的消息列表**：
> 列表中有记录说明已投递成功，问题在手机通知权限或免打扰设置；
> 列表中没有记录再联系 MeoW App 反馈邮箱。

---

## 许可

[MIT](LICENSE) © 2026 骏骏爱编程
