/**
 * 智能体头像：按 agentId 显示图标与配色。
 */
import {
  Search,
  ClipboardList,
  PenTool,
  Code2,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { AGENT_MAP } from '@/lib/agents'
import { cn } from '@/lib/utils'

const ICONS: Record<string, LucideIcon> = {
  researcher: Search,
  pm: ClipboardList,
  architect: PenTool,
  engineer: Code2,
  qa: ShieldCheck,
}

const COLORS: Record<string, string> = {
  researcher: 'text-accent bg-accent/12 border-accent/25',
  pm: 'text-[#6fe3a5] bg-[#6fe3a5]/10 border-[#6fe3a5]/25',
  architect: 'text-[#5ea2ff] bg-[#5ea2ff]/10 border-[#5ea2ff]/25',
  engineer: 'text-[#b58cff] bg-[#b58cff]/10 border-[#b58cff]/25',
  qa: 'text-[#ff6b8a] bg-[#ff6b8a]/10 border-[#ff6b8a]/25',
}

export function AgentAvatar({
  agentId,
  size = 'md',
  className,
}: {
  agentId: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const agent = AGENT_MAP[agentId]
  const Icon = ICONS[agentId] || ShieldCheck
  const color = COLORS[agentId] || COLORS.engineer
  const dim =
    size === 'lg'
      ? 'h-12 w-12 rounded-xl'
      : size === 'sm'
        ? 'h-7 w-7 rounded-md'
        : 'h-9 w-9 rounded-lg'
  const iconSize = size === 'lg' ? 22 : size === 'sm' ? 13 : 17

  return (
    <span
      className={cn('grid shrink-0 place-items-center border', dim, color, className)}
      title={agent ? `${agent.name} · ${agent.role}` : '智能体'}
    >
      <Icon size={iconSize} strokeWidth={2} />
    </span>
  )
}