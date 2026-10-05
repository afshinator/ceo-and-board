import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import { registerCeoBoardExtension } from '../../../src/pi/extension.js';
import { registerBoardRuntimeWidget } from '../../../src/tui/extension.js';

export default function registerExtension(pi: ExtensionAPI): void {
  registerCeoBoardExtension(pi);
  registerBoardRuntimeWidget(pi);
}
