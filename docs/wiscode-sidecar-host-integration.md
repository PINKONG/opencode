# WisCode Sidecar 宿主端嵌入集成指南

本文为已实现功能的接入约定，面向通过 iframe 嵌入 WisCode 的宿主前端。宿主只需发送数据，无需握手、sessionID、版本号或回执处理。

## 1. 发送数据

保留现有 sidecar URL 和 embed_session 认证。iframe 加载完成后，或页面数据变化时发送：

```js
const iframe = document.querySelector("#wiscode")
const sidecarOrigin = new URL(iframe.src, document.baseURI).origin

function sendContext(data) {
  iframe.contentWindow?.postMessage(
    { type: "wiscode.context.update", data },
    sidecarOrigin,
  )
}

// 替换成宿主自己的业务数据，字段不限。
sendContext({
  pageId: "700d5e2aaa044ad6b1defab897d07b92",
  upFuncPermissionCode: "F_f15017521198484285eda0eb2c5ed5c5",
  eventInfo: {
    name: "onChange",
    title: "内容改变事件（onChange）",
    code: {
      version: 1792575165391,
      commitMessage: null,
      script: "console.log('开始执行【请假类型】的onChange....');",
      updated: false,
      eventId: "00a6f8feed6a4a889d061bb2e5881162",
      id: "607102d9643c4b979becc93ed2d03152",
    },
  },
})
```

上例在 iframe 已加载后调用。首次发送可放在已有的 iframe load 回调里；无需额外监听 WisCode 的 ready 消息。load 前发送可能丢失，浏览器不会缓存尚无接收器的消息。iframe URL 若发生跨 origin 重定向，应使用最终 sidecar 页面的 origin。

## 2. 替换与清空

- 每次发送完整对象，不是增量 patch；未包含的旧字段会被删除。
- 根值必须是对象，支持嵌套对象、数组和 JSON 基本类型。
- 数据最多 256 KiB（UTF-8 JSON），最大嵌套深度 20；总对象键数及单数组长度分别不超过 10,000。超限拒绝，不自动截断代码。
- 不传函数、循环引用、undefined、BigInt 或 NaN 等非 JSON 值。
- 清空时调用 `sendContext({})`。

## 3. 刷新与会话

iframe 刷新或重新打开无需重新握手，也无需仅因刷新就重发数据。同一 WisCode 会话会复用已保存的快照；页面数据变化时再发送最新对象。

当前 iframe 最近收到的数据会由 WisCode 自动绑定到新建或切换的会话，宿主不需要感知会话切换。新打开的 iframe 如果没有收到数据，且当前会话没有保存过快照，就没有业务上下文。

未保存的数据可能随刷新丢失。没有新数据时复用的是上次快照，WisCode 无法知道宿主页面是否已经变化；业务数据更新时应重新发送。

## 4. 保存结果

当前版本不发送回执，宿主不需要监听。WisCode 在内部完成校验和保存；还没有会话时先保留最近一次数据，绑定会话后再保存。失败时宿主可以重新发送当前完整对象。

## 5. 基本边界

targetOrigin 使用实际 sidecar 页面的精确 origin，不用 `*`。宿主地址不需要提前登记；WisCode 内部校验 parent source 并绑定首次有效消息的 origin。常规 HTTP/HTTPS 内网宿主受支持，产生不透明 origin 的 sandbox 嵌入不在首版支持范围。

元数据不放 URL，不传密码或访问令牌。数据会进入模型上下文；代码仅作为分析材料，不会被桥直接执行，业务权限标识也不改变 WisCode 工具权限。

## 6. 联调检查

1. 使用有效的 embed_session，iframe 正常加载后发送 type+data。
2. 确认 Skill 能读取页面和事件字段，不需要握手或回执监听。
3. 更新完整对象后旧字段消失，发送 {} 后上下文清空。
4. 刷新同一会话不重发仍能复用快照，切换会话自动绑定本 iframe 最近数据。
