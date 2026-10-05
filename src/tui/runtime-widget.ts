import type { BoardRuntimeInput, BoardRuntimeViewModel } from './state.js';
import { buildBoardRuntimeViewModel } from './state.js';
import { renderBoardRuntimeLines } from './status-display.js';

export interface RuntimeWidgetUI {
  setWidget(key: string, content: string[] | undefined, options?: { placement?: 'aboveEditor' | 'belowEditor' }): void;
  onTerminalInput(handler: (data: string) => { consume?: boolean } | undefined): () => void;
}

export interface MountedBoardRuntimeWidget {
  update(input: BoardRuntimeInput, ceoMessage?: string): void;
  dispose(): void;
}

export function mountBoardRuntimeWidgetForMode(
  mode: string,
  hasUI: boolean,
  ui: RuntimeWidgetUI,
  initialInput: BoardRuntimeInput,
  options: { ceoMessage?: string; key?: string } = {},
): MountedBoardRuntimeWidget | undefined {
  if (mode !== 'tui' || !hasUI) {
    return undefined;
  }
  return mountBoardRuntimeWidget(ui, initialInput, options);
}

export function mountBoardRuntimeWidget(
  ui: RuntimeWidgetUI,
  initialInput: BoardRuntimeInput,
  options: { ceoMessage?: string; key?: string } = {},
): MountedBoardRuntimeWidget {
  const key = options.key ?? 'ceo-board-runtime';
  let viewModel: BoardRuntimeViewModel = buildBoardRuntimeViewModel(initialInput);
  let ceoMessage = options.ceoMessage;
  let selectedMemberIndex = 0;
  let expanded = false;
  let disposed = false;

  const render = () => {
    if (disposed) {
      return;
    }
    ui.setWidget(key, renderBoardRuntimeLines(viewModel, { ceoMessage, selectedMemberIndex, expanded }), {
      placement: 'aboveEditor',
    });
  };

  const unsubscribe = ui.onTerminalInput((data) => {
    if (disposed || viewModel.members.length === 0) {
      return undefined;
    }

    if (data === 'j' || data === '\u001b[B') {
      selectedMemberIndex = (selectedMemberIndex + 1) % viewModel.members.length;
      expanded = false;
      render();
      return { consume: true };
    }
    if (data === 'k' || data === '\u001b[A') {
      selectedMemberIndex = (selectedMemberIndex - 1 + viewModel.members.length) % viewModel.members.length;
      expanded = false;
      render();
      return { consume: true };
    }
    if (data === '\r' || data === '\n' || data === ' ') {
      expanded = !expanded;
      render();
      return { consume: true };
    }
    return undefined;
  });

  render();
  return {
    update(input, nextCeoMessage) {
      viewModel = buildBoardRuntimeViewModel(input);
      ceoMessage = nextCeoMessage;
      selectedMemberIndex = Math.min(selectedMemberIndex, Math.max(0, viewModel.members.length - 1));
      render();
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      unsubscribe();
      ui.setWidget(key, undefined);
    },
  };
}
