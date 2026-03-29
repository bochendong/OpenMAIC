# 课程设置与生成效果对照

本文说明在课程页/创建页可配置项，分别如何影响「新建笔记本」与「内容生成」。

另见：`docs/notebook-generation-sidebar-options.md`，用于说明课程总控聊天页右侧栏的生成选项与实际调用链。

## 一、课程层设置（`CourseDetailPage` / 编辑课程）

| 设置项 | 来源 | 作用阶段 | 具体效果 |
|---|---|---|---|
| 课程用途 `purpose` (`research` / `university` / `daily`) | 课程编辑 | 大纲生成（outlines） | 控制风格与测验倾向：科研/日常默认少测验，大学课程可加入作业/考试导向与前置知识约束。 |
| 课程标签 `tags` | 课程编辑 | 大纲生成 + 元数据生成 | 作为个性化提示，优先对齐术语与示例（例如科研向、深度学习、Python）。 |
| 课程描述 `description` | 课程编辑 | 大纲生成 + 元数据生成 | 作为边界提示，帮助模型聚焦范围与表达口径。 |
| 学校 `university` | 课程编辑（大学课程） | 大纲生成 + 元数据生成 | 作为课程上下文，约束前置知识与课程语境。 |
| 课程代码 `courseCode` | 课程编辑（大学课程） | 大纲生成 + 元数据生成 | 用于学期课程语境补充（例如同名课程分不同代码）。 |
| 课程语言 `language` | 课程编辑 | 大纲生成 + 元数据生成 | 辅助约束术语与文本语言一致性（最终仍以生成要求语言为准）。 |

## 二、创建页设置（`/create`）

| 设置项 | 来源 | 作用阶段 | 具体效果 |
|---|---|---|---|
| 需求文本 `requirement` | 创建页输入框 | 全流程 | 主输入，决定主题、深度、结构。 |
| 语言 `language` (`zh-CN` / `en-US`) | 创建页 | 全流程 | 强约束输出语言。 |
| Web 搜索开关 `webSearch` | 创建页 | 大纲生成前置分析 | 开启后可注入外部检索结果，提高时效性与事实覆盖。 |
| PDF 文件 | 创建页上传 | 大纲生成上下文 | 提供 PDF 文本与图片上下文，影响章节组织、示例与配图建议。 |

## 三、已接入的个性化传递链路

1. `CourseDetailPage -> /create?courseId=...` 绑定课程容器。
2. `app/create/page.tsx` 将 `courseId` 写入 `generationSession`。
3. `app/generation-preview/page.tsx` 读取课程信息并构造 `courseContext`：
   - `name / description / tags / purpose / university / courseCode / language`
4. `courseContext` 同时传入：
   - `/api/generate/scene-outlines-stream`
   - `/api/generate/notebook-metadata`
5. `requirements-to-outlines` 提示词包含：
   - `purposePolicy`
   - `courseContext`
   并明确“课程上下文优先于通用默认值”。

## 四、示例：设置到效果

- 设置：`purpose=research`, `tags=[科研向, 深度学习, Python]`  
  效果：章节偏方法论/实验流程，测验数量减少，示例更偏科研语境与代码实践。

- 设置：`purpose=university`, `university=XXX大学`, `courseCode=CS101`  
  效果：更强调前置知识与作业/考试导向，表述更贴近课程制学习场景。

- 设置：`purpose=daily`, `tags=[零基础, 兴趣向]`  
  效果：语气更口语化，降低抽象度，减少高压测验倾向，偏易懂案例。

## 五、注意事项

- 课程设置是“护栏与偏好”，不会覆盖用户明确需求文本。
- 如果课程标签与需求冲突，系统会优先满足需求，再尽量保留课程语境。
- 元数据（名称/描述/tags）与大纲会同步参考课程上下文，减少“同课程下笔记本风格漂移”。
