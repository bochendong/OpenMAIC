# 笔记本生成侧边栏选项与实际逻辑对照

本文只覆盖课程总控聊天页右侧栏中的「生成笔记本」选项，也就是 `OrchestratorGenerateOptionsPanel` 这一组配置。

对应入口：

- UI 面板：`components/chat/orchestrator-generate-options-panel.tsx`
- 状态 store：`lib/store/orchestrator-notebook-generation.ts`
- 发送入口：`components/chat/chat-page-client.tsx`
- 主生成任务：`lib/create/run-notebook-generation-task.ts`

## 一、总链路

1. 用户在右侧栏修改选项。
2. 选项写入 `useOrchestratorNotebookGenStore`，并持久化到本地存储。
3. 点击生成后，`chat-page-client` 读取 store，将选项打包进 `runNotebookGenerationTask(...)`。
4. 任务再把这些选项分发到：
   - 元数据生成 `/api/generate/notebook-metadata`
   - 大纲生成 `/api/generate/scene-outlines-stream`
   - 请求头中的媒体能力开关
5. 大纲生成 prompt 决定场景类型、数量、例题密度、是否规划 quiz、是否允许 AI 配图。
6. 后续 `scene content / actions` 主要消费已经生成好的 outlines。

可以把它理解成：

`侧边栏 UI -> orchestrator store -> runNotebookGenerationTask -> metadata / outlines -> scene content / actions`

## 二、每个选项的真实作用

| 选项 | UI / store | 传递位置 | 实际影响 | 当前状态 |
|---|---|---|---|---|
| 本次生成模型 | `modelIdOverride` + 当前全局模型回退 | 请求头 `x-model` -> notebook 生成路由 | 允许本次 notebook 创建覆写 OpenAI 模型 ID，仍复用系统托管 OpenAI Key | 已接通 |
| 课程语言 | `language` | `runNotebookGenerationTask.language` | 影响元数据生成、大纲 prompt、页面内容语言 fallback、最终 `stage.language` | 已完整接通 |
| 篇幅 | `outlineLength` | `outlinePreferences.length` | 影响大纲 prompt 中的场景数量和展开深度策略 | 已完整接通 |
| 例题数量 | `workedExampleLevel` | `outlinePreferences.workedExampleLevel` | 影响大纲 prompt 中 worked-example 序列的数量密度 | 已完整接通 |
| 朗读音色 | `ComposerVoiceSelector` + `useSettingsStore(ttsVoice)` | 播放 / TTS 阶段 | 不影响 notebook 内容生成，只影响后续语音播放或补语音 | 不是生成选项 |
| 联网搜索 | `webSearch` | `runNotebookGenerationTask.webSearch` | 触发 `/api/web-search`，将结果注入 metadata 和 outlines prompt | 已完整接通 |
| AI 生成配图 | `useAiImages` | `imageGenerationEnabledOverride` -> 请求头 -> outlines 本地过滤 | 影响 outlines prompt，并在任务内硬过滤不允许的图片媒体请求 | 已补成硬约束 |
| 包含测验 / 题目页 | `includeQuizScenes` | `outlinePreferences.includeQuizScenes` | 影响 outlines prompt 是否规划独立 `quiz` scene | 已完整接通 |

## 三、详细映射

### 1. 本次生成模型

- UI 入口：`components/chat/orchestrator-generate-options-panel.tsx:91`
- 本次生成 store：`lib/store/orchestrator-notebook-generation.ts:9`
- 发送入口：`components/chat/chat-page-client.tsx:2442`
- 生成任务将选择写入请求头：
  - `lib/create/run-notebook-generation-task.ts:52`
  - `lib/create/run-notebook-generation-task.ts:80`
- 服务端仅对 notebook 创建链路允许模型覆写：
  - `lib/server/resolve-model.ts:1`
  - `app/api/generate/notebook-metadata/route.ts:84`
  - `app/api/generate/scene-outlines-stream/route.ts:223`
  - `app/api/generate/scene-content/route.ts:77`
  - `app/api/generate/scene-actions/route.ts:81`
  - `app/api/generate/agent-profiles/route.ts:81`

当前事实：

- 用户现在可以在侧边栏为“这次 notebook 创建”单独选一个 OpenAI 模型。
- 如果不选，就回退到当前全局模型。
- 服务端仍然使用系统托管的 OpenAI API key 和 base URL，只允许覆写 `modelId`，不接受客户端换 provider 或换 key。

结论：

- 这是 notebook 创建主链里的真实生效选项。
- 目前作用范围仅限 notebook 创建相关生成路由，不会顺带影响其他聊天/批改接口。

### 2. 课程语言

- UI 入口：`components/chat/orchestrator-generate-options-panel.tsx:98`
- store：`lib/store/orchestrator-notebook-generation.ts:9`
- 发送入口：`components/chat/chat-page-client.tsx:2442`
- 元数据生成：
  - `lib/create/run-notebook-generation-task.ts:252`
  - `app/api/generate/notebook-metadata/route.ts:75`
- 大纲生成：
  - `lib/create/run-notebook-generation-task.ts:393`
  - `lib/generation/prompts/templates/requirements-to-outlines/user.md:13`
- scene content fallback：`app/api/generate/scene-content/route.ts:70`

当前事实：

- 它是真正的强约束生成项。
- 会影响标题简介、大纲语言、slide 文本语言以及 stage 的 `language` 字段。

### 3. 篇幅

- UI 入口：`components/chat/orchestrator-generate-options-panel.tsx:110`
- 发送入口：`components/chat/chat-page-client.tsx:2448`
- 任务入参：`lib/create/run-notebook-generation-task.ts:63`
- 大纲 prompt 偏好块：
  - `app/api/generate/scene-outlines-stream/route.ts:46`
  - `app/api/generate/scene-outlines-stream/route.ts:332`
  - `lib/generation/prompts/templates/requirements-to-outlines/user.md:45`

当前事实：

- 这是 outlines 层的结构性开关。
- 它不直接控制后续每页内容怎么排版，而是先控制会规划出多少场景、每个知识点展开到什么程度。

### 4. 例题数量

- UI 入口：`components/chat/orchestrator-generate-options-panel.tsx:129`
- 默认值按课程用途注入：`components/chat/orchestrator-generate-options-panel.tsx:26`
- store：`lib/store/orchestrator-notebook-generation.ts:13`
- 发送入口：`components/chat/chat-page-client.tsx:2451`
- 大纲 prompt 偏好块：`app/api/generate/scene-outlines-stream/route.ts:75`

当前事实：

- 这是 outlines 层的 worked-example 密度开关。
- 会影响模型在大纲阶段安排多少组“老师完整走读的例题 / 证明 / 代码 tracing / 大题拆解”。
- 实际 worked example 的质量，还受到大纲模板约束影响：`lib/generation/prompts/templates/requirements-to-outlines/user.md:99`

### 5. 朗读音色

- UI 入口：`components/chat/orchestrator-generate-options-panel.tsx:154`
- 组件实现：`components/generation/generation-toolbar.tsx:521`
- 写入 settings：
  - `components/generation/generation-toolbar.tsx:530`
  - `lib/store/settings.ts:604`
- 播放阶段使用：
  - `components/stage.tsx:627`
  - `components/stage.tsx:772`

当前事实：

- 它不进入 `runNotebookGenerationTask`。
- 它不影响大纲、页面内容、讲解文本。
- 它只影响后续课堂播放、缓存音频恢复、按需补 TTS。

结论：

- 它更像“播放配置”而不是“内容生成配置”。

### 6. 联网搜索

- UI 入口：`components/chat/orchestrator-generate-options-panel.tsx:162`
- 发送入口：`components/chat/chat-page-client.tsx:2443`
- 任务里触发搜索：
  - `lib/create/run-notebook-generation-task.ts:293`
  - `lib/create/run-notebook-generation-task.ts:610`
- 注入 metadata：`app/api/generate/notebook-metadata/route.ts:94`
- 注入 outlines prompt：
  - `app/api/generate/scene-outlines-stream/route.ts:347`
  - `lib/generation/prompts/templates/requirements-to-outlines/user.md:31`

当前事实：

- 这是完整接通的前置研究开关。
- 打开后会先查外部资料，再把结果喂给 notebook metadata 和 outlines。
- 真正有没有搜到内容，还取决于 web search provider 是否可用。

### 7. AI 生成配图

- UI 入口：`components/chat/orchestrator-generate-options-panel.tsx:170`
- 发送入口：`components/chat/chat-page-client.tsx:2447`
- 任务中转请求头：
  - `lib/create/run-notebook-generation-task.ts:78`
  - `lib/create/run-notebook-generation-task.ts:563`
- outlines 里转成 prompt 约束：
  - `app/api/generate/scene-outlines-stream/route.ts:291`
  - `lib/generation/prompts/templates/requirements-to-outlines/user.md:124`
- downstream 媒体执行：
  - `lib/media/media-orchestrator.ts:30`
  - `lib/server/classroom-media-generation.ts:69`

当前事实：

- 它会先在大纲 prompt 层约束模型不要输出 image `mediaGenerations`。
- 即使模型仍然输出了不该有的图片或视频媒体请求，`runNotebookGenerationTask` 也会在 outlines 返回后按当前有效媒体能力做一次本地过滤，再进入 scene content、sessionStorage outlines 和课堂媒体恢复链路。

结论：

- 现在它已经是 notebook 主生成链路中的硬约束。

### 8. 包含测验 / 题目页

- UI 入口：`components/chat/orchestrator-generate-options-panel.tsx:178`
- 发送入口：`components/chat/chat-page-client.tsx:2450`
- 大纲 prompt 偏好块：`app/api/generate/scene-outlines-stream/route.ts:96`

当前事实：

- 这是 outlines 层的结构开关。
- 关闭后，模型会尽量避免独立 `quiz` scene，而把内容放在 `slide` 或必要的 `interactive` 里。

## 四、当前不一致点

### 1. “本次生成模型”目前只支持 OpenAI 模型覆写

原因：

- 服务端系统配置当前固定为 OpenAI。
- 本次创建只允许覆写 `modelId`，继续沿用系统托管 key。

建议：

- 如果后续要支持 Anthropic / Gemini / 兼容 OpenAI provider 的 per-run 切换，需要把服务端 system LLM 配置从“固定 OpenAI”提升成更通用的运行时模型装配。

### 2. `朗读音色` 混在生成选项里，会误导用户

原因：

- 它不参与 outlines / content / actions 生成。
- 它只属于播放 / TTS 层。

建议：

- 迁到“播放与朗读”分组。
- 或在文案上明确写成“仅影响朗读，不影响页面内容”。

### 3. `AI 生成配图` 已做主链硬过滤，但其他生成入口仍需注意

原因：

- 当前 notebook 总控创建链路已经在 `runNotebookGenerationTask` 内做了过滤。
- 但项目中如果还有别的生成入口绕开了这条任务函数，仍可能只享受到 prompt 层约束。

建议：

- 优先复用 `runNotebookGenerationTask` 这条主链。
- 如果未来新增平行生成入口，也要复用同一套媒体过滤规则。

## 五、推荐的 UI 分组

如果后续要整理右侧栏，我建议拆成三组：

### A. 内容生成

- 课程语言
- 篇幅
- 例题数量
- 联网搜索
- 包含测验 / 题目页
- AI 生成配图

### B. 模型

- 本次生成模型

### C. 播放与朗读

- 朗读音色

## 六、维护原则

- 只要一个选项出现在“生成选项”里，它就应该能在本次 notebook 生成链路里产生可观察影响。
- 如果一个选项只影响播放、TTS、导出或展示，不应和 outlines / scene generation 选项混放。
- 如果一个选项只在 prompt 层生效，文档里要明确写“软约束”；如果还做了本地过滤或服务端硬校验，才能称为“硬约束”。
