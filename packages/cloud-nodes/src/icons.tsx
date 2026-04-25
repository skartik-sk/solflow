// Icon mapping — renders lucide-react icons from string names.
// Used by CloudBaseNode to render icons from node definition strings.

import {
  Play,
  TrendingUp,
  Filter,
  GitBranch,
  Clock,
  Webhook,
  Wallet,
  Repeat,
  ArrowRightLeft,
  Bot,
  Send,
  Code,
  Timer,
  Activity,
} from "lucide-react";
import type { ComponentType } from "react";

const ICON_MAP: Record<string, ComponentType<{ size?: number }>> = {
  Play: Play,
  TrendingUp: TrendingUp,
  Filter: Filter,
  GitBranch: GitBranch,
  Clock: Clock,
  Webhook: Webhook,
  Wallet: Wallet,
  Repeat: Repeat,
  ArrowRightLeft: ArrowRightLeft,
  Bot: Bot,
  Send: Send,
  Code: Code,
  Timer: Timer,
  Activity: Activity,
};

export function getIconByName(name: string, size = 12): React.ReactNode {
  const IconComponent = ICON_MAP[name];
  if (!IconComponent) return <Activity size={size} />;
  return <IconComponent size={size} />;
}
