export type Problem = {
  id: string
  title: string
  level: string
  description: string
  requirements: string[]
  classes: { name: string; attributes: string[] }[]
  interfaces?: { name: string; methods: string[] }[]
  relations: [string, string, string | null, string | null][]
  hint: string
  lesson?: {
    concept: string
    steps: string[]
    example: string
    starter: string
    solution: string
    takeaway: string
  }
}

export const problems: Problem[] = [
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
      steps: ['模板中已经声明了两个类，不用重复创建。', '在 TODO 下方加一行 Student -- Course。', '也可以点击画布的“添加关联”，选择起点和终点并应用；本关无需多重性。'],
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
      steps: ['点击 Searchable 接口并添加 search 方法，应用更改。', '点击“添加接口”，将新接口命名为 Exportable，添加 export 方法并应用。', '提交评测；无需绘制连线。'],
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
]

export const emptySource = '@startuml\n\' 在这里编写类、属性和关联；请使用题目指定的英文名称。\n\n@enduml'
