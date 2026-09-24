/**
 * 代码生成引擎：共享类型定义。
 */

export type AppType = 'todo' | 'timer' | 'calculator' | 'landing' | 'dashboard' | 'notes'

/** 从 prompt 派生出的领域化内容，供模板注入，避免千篇一律 */
export interface DerivedContent {
  domain: string
  features: { title: string; desc: string }[]
  stats: { num: string; label: string }[]
  ctaPrimary: string
  ctaSecondary: string
  highlight: string
}

export interface GenSpec {
  type: AppType
  title: string
  subtitle: string
  accent: string
  content: DerivedContent
}

export interface GenerateResult {
  type: AppType
  title: string
  subtitle: string
  accent: string
  content: DerivedContent
  code: string
}