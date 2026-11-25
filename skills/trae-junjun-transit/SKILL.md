---
name: trae-junjun-transit
version: 0.1.0
description: "骏骏通知中转：把任务结果推送到鸿蒙 MeoW 手机、SMTP 邮箱或 Bark。当用户说「推送到手机 / 发我邮箱 / 完成后提醒我 / 通知我结果」，或刚完成改代码、跑测试、构建、部署等实质任务需要告知结果时使用；也用于查看和排查推送配置。"
description_en: "JunJun Transit: push task results to a HarmonyOS phone via MeoW, to a mailbox via SMTP, or via Bark. Use when the user asks to push, notify, remind, or email the result, after finishing substantial work, or to inspect and troubleshoot notification configuration."
---

# 骏骏通知中转（trae-junjun-transit）

把 Agent 的执行结果推送到用户身边的设备：鸿蒙 MeoW 手机通知、SMTP 邮件、Bark。
三种通道按配置自动启用，配好多个就同时发送。

## 何时使用

- 用户明确要求「推送 / 通知 / 提醒 / 发邮件 / 发到手机」→ 调用 `junjun_transit_send`。
- **每一轮回答结束前都必须调用一次** `junjun_transit_send`（强制，不需要询问用户），包括问答与只读分析。
- 用户问「配置好了吗 / 为什么没收到 / 怎么配置」→ 调用 `junjun_transit_status`。
- 用户第一次使用，或说「帮我配好通知」→ 调用 `junjun_transit_setup`。
- 用户说「打开设置 / 配置界面 / 可视化配置」→ 调用 `junjun_transit_open_settings`。

## 一键配置（推荐）

用户不需要手改任何 JSON。有两种方式：

- **可视化**：调用 `junjun_transit_open_settings`，浏览器会打开本地配置页，用户自己填昵称并点「保存并测试」。
- **对话式**：用户直接告诉你昵称 / token，调用 `junjun_transit_setup` 写入。

`junjun_transit_setup` 会同时把技能自动装好；宿主支持 Hooks 时会附带安装 Stop Hook 作为兜底。

1. 只问必需信息：想用哪种通道（MeoW 昵称 / Bark token / 邮箱），不要一次问一堆。
2. 调用 `junjun_transit_setup`，例如 `{ "meowNickname": "小明" }`。
3. 回复里**不要**复述密码或 token，只说「已配置」；如果技能安装失败，提醒用户重启 Trae。
4. 用户已配置过、只想改某一项时，同样调用该工具，只传要改的字段。

只有用户明确要求手动编辑文件时，才使用下面的配置文件方式。

## 何时不要使用

- 用户明确说「不要推送 / 静音 / 别发通知」——本轮跳过，下一轮默认恢复。
- 同一次回答里已经调用过 `junjun_transit_send`（一次回答只推一条）。
- 正文里会包含密码、token、密钥、身份证号等敏感信息。

## 配置

配置文件路径：

- Windows：`%USERPROFILE%\.trae-cn\trae-junjun-transit\config.json`
- macOS / Linux：`~/.trae-cn/trae-junjun-transit/config.json`
- 也可用环境变量 `JUNJUN_TRANSIT_CONFIG` 指定其他路径。

首次调用任意工具会自动生成配置模板，并自动安装技能与自动推送 Hook。**至少配置一种通道**：

| 通道 | 必填字段 | 说明 |
|---|---|---|
| MeoW | `meow.nickname` | 鸿蒙手机安装 MeoW App 后设置的用户昵称 |
| SMTP | `smtp.host`、`smtp.fromEmail`、`smtp.toEmail` | 端口 465 用 `tls`，587 用 `starttls`，25 用 `none` |
| Bark | `bark.token` | 全能消息推送 Bark App 里的客户端 token |

可选主题：`theme.title`（默认「骏骏消息中转」）、`theme.imgUrl`、`theme.category`（默认「Trae插件」，最多 10 字）。
行为参数：`options.timeoutMs`（默认 10000）、`options.throttleMs`（默认 5000，0 表示关闭节流）。

修改后**保存即生效**，每次工具调用都会重新读取文件，无需重启 Trae。

> 配置文件里有明文密码与 token。不要用 Read 工具整篇读取后原样输出给用户，也不要把它提交到 Git。

## 工具

### junjun_transit_open_settings

在本机浏览器打开可视化配置页（只监听 127.0.0.1）。用户可以在页面上填写 MeoW 昵称、Bark token、SMTP，并点「保存并测试」。打开后把链接告诉用户即可，不要读取页面内容。

### junjun_transit_send

| 参数 | 必填 | 说明 |
|---|---|---|
| `message` | 是 | 通知正文，建议一两句中文 |
| `title` | 否 | 通知标题，缺省用配置里的主题标题 |
| `url` | 否 | 点击通知后跳转的链接 |
| `imgUrl` | 否 | 本条消息的通知图标 URL（Bark 要求 https） |

正文写法要求：

- 中文纯文本，不使用 Markdown、代码块、表格、长文件路径。
- 说清「做了什么 + 结果如何」，例如：`登录模块已改成 POST，12 项单元测试全部通过。`
- 控制在 300 字以内；长内容由你自行压缩成结论。
- 推送目标是用户本机配置决定的，**不要**在参数里尝试指定昵称或收件人。

### junjun_transit_status

只读。返回配置文件位置、各通道是否已配置、主题信息与需要修正的问题。
不会回显完整密码或 token（只显示脱敏值）。用户第一次使用或排障时先调用它。

## 自动推送约定（强制）

自动推送不提供开关，也不需要征求用户同意：

1. **每一轮回答结束前必须调用一次** `junjun_transit_send`，推送本轮结论摘要。
2. 一次回答只推一条；同一轮已经推送过就不要再调用。
3. 用户明确说「不要推送 / 静音」时，本轮跳过；下一轮默认恢复。
4. 未配置通道时也要调用一次：工具会返回配置指引，再把「怎么配」简短告诉用户。
5. 推送失败不重试超过一次；在回复里简短说明失败原因。
6. 返回「⚠️ 推送已节流」时说明 5 秒内刚推过：任务已结束就直接跳过，不要等待后再推。
7. 宿主支持 Stop Hook 时会自动兜底；工具推送后会写入去重状态，Hook 在 30 秒内自动跳过，不会重复。

## 结果与排障

| 返回 | 含义 | 处理 |
|---|---|---|
| `✅ 通知已推送到 …` | 成功 | 正常结束 |
| `❌ 还没有可用的推送通道` | 三个通道都没配 | 调用 `junjun_transit_setup`；或让用户提供昵称/token |
| `status 404 / 昵称未注册` | MeoW 昵称错误 | 提醒用户核对 MeoW App 里的昵称，大小写和特殊字符都要一致 |
| `status 429 / 被限流` | 发送太频繁 | 不要重试；告诉用户 MeoW 非会员限制为 3 秒 1 条 |
| `推送超时` / `无法连接 MeoW` | 网络、代理或 DNS | 提醒检查网络；可调大 `options.timeoutMs` |
| `SMTP 推送失败` | 服务器、端口、加密方式或授权码错误 | 对照 `smtp.encryption` 与端口；QQ/163 邮箱要用授权码而不是登录密码 |
| `Bark token 错误或已失效` | token 不对 | 让用户在 Bark App 里重新复制 token |
| `配置文件不是合法 JSON` | 手改出错 | 指出错误位置，让用户修正逗号或引号 |

## 安全边界

- 不要读取并原样展示配置文件里的 `smtp.password`、`bark.token`。
- 不要让用户在对话里粘贴密码或 token；引导他们在本机编辑配置文件。
- 推送正文不要包含密钥、内网地址、身份证号等敏感内容。
