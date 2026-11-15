# UML OJ Test Case DSL（草案）

> 本文定义方向性设计，不是已实现的语法规范。正式实现前需要用多道题验证表达能力、歧义和可维护性。

## 1. 设计目标

测试用例应直接检查题目要求，而不是将用户模型与唯一参考图进行整体比较。

DSL 应具备：

- 可读、可审查、可版本控制
- 可组合的原子断言
- 明确的通过/失败语义
- 可定位到模型元素
- 相同输入得到相同结果
- 不执行任意用户代码

## 2. 建议的测试类别

| 类别 | 示例检查 |
|---|---|
| Model | 模型类型、必要模型元信息 |
| Classifier | 类或接口是否存在 |
| Attribute | 属性名称、类型、可见性 |
| Operation | 操作名称、参数和返回类型 |
| Relationship | 关联、继承、实现、依赖等 |
| Multiplicity | 关联端的上下界 |
| Constraint | 多个模型元素之间的业务约束 |
| Well-formedness | UML 模型基本合法性 |

测试应区分必需条件与可选条件。只有必需测试全部通过，提交才判定为 Accepted。

## 3. DSL 草案示例

以下 YAML 仅用于说明结构：

```yaml
version: 0.1
problem: project-management-class-diagram

tests:
  - id: class-developer-exists
    description: 存在 Developer 类
    kind: classifier.exists
    target:
      name: Developer
      classifierType: class
    required: true

  - id: class-project-exists
    description: 存在 Project 类
    kind: classifier.exists
    target:
      name: Project
      classifierType: class
    required: true

  - id: participation-association
    description: Developer 与 Project 之间存在参与关联
    kind: relationship.exists
    target:
      source: Developer
      target: Project
      relationshipType: association
      name: participates
    required: true

  - id: leader-is-participant
    description: 项目负责人必须属于该项目的参与者
    kind: constraint
    language: uml-oj-expr
    expression: >
      project.leader is member of project.participants
    required: true
```

注意：此示例中的 relationship 端点、多重性方向及 constraint 表达式语法尚未最终确定，不应直接视为可执行规范。

## 4. 重要语义问题

### 4.1 多重性与端点

UML 关联两端的多重性描述的是对端实例的数量约束。内部 IR 应使用明确的端点对象，而不是依赖字符串数组的位置约定。

建议结构：

```json
{
  "type": "association",
  "ends": [
    {
      "classifier": "Developer",
      "multiplicity": {"lower": 0, "upper": "*"}
    },
    {
      "classifier": "Project",
      "multiplicity": {"lower": 0, "upper": "*"}
    }
  ]
}
```

实现前必须确定 IR 中 multiplicity 对应的语义是“该端实例可关联多少个对端实例”，并在 UI、源码适配器和测试 DSL 中保持一致。

### 4.2 关系类型

至少需要区分：

- association
- aggregation
- composition
- generalization
- realization
- dependency

不能把所有连线都归一成无语义的 edge。

### 4.3 约束表达

有些业务规则不能仅由普通关联线完整表达。例如“负责人必须是参与者集合中的成员”。

此类要求应使用受限的表达式语言或明确的结构化约束。不要执行题目文件或用户提交中的任意代码。

### 4.4 多种正确解法

测试用例应验证需求约束，不应过度限定无关的命名、布局、元素顺序或实现细节。若题目确实要求某种关系类型或模型元素，应在题目描述中明确说明。

## 5. Test Runner 行为

推荐执行流程：

1. 验证输入格式并转换为 UML IR。
2. 执行 IR 基础合法性检查。
3. 按稳定顺序执行该题版本绑定的测试集。
4. 为每个测试生成 PASS 或 FAIL。
5. 记录失败原因、期望条件、实际观察结果和相关元素 ID。
6. 根据必需测试结果生成最终 verdict。

测试运行应隔离题目定义与用户提交，禁止任意脚本执行。

## 6. 测试报告建议结构

```json
{
  "problemId": "project-management-class-diagram",
  "submissionId": "submission-001",
  "verdict": "wrong_answer",
  "summary": {
    "passed": 3,
    "failed": 1,
    "total": 4
  },
  "results": [
    {
      "testId": "class-developer-exists",
      "status": "pass"
    },
    {
      "testId": "leader-is-participant",
      "status": "fail",
      "message": "模型未表达负责人属于参与者集合的约束",
      "relatedElementIds": ["project", "leader", "participants"]
    }
  ]
}
```

## 7. 后续需要补齐

- 完整 schema 与 JSON Schema 校验
- 各 test kind 的精确定义
- 名称解析、别名和大小写策略
- 关联端点及多重性语义
- 约束表达式语法与类型检查
- 测试集版本管理
- 测试自身的单元测试与示例题
