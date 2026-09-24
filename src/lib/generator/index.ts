/**
 * 生成引擎：入口。根据需求识别应用类型并产出完整可运行的 HTML。
 */
import type { AppType, GenSpec, GenerateResult } from './types'
import { detect } from './detect'
import todoPage from './templates/todo'
import timerPage from './templates/timer'
import calculatorPage from './templates/calculator'
import landingPage from './templates/landing'
import dashboardPage from './templates/dashboard'
import notesPage from './templates/notes'

const PAGES: Record<AppType, (spec: GenSpec) => string> = {
  todo: todoPage,
  timer: timerPage,
  calculator: calculatorPage,
  landing: landingPage,
  dashboard: dashboardPage,
  notes: notesPage,
}

export interface GenerateInput {
  prompt: string
  previousType?: AppType
  previousTitle?: string
  previousAccent?: string
}

export function generateApp(input: GenerateInput): GenerateResult {
  const d = detect(input.prompt, {
    previousType: input.previousType,
    previousTitle: input.previousTitle,
    previousAccent: input.previousAccent,
  })
  const spec: GenSpec = {
    type: d.type,
    title: d.title,
    subtitle: d.subtitle,
    accent: d.accent,
    content: d.content,
  }
  const code = PAGES[d.type](spec)
  return { ...spec, code }
}

export type { AppType, GenerateResult }