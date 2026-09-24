/**
 * 智能体团队定义与协作脚本。模拟 Atoms 的多智能体协作流程。
 */
import type { AppType } from './generator/types'

export interface Agent {
  id: string
  name: string
  role: string
  title: string
}

export const AGENTS: Agent[] = [
  { id: 'researcher', name: 'Iris', role: '研究员', title: '理解需求，发现关键信号' },
  { id: 'pm', name: 'Emma', role: '产品经理', title: '把想法转化为清晰规格' },
  { id: 'architect', name: 'Bob', role: '架构师', title: '设计系统蓝图与结构' },
  { id: 'engineer', name: 'Alex', role: '工程师', title: '构建可运行的前端应用' },
  { id: 'qa', name: 'Mia', role: '测试', title: '验证可运行性与交互' },
]

export const AGENT_MAP: Record<string, Agent> = Object.fromEntries(
  AGENTS.map((a) => [a.id, a]),
)

export const TYPE_LABEL: Record<AppType, string> = {
  todo: '待办清单',
  timer: '番茄专注钟',
  calculator: '计算器',
  landing: '品牌落地页',
  dashboard: '数据看板',
  notes: '灵感便签',
}

export interface AgentStep {
  agentId: string
  text: string
}

export function buildAgentScript(prompt: string, appType?: AppType): AgentStep[] {
  const label = appType ? TYPE_LABEL[appType] : '应用'
  return [
    { agentId: 'researcher', text: `正在解读需求：「${prompt}」` },
    { agentId: 'researcher', text: `已明确核心用户场景与目标产物：${label}` },
    { agentId: 'pm', text: '已输出功能范围与验收标准，保持简单可用' },
    { agentId: 'architect', text: '确定单页结构与组件划分，准备落地' },
    { agentId: 'engineer', text: '正在调用大模型生成 HTML / CSS / JS ...' },
    { agentId: 'engineer', text: '代码生成完毕，正在挂载预览' },
    { agentId: 'qa', text: '运行冒烟测试：交互与持久化全部通过' },
  ]
}