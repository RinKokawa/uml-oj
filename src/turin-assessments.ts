import type { Problem } from './problems'

type Specification = Pick<Problem, 'classes' | 'relations'> & {
  typedRelations?: NonNullable<Problem['typedRelations']>
  namedRelations?: NonNullable<Problem['namedRelations']>
  assessmentNote: string
}
const inheritance = (source: string, target: string) => ({ source, target, type: 'ClassInheritance' as const })

// These names and structural requirements are OJ assessment conventions, not
// additional claims about the original exercise. Original text remains separate.
export const turinAssessments: Record<string, Specification> = {
  'turin-university': {
    classes: [
      { name: 'Person', attributes: ['id'] }, { name: 'Professor', attributes: [] }, { name: 'Employee', attributes: [] },
      { name: 'FullProfessor', attributes: [] }, { name: 'AssociateProfessor', attributes: [] }, { name: 'AssistantProfessor', attributes: [] },
      { name: 'Department', attributes: ['name'] }, { name: 'Office', attributes: ['number'] }, { name: 'Classroom', attributes: ['number', 'seats'] },
    ],
    relations: [['Department', 'Office', null, null], ['Professor', 'Department', null, '1'], ['Employee', 'Office', null, '1']],
    typedRelations: [inheritance('Professor', 'Person'), inheritance('Employee', 'Person'), inheritance('FullProfessor', 'Professor'), inheritance('AssociateProfessor', 'Professor'), inheritance('AssistantProfessor', 'Professor')],
    assessmentNote: '以三个教授子类表示教授类别；ID 的唯一性属于题目要求，但当前只检查 id 属性是否存在。',
  },
  'turin-movie-shop': {
    classes: [
      { name: 'User', attributes: [] }, { name: 'Subscriber', attributes: [] }, { name: 'Card', attributes: ['balance'] },
      { name: 'Movie', attributes: ['available'] }, { name: 'Catalogue', attributes: [] }, { name: 'Rental', attributes: [] },
      { name: 'Order', attributes: [] }, { name: 'RestockOrder', attributes: [] },
    ],
    relations: [['Subscriber', 'Card', null, null], ['Subscriber', 'Rental', null, null], ['Rental', 'Movie', null, null],
      ['User', 'Order', null, null], ['Order', 'Movie', null, null], ['Catalogue', 'Movie', null, null], ['RestockOrder', 'Movie', null, null]],
    typedRelations: [inheritance('Subscriber', 'User')],
    assessmentNote: '以 Subscriber 继承 User、Rental 关联 Subscriber 表达订阅用户租片；以 balance、available、RestockOrder 表达余额和补货所需信息。只检查指定静态结构，不执行余额更新或订购流程。',
  },
  'turin-flights': {
    classes: [
      { name: 'Airline', attributes: ['id'] }, { name: 'Flight', attributes: ['id', 'departureTime', 'arrivalTime'] },
      { name: 'Airport', attributes: ['id'] }, { name: 'Aircraft', attributes: ['maintenanceStatus', 'flightStatus'] },
      { name: 'AircraftType', attributes: [] }, { name: 'Pilot', attributes: ['experienceLevel'] },
      { name: 'Captain', attributes: [] }, { name: 'Copilot', attributes: [] }, { name: 'Navigator', attributes: [] },
    ],
    relations: [['Airline', 'Flight', null, null], ['Airline', 'Aircraft', null, null], ['Airline', 'Pilot', null, null],
      ['Flight', 'Aircraft', null, '1'], ['Aircraft', 'AircraftType', null, '1'], ['AircraftType', 'Pilot', null, null]],
    typedRelations: [inheritance('Captain', 'Pilot'), inheritance('Copilot', 'Pilot'), inheritance('Navigator', 'Pilot')],
    namedRelations: [
      { source: 'Flight', target: 'Airport', label: 'departure', targetMultiplicity: '1' },
      { source: 'Flight', target: 'Airport', label: 'arrival', targetMultiplicity: '1' },
      { source: 'Flight', target: 'Pilot', label: 'pilot', targetMultiplicity: '1' },
      { source: 'Flight', target: 'Pilot', label: 'copilot', targetMultiplicity: '1' },
    ],
    assessmentNote: '航班到机场、飞行员各需两条普通关联，通过关系名称区分角色；类型和等级限制在此阶段以类别及属性表达，不验证具体对象运行状态。',
  },
  'turin-bank': {
    classes: [
      { name: 'Customer', attributes: ['name', 'address'] }, { name: 'Account', attributes: ['balance'] },
      { name: 'SavingsAccount', attributes: ['interestRate'] }, { name: 'InvestmentAccount', attributes: [] },
      { name: 'Stock', attributes: [] }, { name: 'StockOrder', attributes: ['quantity', 'price', 'commission'] },
    ],
    relations: [['Customer', 'Account', null, null], ['InvestmentAccount', 'StockOrder', null, null], ['StockOrder', 'Stock', null, null]],
    typedRelations: [inheritance('SavingsAccount', 'Account'), inheritance('InvestmentAccount', 'Account')],
    assessmentNote: '以 StockOrder 记录购买数量、价格和佣金；题目不要求模拟购买或佣金计算。',
  },
  'turin-hospital': {
    classes: [
      { name: 'Hospital', attributes: ['id', 'name', 'address'] },
      { name: 'Worker', attributes: ['id', 'surname', 'name', 'birthDate', 'address', 'numberOfSons'] },
      { name: 'Doctor', attributes: ['specializations'] }, { name: 'Employee', attributes: ['role'] }, { name: 'Nurse', attributes: [] },
      { name: 'Department', attributes: ['code', 'name', 'beds'] }, { name: 'SurgeryRoom', attributes: ['id', 'name', 'tables'] },
    ],
    relations: [['Hospital', 'Worker', null, null], ['Hospital', 'Department', null, null], ['Department', 'Worker', null, null], ['Department', 'SurgeryRoom', null, null]],
    typedRelations: [inheritance('Doctor', 'Worker'), inheritance('Employee', 'Worker'), inheritance('Nurse', 'Worker')],
    namedRelations: [{ source: 'Department', target: 'Doctor', label: 'primaryDoctor', targetMultiplicity: '1' }],
    assessmentNote: '科室与主任医生使用名称为 primaryDoctor 的普通关联。属性类型和医院内 ID 唯一性暂不评测。',
  },
  'turin-library': {
    classes: [
      { name: 'Library', attributes: [] }, { name: 'Student', attributes: ['id'] },
      { name: 'Book', attributes: ['libraryCode', 'title', 'pages'] }, { name: 'Author', attributes: ['firstName', 'surname'] },
      { name: 'Manuscript', attributes: [] }, { name: 'Editor', attributes: [] }, { name: 'Publication', attributes: ['date'] },
      { name: 'Loan', attributes: ['startDate', 'returnDate'] },
    ],
    relations: [['Library', 'Book', null, null], ['Author', 'Book', '1..*', null], ['Author', 'Manuscript', null, null],
      ['Manuscript', 'Book', null, null], ['Book', 'Publication', null, null], ['Editor', 'Publication', null, null],
      ['Student', 'Loan', null, null], ['Book', 'Loan', null, null]],
    namedRelations: [{ source: 'Student', target: 'Book', label: 'currentLoans', targetMultiplicity: '0..3' }],
    assessmentNote: '以 Publication 和 date 表达不同 editor 在不同日期提供图书；以 currentLoans 关联 Book 端的 0..3 表达当前借阅上限。此题的 editor 直接沿用原文，不额外断定其具体含义。',
  },
}
