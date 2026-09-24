/**
 * 应用模板库：一键生成示例应用。
 */
export interface Template {
  id: string
  label: string
  prompt: string
}

export const TEMPLATES: Template[] = [
  { id: 'todo', label: '待办清单', prompt: '帮我做一个待办清单应用，可以添加、勾选和删除任务' },
  { id: 'timer', label: '番茄专注钟', prompt: '做一个番茄钟计时器，支持专注、短休、长休三种模式' },
  { id: 'calculator', label: '计算器', prompt: '做一个漂亮的四则运算计算器，支持键盘输入' },
  { id: 'dashboard', label: '数据看板', prompt: '生成一个数据仪表盘，展示核心指标和每周访问趋势' },
  { id: 'notes', label: '灵感便签', prompt: '做一款灵感便签应用，可以添加、切换颜色和删除便签' },
  { id: 'landing', label: '品牌落地页', prompt: '帮我做一个前沿科技产品的品牌落地页' },
]