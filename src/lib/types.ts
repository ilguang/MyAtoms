/**
 * 前端共享类型定义。
 */

export interface User {
  id: string
  email: string
  createdAt: number
}

export interface Project {
  id: string
  userId: string
  name: string
  description: string
  createdAt: number
  updatedAt: number
}

export type MessageRole = 'user' | 'agent'
export type MessageKind = 'text' | 'agent-log' | 'app-created'

export interface Message {
  id: string
  projectId: string
  role: MessageRole
  kind: MessageKind
  content: string
  createdAt: number
}

/** 编辑器中的单个文件 */
export interface AppFile {
  path: string
  content: string
}

export interface GeneratedApp {
  id: string
  projectId: string
  name: string
  code: string
  version: number
  createdAt: number
  /** 编辑器用多文件视图；旧数据可能缺省，由调用方现场拆分兜底 */
  files?: AppFile[]
}

/** 一条 LLM 配置（一个供应商/模型 + 独立 API Key），apiKey 仅返回脱敏值 */
export interface LLMConfigItem {
  id: string
  baseUrl: string
  model: string
  apiKeyMasked: string
  createdAt: number
  updatedAt: number
}

/** GET /llm/configs 返回：全部条目 + 当前生效条目 id */
export interface LLMConfigList {
  configs: LLMConfigItem[]
  activeId: string | null
}

export interface LLMPreset {
  name: string
  baseUrl: string
  model: string
  docUrl: string
}