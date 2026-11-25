export const modelingFixtures = [
  ['modeling-company-board', '公司治理：每家公司只有一个董事会', `class Company {
  name: String
}
class BoardOfDirectors
class BoardMember {
  joinedAt
}
Company "1" -- "1" BoardOfDirectors
BoardOfDirectors "1" -- "0..*" BoardMember`, 'Company "1" -- "1"', 'Company "0..1" -- "1"', 'mult-Company-BoardOfDirectors'],
  ['modeling-mentorship', '导师配对：还没分到导师的学生', `class Person {
  name
}
class Student
class Mentor
Person <|-- Student
Person <|-- Mentor
Mentor "0..1" -- "0..*" Student`, 'Person <|-- Mentor', 'Person --|> Mentor', 'typed-ClassInheritance-Mentor-Person'],
  ['modeling-course-enrollment', '选课系统：成绩属于哪一次选课？', `class Student {
  studentNo
}
class CourseSection {
  sectionCode
  term
}
class Registration {
  grade
}
Student "1" -- "*" Registration
CourseSection "1" -- "*" Registration`, '  grade\n', '  grade()\n', 'attr-Registration-grade'],
  ['modeling-course-registration-interface', '培训报名：个人和企业共用一个入口', `class Person {
  name
}
class IndividualStudent
class CorporateClient {
  companyName
}
interface RegisterCapable {
  registerForCourse()
}
IndividualStudent --|> Person
IndividualStudent ..|> RegisterCapable
CorporateClient ..|> RegisterCapable`, 'CorporateClient ..|>', 'CorporateClient --|>', 'typed-ClassRealization-CorporateClient-RegisterCapable'],
  ['modeling-series-episodes', '剧集目录：剧名不是每一集的属性', `class Series {
  title
  studio
}
class Episode {
  episodeNo
  durationMinutes
}
Episode "*" -- "1" Series`, 'Episode "*" -- "1" Series', 'Episode --|> Series', 'rel-Series-Episode'],
  ['modeling-warehouse-moves', '仓库搬运：起点和终点都是位置', `class MovementLocation
class StorageSlot {
  slotNo
}
class LoadingGate {
  gateNo
}
class Movement {
  movedAt
}
class Pallet {
  barcode
}
StorageSlot --|> MovementLocation
LoadingGate --|> MovementLocation
Movement "0..*" -- "1" Pallet
Movement "0..*" --> "1" MovementLocation : from
MovementLocation "1" -- "0..*" Movement : to`, 'MovementLocation "1" -- "0..*" Movement : to', 'MovementLocation "0..1" -- "0..*" Movement : to', 'named-Movement-MovementLocation-to'],
  ['modeling-shipping-strategy', '运费报价：切换算法，不换报价器', `interface ShippingPolicy {
  +quote()
}
class StandardShipping
class ExpressShipping
class ShippingQuote
StandardShipping ..|> ShippingPolicy
ExpressShipping ..|> ShippingPolicy
ShippingQuote "*" --> "1" ShippingPolicy : policy`, '+quote()', '+quote', 'method-ShippingPolicy-quote'],
  ['modeling-scanner-adapter', '条码扫描：把旧设备接进新接口', `interface ScanPort {
  scan()
}
class CheckoutTerminal
class ScannerAdapter
class LegacyScanner {
  serialNo
}
ScannerAdapter ..|> ScanPort
CheckoutTerminal --> ScanPort : input
ScannerAdapter -- LegacyScanner : device`, 'CheckoutTerminal --> ScanPort : input', 'ScanPort --> CheckoutTerminal : input', 'named-CheckoutTerminal-ScanPort-input'],
]
