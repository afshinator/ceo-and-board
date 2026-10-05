import type { BoardRuntimeViewModel } from './state.js';

export interface BoardRuntimeDisplayOptions {
  ceoMessage?: string;
  selectedMemberIndex?: number;
  expanded?: boolean;
}

function oneLine(value: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export function renderBoardRuntimeLines(
  view: BoardRuntimeViewModel,
  options: BoardRuntimeDisplayOptions = {},
): string[] {
  const selectedIndex = options.selectedMemberIndex ?? 0;
  const lines: string[] = [];
  if (options.ceoMessage) {
    lines.push(`CEO → Board: ${oneLine(options.ceoMessage, 140)}`);
  }
  lines.push(`Board: ${view.workflow.label}`);
  lines.push(`Time ${view.time.displayValue} | Budget ${view.budget.displayValue}`);

  view.members.forEach((member, index) => {
    const marker = index === selectedIndex ? '>' : ' ';
    lines.push(`${marker} ${member.name} | ${member.label} | ${oneLine(member.latestActivity, 90)} | ${member.responseCount} accepted`);
    if (options.expanded && index === selectedIndex) {
      lines.push(`  Cost: ${member.telemetry.cost} | Context remaining: ${member.telemetry.remainingContext}`);
      if (member.latestAcceptedResponse) {
        lines.push(`  Response: ${oneLine(member.latestAcceptedResponse, 180)}`);
      }
    }
  });

  return lines;
}
