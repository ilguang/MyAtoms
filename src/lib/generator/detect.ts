/**
 * 生成引擎：需求识别（关键词匹配应用类型）+ 内容派生（从 prompt 提取领域、功能点、宣传语）。
 */
import type { AppType, DerivedContent } from './types'

const RULES: { type: AppType; keywords: string[] }[] = [
  { type: 'calculator', keywords: ['计算器', '计算', '算账', '汇率', '税', '换算', 'calculator', 'calc', 'convert'] },
  { type: 'timer', keywords: ['番茄', '计时', '倒计时', '秒表', '专注', '闹钟', '提醒', 'timer', 'pomodoro', 'focus', 'countdown'] },
  { type: 'todo', keywords: ['待办', '清单', '任务', '日程', '事项', 'todo', 'task', 'checklist', '计划', '安排'] },
  { type: 'dashboard', keywords: ['仪表盘', '数据', '看板', '统计', '报表', '分析', '趋势', 'dashboard', 'analytics', '指标', '监测'] },
  { type: 'notes', keywords: ['笔记', '便签', '便笺', 'note', 'memo', '灵感', '随笔', '日记', '记录'] },
  { type: 'landing', keywords: ['落地', '官网', '主页', '首页', 'landing', '营销', '介绍', '品牌', '宣传', '产品页', '网站', '网页', '平台', '系统', '应用', 'app', '商城', '商店'] },
]

const DEFAULT_TITLE: Record<AppType, string> = {
  todo: '待办清单',
  timer: '番茄专注钟',
  calculator: '计算器',
  landing: '品牌官网',
  dashboard: '数据看板',
  notes: '灵感便签',
}

const DEFAULT_SUBTITLE: Record<AppType, string> = {
  todo: '清爽的待办清单，帮你规划每天最重要的几件事。',
  timer: '番茄工作法计时器，专注当下，劳逸结合。',
  calculator: '轻巧的四则运算计算器，支持键盘输入。',
  landing: '一句到位地介绍你的产品，转化每一位访客。',
  dashboard: '关键指标一屏尽览，随时掌握业务脉搏。',
  notes: '随手记下转瞬即逝的灵感，便签会替你保管。',
}

const ACCENTS = ['#FFB454', '#6FE3A5', '#FF6B8A', '#5EA2FF', '#B58CFF', '#FF9E5E', '#4DD7C0']

export interface Detection {
  type: AppType
  title: string
  subtitle: string
  accent: string
  /** 从 prompt 派生出的领域化内容，供模板注入，避免千篇一律 */
  content: DerivedContent
}

// 领域词典：根据 prompt 中的关键词匹配合适的营销文案
const DOMAINS: {
  keywords: string[]
  domain: string
  features: { title: string; desc: string }[]
  stats: { num: string; label: string }[]
  highlight: string
}[] = [
  {
    keywords: ['健身', '运动', '跑步', '瑜伽', '训练', '减肥', '瘦身', 'fitness', 'gym', 'workout'],
    domain: '健身运动',
    highlight: '科学训练，让每一次坚持都看得见进步',
    features: [
      { title: '训练计划', desc: '根据目标智能生成个性化训练方案。' },
      { title: '数据追踪', desc: '记录心率、消耗、体重变化趋势。' },
      { title: '社区打卡', desc: '与好友互相监督，坚持不再孤单。' },
    ],
    stats: [
      { num: '50万+', label: '活跃用户' },
      { num: '1200+', label: '训练课程' },
      { num: '98%', label: '坚持率提升' },
    ],
  },
  {
    keywords: ['学习', '教育', '课程', '考试', '背单词', '英语', '知识', 'study', 'learn', 'edu', 'school', 'student'],
    domain: '在线学习',
    highlight: '把学习变成每天期待的事',
    features: [
      { title: '智能课程', desc: '碎片化学习，每天 15 分钟搞定一个知识点。' },
      { title: '进度追踪', desc: '可视化学习曲线，薄弱环节一目了然。' },
      { title: '记忆曲线', desc: '基于艾宾浩斯曲线的科学复习提醒。' },
    ],
    stats: [
      { num: '80万+', label: '学员' },
      { num: '3000+', label: '精品课程' },
      { num: '4.9', label: '用户评分' },
    ],
  },
  {
    keywords: ['购物', '电商', '商城', '商品', '店铺', '下单', '购物车', 'shop', 'mall', 'ecommerce', 'store', 'buy'],
    domain: '电商购物',
    highlight: '好物触手可及，购物更简单',
    features: [
      { title: '精选好物', desc: '人工甄选，每一件都值得拥有。' },
      { title: '极速物流', desc: '当日下单，最快次日送达。' },
      { title: '售后无忧', desc: '7 天无理由退换，买得放心。' },
    ],
    stats: [
      { num: '200万+', label: '商品' },
      { num: '5000+', label: '品牌入驻' },
      { num: '99.5%', label: '好评率' },
    ],
  },
  {
    keywords: ['音乐', '歌曲', '播放', '歌单', '电台', 'music', 'song', 'audio', 'player'],
    domain: '音乐流媒体',
    highlight: '好音乐，随时听',
    features: [
      { title: '海量曲库', desc: '千万首正版音乐，想听就听。' },
      { title: '智能推荐', desc: '懂你的口味，每日推荐合心意。' },
      { title: '离线下载', desc: '没有网络也能畅听无阻。' },
    ],
    stats: [
      { num: '3000万+', label: '曲库' },
      { num: '1亿+', label: '用户' },
      { num: '24h', label: '新歌首发' },
    ],
  },
  {
    keywords: ['社交', '聊天', '交友', '社区', '论坛', '帖子', 'social', 'chat', 'community', 'friend'],
    domain: '社交社区',
    highlight: '连接有趣的灵魂',
    features: [
      { title: '兴趣圈子', desc: '找到志同道合的人，聊你感兴趣的话题。' },
      { title: '即时聊天', desc: '文字、语音、视频，沟通零距离。' },
      { title: '动态分享', desc: '记录生活精彩瞬间，与世界分享。' },
    ],
    stats: [
      { num: '1000万+', label: '注册用户' },
      { num: '50万+', label: '日均发帖' },
      { num: '24h', label: '在线陪伴' },
    ],
  },
  {
    keywords: ['餐饮', '外卖', '点餐', '美食', '订餐', 'restaurant', 'food', 'delivery', 'menu'],
    domain: '餐饮外卖',
    highlight: '美食，即刻送达',
    features: [
      { title: '附近好店', desc: '智能推荐周边人气餐厅。' },
      { title: '极速配送', desc: '平均 30 分钟送达，新鲜出炉。' },
      { title: '优惠不断', desc: '新人立减、满减红包天天有。' },
    ],
    stats: [
      { num: '50万+', label: '合作商家' },
      { num: '30分钟', label: '平均送达' },
      { num: '4.8', label: '用户评分' },
    ],
  },
  {
    keywords: ['旅行', '旅游', '酒店', '机票', '出行', '攻略', '景点', 'travel', 'trip', 'hotel', 'flight', 'tour'],
    domain: '旅行出行',
    highlight: '世界那么大，一起去看看',
    features: [
      { title: '一站式预订', desc: '机票、酒店、门票一次搞定。' },
      { title: '真实攻略', desc: '来自旅行者的第一手经验分享。' },
      { title: '行程规划', desc: '智能生成专属旅行路线。' },
    ],
    stats: [
      { num: '200+', label: '目的地' },
      { num: '10万+', label: '真实攻略' },
      { num: '99%', label: '预订成功率' },
    ],
  },
  {
    keywords: ['金融', '理财', '记账', '钱包', '支付', '投资', 'finance', 'money', 'bank', 'invest', 'budget'],
    domain: '金融理财',
    highlight: '让每一分钱都聪明起来',
    features: [
      { title: '智能记账', desc: '自动分类消费，看清钱花在哪。' },
      { title: '预算管理', desc: '设定预算，超支即时提醒。' },
      { title: '资产总览', desc: '多账户一目了然，财富尽在掌握。' },
    ],
    stats: [
      { num: '500万+', label: '用户' },
      { num: '99.9%', label: '资金安全' },
      { num: '200+', label: '银行支持' },
    ],
  },
]

const GENERIC_DOMAIN = {
  domain: '产品服务',
  highlight: '把复杂留给我们，把简单交给你',
  features: [
    { title: '极速交付', desc: '从想法到上线，无需等待数周。' },
    { title: '灵活扩展', desc: '按需组合，随业务持续成长。' },
    { title: '安全可靠', desc: '数据加密，稳定运行无忧。' },
  ],
  stats: [
    { num: '99.9%', label: '可用性' },
    { num: '10×', label: '更快上线' },
    { num: '1000+', label: '团队信赖' },
  ],
}

function hashString(input: string): number {
  let h = 5381
  for (let i = 0; i < input.length; i++) h = (h * 33) ^ input.charCodeAt(i)
  return Math.abs(h)
}

const LEADING_RE =
  /^(帮我|请|麻烦|我想|我要|想要|给我|做一个|创建一个|生成一个|开发一个|搭建一个|设计一个|来一个|画一个|做个|整个|搞一个)/

function stripNoise(p: string): string {
  p = p.replace(LEADING_RE, '')
  p = p.replace(
    /(待办清单|番茄钟|计时器|计算器|落地页|官网|主页|仪表盘|数据看板|便签|笔记|应用|网站|网页|小程序|工具|页面|app|平台|系统)/gi,
    '',
  )
  p = p.replace(/[，。,.!！?？、；;：:\s]+$/g, '')
  p = p.replace(/^[，。,.!！?？、；;：:\s]+/g, '')
  return p.trim()
}

function deriveTitle(prompt: string, type: AppType): string {
  const name = stripNoise(prompt).slice(0, 16)
  return name || DEFAULT_TITLE[type]
}

function deriveContent(prompt: string, type: AppType): DerivedContent {
  const lower = prompt.toLowerCase()
  const matched = DOMAINS.find((d) =>
    d.keywords.some((k) => lower.includes(k.toLowerCase())),
  )
  const base = matched || GENERIC_DOMAIN

  // 根据应用类型微调 CTA 文案
  let ctaPrimary = '免费开始'
  let ctaSecondary = '了解更多'
  if (type === 'landing') {
    ctaPrimary = matched ? `立即体验${matched.domain}` : '免费开始'
    ctaSecondary = '查看详情'
  }

  return {
    domain: base.domain,
    features: base.features,
    stats: base.stats,
    ctaPrimary,
    ctaSecondary,
    highlight: base.highlight,
  }
}

export function detectType(prompt: string): AppType {
  const lower = prompt.toLowerCase()
  for (const rule of RULES) {
    if (rule.keywords.some((k) => lower.includes(k.toLowerCase()))) {
      return rule.type
    }
  }
  return 'landing'
}

interface DetectOptions {
  previousType?: AppType
  previousTitle?: string
  previousAccent?: string
}

export function detect(prompt: string, opts: DetectOptions = {}): Detection {
  const lower = prompt.toLowerCase()
  let type: AppType | undefined
  for (const rule of RULES) {
    if (rule.keywords.some((k) => lower.includes(k.toLowerCase()))) {
      type = rule.type
      break
    }
  }
  const finalType: AppType = type || opts.previousType || 'landing'

  const title = deriveTitle(prompt, finalType) || opts.previousTitle || DEFAULT_TITLE[finalType]
  const accent = opts.previousAccent || ACCENTS[hashString(title) % ACCENTS.length]
  const content = deriveContent(prompt, finalType)

  return {
    type: finalType,
    title,
    subtitle: DEFAULT_SUBTITLE[finalType],
    accent,
    content,
  }
}
