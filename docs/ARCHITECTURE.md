# UML OJ 技术架构（草案）

## 1. 总体结构

```text
                    ┌──────────────────────┐
                    │       Web UI         │
                    │  Vue 3 + TypeScript  │
                    └──────────┬───────────┘
                               │
                 ┌─────────────┴─────────────┐
                 │                           │
        ┌────────▼────────┐        ┌─────────▼────────┐
        │ Visual Editor   │        │ Source Editor    │
        │ Structured Data │        │ PlantUML         │
        └────────┬────────┘        └─────────┬────────┘
                 │                           │
                 └─────────────┬─────────────┘
                               │
                    ┌──────────▼───────────┐
                    │   UML IR / Adapters  │
                    │ Canonical Model      │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │     Test Runner      │
                    │ Deterministic Tests  │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  Submission Report   │
                    └──────────────────────┘
```

## 2. 建议技术栈

| 层 | 初步选择 | 说明 |
|---|---|---|
| Web | Vue 3 + TypeScript + Vite | 单页 Web 应用 |
| UI | Naive UI | 常规界面组件 |
| 可视化编辑 | Vue Flow | 自定义 UML 节点与边 |
| 源码编辑 | Monaco Editor | PlantUML 文本编辑 |
| API | Python + FastAPI | 题目、提交、评测 API |
| 持久化 | SQLite（MVP） | 题目、测试集、提交记录 |
| 数据访问 | SQLAlchemy | ORM |
| 核心模型 | 独立 UML IR package | 前后端共享规范 |

技术选型是初步建议，需通过原型验证后确认。

## 3. UML IR 是核心边界

所有输入适配器都应输出同一套 UML IR：

- Visual Editor Adapter：画布结构转换为 IR。
- PlantUML Adapter：源码解析为 IR。
- 后续适配器：其他源码格式或模型交换格式。

Test Runner 只依赖 UML IR，不应直接读取 Vue Flow 状态或 PlantUML 文本。

IR 应包含：

- diagram type
- classifiers（class / interface 等）
- attributes 与 operations
- relationships 及其端点
- multiplicity
- visibility 与类型信息
- 稳定的元素 ID
- schema version

布局坐标属于展示信息，不应影响语义测试；可以作为 IR 的独立 presentation 部分或单独文档保存。

## 4. 评测边界

Test Runner 由确定性规则组成：

1. 输入解析和 IR 校验
2. 题目测试集加载
3. 测试断言执行
4. 测试结果汇总
5. 失败定位和报告生成

AI 辅助能力应作为独立服务，不得改变确定性测试结果，也不得执行不受信任的题目代码。

## 5. 题目与提交版本

提交记录至少应关联：

- problem id
- problem version
- test suite version
- submission source type
- 原始提交内容
- 解析后的 IR
- runner version
- 测试结果
- 提交时间

这样题目或测试用例更新后，历史结果仍可追溯。

## 6. 建议开发顺序

1. 定义 UML IR 的最小 schema。
2. 编写一份手工构造 IR 的测试题和 Test Runner。
3. 用单元测试验证每个测试 kind。
4. 实现 PlantUML Adapter。
5. 实现 Vue Flow 可视化编辑器及 Adapter。
6. 接入题库、提交记录和结果页面。

先验证评测内核，再建设编辑器，可以降低 UI 与评测模型相互绑死的风险。
