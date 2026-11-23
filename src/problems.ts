import { turinAssessments } from './turin-assessments.ts'

type Relation = [string, string, string | null, string | null]
type RelationAlternative = {
  relations: [string, string, string, string][]
  absent: [string, string][]
}

export type Problem = {
  id: string
  title: string
  level: string
  description: string
  requirements: string[]
  classes: { name: string; attributes: string[] }[]
  interfaces?: { name: string; methods: string[] }[]
  relations: Relation[]
  relationAlternatives?: {
    id: string
    title: string
    failure: string
    options: RelationAlternative[]
  }
  typedRelations?: { source: string; target: string; type: 'ClassInheritance' | 'ClassRealization' }[]
  namedRelations?: { source: string; target: string; label: string; sourceMultiplicity?: string; targetMultiplicity?: string }[]
  assessmentNote?: string
  hint: string
  source?: { title: string; url: string; page: number; note: string }
  referenceOnly?: { missing: string[] }
  lesson?: {
    concept: string
    steps: string[]
    example: string
    starter: string
    solution: string
    takeaway: string
  }
}

const turinSource = (page: number) => ({
  title: 'Politecnico di Torino · Class Diagram Exercises',
  url: 'https://softeng.polito.it/tongji/SE/ex/class-diag-ex.pdf',
  page,
  note: '以下为原题题意的中文翻译；原文和参考图见来源 PDF。为自动评测另行指定类名与建模要求，见下方评测约定。',
})

const baseProblems: Problem[] = [
  {
    id: 'learn-class', title: '第 1 关：认识类', level: '教学 · 1 分钟',
    description: '类是对同一种事物的描述，例如学生、图书、订单。类图里的一个矩形就是一个类。这一关只创建一个类，不需要属性和连线。',
    requirements: ['创建一个名为 Student 的类，表示学生。只需把模板中的 Example 改成 Student。'],
    classes: [{ name: 'Student', attributes: [] }], relations: [],
    hint: 'class 后面是类名。Student 是题目指定的英文名，不要写成中文。',
    lesson: {
      concept: 'class 类名：声明一种事物。@startuml 和 @enduml 是源码的开始与结束标记。',
      steps: ['在源码中将 Example 改成 Student。', '也可以点击画布中的 Example，在编辑面板将类名改为 Student，再点击“应用更改”。', '点击“提交评测”，看到通过后进入下一关。'],
      example: 'class Car',
      starter: '@startuml\nclass Example\n@enduml',
      solution: '@startuml\nclass Student\n@enduml',
      takeaway: '你已经会用一个类表示一种事物了！下一关给学生添加信息。',
    },
  },
  {
    id: 'learn-attribute', title: '第 2 关：给类添加属性', level: '教学 · 2 分钟',
    description: '属性描述事物“有什么信息”。学生有姓名，图书有书名。属性写在类的花括号里，不要加方法的圆括号。',
    requirements: ['在 Student 类中添加姓名属性 name。', '已有类名无需修改。类型 String 表示文本，本关只检查属性名称。'],
    classes: [{ name: 'Student', attributes: ['name'] }], relations: [],
    hint: '在注释下方添加一行 - name: String。前面的减号表示私有属性，本关不检查可见性。',
    lesson: {
      concept: '属性的写法是“名称: 类型”。例如 color: String 表示一个文本类型的颜色。减号 - 表示私有；没有圆括号的是属性。',
      steps: ['类已经替你建好，只需添加姓名属性。', '在源码花括号中添加 - name: String。', '也可以点击画布中的 Student，选择“添加属性”，填写名称 name、类型 String，再点击“应用更改”。'],
      example: 'class Car {\n  - color: String\n}',
      starter: '@startuml\nclass Student {\n  \' TODO：在下面添加姓名属性 name，类型为 String\n\n}\n@enduml',
      solution: '@startuml\nclass Student {\n  - name: String\n}\n@enduml',
      takeaway: '你会区分类和属性了！下一关学习两个类之间的联系。',
    },
  },
  {
    id: 'learn-association', title: '第 3 关：连接两个类', level: '教学 · 2 分钟',
    description: '关联表示两种事物之间有联系。例如学生选修课程，就可以把学生和课程用一条普通实线连起来。这一关暂时不考虑数量。',
    requirements: ['保留 Student 和 Course 两个类。', '添加一条连接 Student 和 Course 的普通关联。不需要填写数字。'],
    classes: [{ name: 'Student', attributes: [] }, { name: 'Course', attributes: [] }],
    relations: [['Student', 'Course', null, null]],
    hint: '在两个类声明后，添加 Student -- Course。这里是两个减号，不是继承箭头，也不要用星号或菱形。',
    lesson: {
      concept: 'A -- B 表示 A 与 B 有普通关联。连线不是属性，应该写在类声明外。',
      steps: ['模板中已经声明了两个类，不用重复创建。', '在 TODO 下方加一行 Student -- Course。', '也可以从画布中 Student 左右的连接点拖到 Course，或点击“添加关联”选择起点和终点；本关无需多重性。'],
      example: 'class Customer\nclass Order\nCustomer -- Order',
      starter: '@startuml\nclass Student\nclass Course\n\' TODO：在下面连接学生和课程\n\n@enduml',
      solution: '@startuml\nclass Student\nclass Course\nStudent -- Course\n@enduml',
      takeaway: '你已经能表达“谁和谁有联系”。最后一关把“数量”说清楚。',
    },
  },
  {
    id: 'learn-multiplicity', title: '第 4 关：读懂一对多', level: '教学 · 3 分钟',
    description: '每名学生只属于一个班级，一个班级可以有零到多名学生。我们用关联两端的数字来表达这个数量要求。',
    requirements: ['保留 Classroom（班级）和 Student（学生）两个类及普通关联。', '把 Classroom 端的问号改为 1，把 Student 端的问号改为 0..*。'],
    classes: [{ name: 'Classroom', attributes: [] }, { name: 'Student', attributes: [] }],
    relations: [['Classroom', 'Student', '1', '0..*']],
    hint: '读法：站在 Student 看 Classroom，只能属于 1 个班级，所以 1 写在 Classroom 旁；站在 Classroom 看 Student，可以有 0..* 个学生，所以 0..* 写在 Student 旁。',
    lesson: {
      concept: '1 表示恰好一个，0..* 表示零到任意多个。某一端旁边的数字，表示对面一个对象能关联多少个这一端的对象。',
      steps: ['源码方式：将双引号中的两个问号分别改为 1 和 0..*。', '画布方式：点击 Classroom 和 Student 之间的连线，填写 Classroom 端多重性 1 和 Student 端多重性 0..*。', '点击“应用更改”，再提交评测；不要把数字填进类名或关系名称。'],
      example: '\' 一位作者可以写多篇文章，每篇文章只有一位作者\nAuthor "1" -- "0..*" Article',
      starter: '@startuml\nclass Classroom\nclass Student\nClassroom "?" -- "?" Student\n@enduml',
      solution: '@startuml\nclass Classroom\nclass Student\nClassroom "1" -- "0..*" Student\n@enduml',
      takeaway: '你已学会类、属性、普通关联和一对多。接下来认识接口。',
    },
  },
  {
    id: 'learn-interface', title: '第 5 关：认识接口', level: '教学 · 2 分钟',
    description: '接口描述一种能力的约定，例如可打印。它不是普通类；这一关先创建接口，不需要连线。',
    requirements: ['创建一个名为 Printable 的接口。', '接口名必须是 Printable；普通类不能代替接口。'],
    classes: [], interfaces: [{ name: 'Printable', methods: [] }], relations: [],
    hint: '源码可以使用 interface Printable；画布中可以添加接口，或点击已有接口修改名称。',
    lesson: {
      concept: '接口用于描述能力或操作的约定。类图中可用带 «interface» 标记的矩形表示接口。',
      steps: ['点击画布中的 Example 接口，在属性面板将接口名改为 Printable。', '点击“应用更改”，然后提交评测。', '也可以将 PlantUML 源码中的 interface Example 改为 interface Printable。'],
      example: 'interface Readable',
      starter: '@startuml\ninterface Example\n@enduml',
      solution: '@startuml\ninterface Printable\n@enduml',
      takeaway: '你已经能创建接口，下一关为接口添加方法。',
    },
  },
  {
    id: 'learn-interface-method', title: '第 6 关：接口的方法', level: '教学 · 3 分钟',
    description: '支付能力可以用 Payable 接口描述。接口中的方法说明它提供什么操作。',
    requirements: ['保留 Payable 接口。', '添加名为 pay 的方法。可选填参数 amount 和返回类型 Boolean；本关只检查方法名称。'],
    classes: [], interfaces: [{ name: 'Payable', methods: ['pay'] }], relations: [],
    hint: '在接口的属性面板选择“添加方法”，填写方法名称 pay；不要把 pay 写成属性。',
    lesson: {
      concept: '方法带有圆括号，例如 pay(amount: Money): Boolean。方法名称、参数与返回类型分别描述操作及其输入输出。',
      steps: ['点击 Payable 接口，选择“添加方法”。', '填写方法名称 pay；也可以添加 amount 参数及 Boolean 返回类型。', '点击“应用更改”，然后提交评测。'],
      example: 'interface Payable {\n  + pay(amount: Money): Boolean\n}',
      starter: '@startuml\ninterface Payable\n@enduml',
      solution: '@startuml\ninterface Payable {\n  + pay(amount: Money): Boolean\n}\n@enduml',
      takeaway: '接口可以包含多个操作；下一关练习创建多个接口。',
    },
  },
  {
    id: 'learn-multiple-interfaces', title: '第 7 关：多个接口', level: '教学 · 4 分钟',
    description: '一个系统可能需要多种能力。分别用接口描述搜索和导出，不需要绘制实现关系。',
    requirements: ['保留 Searchable 接口，添加 search 方法。', '新建 Exportable 接口，添加 export 方法。', '本关检查接口和方法名称，不检查参数、返回类型或可见性。'],
    classes: [], interfaces: [{ name: 'Searchable', methods: ['search'] }, { name: 'Exportable', methods: ['export'] }], relations: [],
    hint: '分别编辑 Searchable 和 Exportable 的方法列表；两个接口不能用普通类替代。',
    lesson: {
      concept: '不同接口可以分别表达不同能力。当前练习只创建接口及其操作，不要求类实现接口。',
      steps: ['点击 Searchable 接口并添加 search 方法，应用更改。', '在“添加元素”中选择接口，将新接口命名为 Exportable，添加 export 方法并应用。', '提交评测；无需绘制连线。'],
      example: 'interface Searchable {\n  + search()\n}\ninterface Exportable {\n  + export()\n}',
      starter: '@startuml\ninterface Searchable\n@enduml',
      solution: '@startuml\ninterface Searchable {\n  + search()\n}\ninterface Exportable {\n  + export()\n}\n@enduml',
      takeaway: '你已学会创建接口及方法。类如何实现接口，将在后续关系功能中练习。',
    },
  },
  {
    id: 'project-management',
    title: '项目管理系统',
    level: '入门 · 预计 5–10 分钟',
    description: '为一个小型团队建立项目管理类图，描述开发者与项目之间的参与关系。',
    requirements: [
      '建立开发者 Developer 类，包含姓名 name 和工号 employeeId。',
      '建立项目 Project 类，包含名称 name 和开始日期 startDate。',
      '开发者可以参与多个项目，一个项目也可以由多个开发者参与。请用普通关联连接两类，并在两端标注 0..*。',
    ],
    classes: [
      { name: 'Developer', attributes: ['name', 'employeeId'] },
      { name: 'Project', attributes: ['name', 'startDate'] },
    ],
    relations: [['Developer', 'Project', '0..*', '0..*']],
    hint: '先创建两个类，再添加属性，最后添加普通关联和两端的多重性。属性类型可自行选择，布局不参与评分。',
  },
  {
    id: 'library-loans',
    title: '图书借阅系统',
    level: '进阶 · 预计 10–15 分钟',
    description: '图书馆希望保留每一次借阅的记录。请用独立的借阅记录类描述读者与图书之间的业务，而不是只把读者和图书直接连接起来。',
    requirements: [
      '建立读者 Reader 类，包含读者编号 readerId 和姓名 name。',
      '建立图书 Book 类，包含图书编号 isbn 和书名 title。这里每个 Book 对象代表一本可借阅的实体书。',
      '建立借阅记录 Loan 类，包含借出日期 borrowedAt 和应还日期 dueAt。',
      '每条 Loan 属于恰好一名 Reader；一名 Reader 可以拥有零到多条历史借阅记录。使用普通关联，在 Reader 端标 1、Loan 端标 0..*。',
      '每条 Loan 对应恰好一本 Book；一本 Book 可以拥有零到多条历史借阅记录。使用普通关联，在 Book 端标 1、Loan 端标 0..*。',
      '保留额外的类、属性或关系不会扣分；不要求方法、继承或组合关系。',
    ],
    classes: [
      { name: 'Reader', attributes: ['readerId', 'name'] },
      { name: 'Book', attributes: ['isbn', 'title'] },
      { name: 'Loan', attributes: ['borrowedAt', 'dueAt'] },
    ],
    relations: [['Reader', 'Loan', '1', '0..*'], ['Book', 'Loan', '1', '0..*']],
    hint: '借阅日期属于“一次借阅”，不属于读者或图书本身。多重性标在谁那一端，就表示对面的一个对象可关联多少个这一端的对象。',
  },
  {
    id: 'indie-radar',
    title: '独游雷达：同一个团队，三个账号',
    level: '中等 · 预计 10–15 分钟',
    description: '一个独游团队会在多个平台发开发日志。一条日志有时同时提到几款游戏。读者既要找到游戏的相关日志，也要知道原帖是哪个账号发的。',
    requirements: [
      '分别建立创作者 Creator（name）、平台账号 PlatformAccount（platform、handle）、开发日志 Devlog（title、url）和游戏 Game（title）四个类。',
      '一个创作者可以绑定零到多个账号；本题只建模已绑定的账号，每个账号只归一个创作者。',
      '一个账号可以发布零到多篇日志；每篇日志恰好来自一个账号。',
      '一篇日志可以提到零到多款游戏；一款游戏也可以出现在零到多篇日志里。',
      '使用普通关联，标注两端多重性；属性类型、可见性和画布布局不判分。',
    ],
    classes: [
      { name: 'Creator', attributes: ['name'] },
      { name: 'PlatformAccount', attributes: ['platform', 'handle'] },
      { name: 'Devlog', attributes: ['title', 'url'] },
      { name: 'Game', attributes: ['title'] },
    ],
    relations: [['Creator', 'PlatformAccount', '1', '0..*'], ['PlatformAccount', 'Devlog', '1', '0..*'], ['Devlog', 'Game', '0..*', '0..*']],
    hint: '试着问：是团队发布了这条原帖，还是团队的某个账号发布了它？游戏与日志的关系不要固定成一个方向的一对多。',
  },
  {
    id: 'renovation-inspections',
    title: '装修大师：验收没过，原记录不能覆盖',
    level: '中等 · 预计 10–15 分钟',
    description: '同一施工项可能一次通过，也可能返工几次才通过。项目经理想查看每一次验收，而不只是最终结果。',
    requirements: [
      '建立工单 WorkOrder（orderNo）、施工项 WorkItem（name）、验收记录 Inspection（checkedAt、result、notes）三个类。',
      '一张工单可以先建单、后拆项，因此可以包含零到多个施工项；每个施工项只属于一张工单。',
      '每个施工项可以没有验收记录，也可以有多条；每条验收记录恰好对应一个施工项。',
      '使用普通关联，标注两端多重性。本题只评测模型能否表示多次验收，不测试应用是否会覆盖旧记录。',
    ],
    classes: [
      { name: 'WorkOrder', attributes: ['orderNo'] },
      { name: 'WorkItem', attributes: ['name'] },
      { name: 'Inspection', attributes: ['checkedAt', 'result', 'notes'] },
    ],
    relations: [['WorkOrder', 'WorkItem', '1', '0..*'], ['WorkItem', 'Inspection', '1', '0..*']],
    hint: '把“时间、结果、备注”放在发生一次就增加一条记录的地方，而不是放在施工项上覆盖。',
  },
  {
    id: 'manuscript-reviews',
    title: '「终稿_v7」的批注挂在哪一版？',
    level: '进阶 · 多解 · 预计 15–20 分钟',
    description: '写作团队发布新版稿件后，读者还要找得到旧批注原本审阅的版本。请用类图表示批注如何定位到恰好一个稿件版本。',
    requirements: [
      '建立稿件 Manuscript（title）、稿件版本 Revision（versionNo）、批注 Comment（body）三个类。',
      '一篇稿件可以有零到多个版本，每个版本只属于一篇稿件。使用普通关联并标注两端多重性。',
      '选一种建模方式：每条批注直接归属一个版本，或每条批注归属一次审阅 Review、每次审阅只对应一个版本。版本可有零到多条直接批注，或零到多次审阅；一次审阅可有零到多条批注。',
      '所选路径的每对类之间只画一条普通关联，不能混用两条路径，也不要额外把 Comment 连到 Manuscript。本题不检查发布新版时程序实际怎么更新数据。',
    ],
    classes: [
      { name: 'Manuscript', attributes: ['title'] },
      { name: 'Revision', attributes: ['versionNo'] },
      { name: 'Comment', attributes: ['body'] },
    ],
    relations: [['Manuscript', 'Revision', '1', '0..*']],
    relationAlternatives: {
      id: 'comment-revision-path',
      title: '每条批注能通过一种路径定位到唯一版本',
      failure: '请选择批注直连版本，或通过 Review 类连接版本。每段只画一条普通关联，将上一级的多重性标为 1，下一级标为 0..*；不要混用路径或把批注直接连到稿件。',
      options: [
        { relations: [['Revision', 'Comment', '1', '0..*']], absent: [['Comment', 'Manuscript'], ['Comment', 'Review']] },
        { relations: [['Revision', 'Review', '1', '0..*'], ['Review', 'Comment', '1', '0..*']], absent: [['Comment', 'Manuscript'], ['Comment', 'Revision']] },
      ],
    },
    hint: '从一条 Comment 出发，沿你选择的路径走一遍。每一步都必须只有一个上一级对象；另一方向则允许多个下一级对象。',
  },
  {
    id: 'turin-university', title: '都灵练习：大学', level: '原题参考 · 暂无自动评测',
    description: '为大学的教室、办公室、院系和工作人员建立类图。',
    requirements: [
      '大学中有不同的教室、办公室和院系。院系有名称，包含多间办公室。',
      '在大学工作的人有唯一 ID，可以是教授或职员。',
      '教授可以是正教授、副教授或助理教授；每位教授隶属于一个院系。',
      '办公室和教室有编号，教室还有座位数。',
      '每位职员在一间办公室工作。',
    ],
    classes: [], relations: [],
    hint: '原题参考图见来源 PDF 第 2 页。', source: turinSource(1),
  },
  {
    id: 'turin-movie-shop', title: '都灵练习：影片商店', level: '原题参考 · 暂无自动评测',
    description: '为影片商店设计一个系统，处理影片订购、商店目录浏览，以及带可充值卡的用户订阅。',
    requirements: [
      '只有订阅用户可以使用自己的卡租借影片。',
      '租借时更新卡上的余额。',
      '普通用户和订阅用户都可以购买影片，其信息保存在相应订单中。',
      '当影片缺货时，需要订购该影片。',
    ],
    classes: [], relations: [],
    hint: '原题参考图见来源 PDF 第 3 页。', source: turinSource(2),
  },
  {
    id: 'turin-flights', title: '都灵练习：航班', level: '原题参考 · 暂无自动评测',
    description: '为航班与飞行员管理系统建立模型。',
    requirements: [
      '航空公司运营航班，每家航空公司有一个 ID。每个航班有 ID、出发机场和到达机场；机场有唯一标识。',
      '每个航班有一名飞行员和一名副驾驶，使用某种型号的一架飞机，并有出发时间和到达时间。',
      '航空公司拥有不同型号的一组飞机。飞机可以处于正常工作或维修状态；在特定时刻，飞机可以在地面或在空中。',
      '航空公司有一组飞行员。每位飞行员有经验等级，最低为 1，最高为 3。',
      '某种飞机型号可能需要特定数量、不同角色的飞行员，例如机长、副驾驶和领航员；至少需要一名机长和一名副驾驶，且机长的经验等级必须为 3。',
    ],
    classes: [], relations: [],
    hint: '原题参考图见来源 PDF 第 4 页。', source: turinSource(3),
  },
  {
    id: 'turin-bank', title: '都灵练习：银行系统', level: '原题参考 · 暂无自动评测',
    description: '为银行系统建立类图。',
    requirements: [
      '系统保存客户及其账户的数据；客户通过姓名和地址标识。',
      '每个账户都有余额。账户分为两类：提供利率的储蓄账户，以及用于购买股票的投资账户。',
      '购买股票时记录一定的数量和价格（原文为 ticker）；银行对股票订单收取佣金。',
    ],
    classes: [], relations: [],
    hint: '原题参考图见来源 PDF 第 5 页；ticker 在原文中的表述可结合参考图理解。', source: turinSource(4),
  },
  {
    id: 'turin-hospital', title: '都灵练习：医院', level: '原题参考 · 暂无自动评测',
    description: '为医院、科室、工作人员和手术室建立模型。',
    requirements: [
      '医院有 ID、名称和地址。',
      '医院工作人员有在医院内唯一的 ID、姓、名、出生日期、地址以及儿子数量。',
      '工作人员可以是医生、职员或护士；医生有专长列表，职员有角色。',
      '医院分为多个科室；科室有代码、名称和床位数。每个科室需要记录其主任医生和全部工作人员。',
      '每个科室可以管理手术室。手术室通过名称、ID 和手术台数量描述。',
    ],
    classes: [], relations: [],
    hint: '原题参考图见来源 PDF 第 6 页。', source: turinSource(5),
  },
  {
    id: 'turin-library', title: '都灵练习：图书馆', level: '原题参考 · 暂无自动评测',
    description: '为图书馆、学生借阅和图书出版信息建立模型。',
    requirements: [
      '图书馆有可由学生借阅的图书，学生通过 ID 标识。',
      '图书有图书馆编号、书名、一位或多位作者以及页数。',
      '作者有名和姓，可以写多篇手稿；手稿可以在不同图书中出版。',
      '每本图书有一位 editor（原文用词）；一本图书可以由不同 editor 在不同日期提供。',
      '学生借阅的图书不能超过三本；每本图书有借阅起始日期和归还日期。',
    ],
    classes: [], relations: [],
    hint: '原题参考图见来源 PDF 第 7 页。原文使用 editor，且两个涉及 editor 的描述需结合原题和参考图理解。', source: turinSource(6),
  },
]

// Keep original exercise statements distinct from the explicit OJ conventions.
export const problems: Problem[] = baseProblems.map(problem => {
  const assessment = turinAssessments[problem.id]
  return assessment ? { ...problem, ...assessment, level: '都灵原题 · 静态结构评测' } : problem
})

export const emptySource = '@startuml\n\' 在这里编写类、属性和关联；请使用题目指定的英文名称。\n\n@enduml'
