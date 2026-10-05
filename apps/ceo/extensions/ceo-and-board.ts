import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import { registerBoardRuntimeWidget } from '../../../src/tui/extension.js';

export default function registerExtension(pi: ExtensionAPI): void {
  registerBoardRuntimeWidget(pi);
}
