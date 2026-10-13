import { NativeModule, requireNativeModule } from 'expo';
import { ScreenStateEvent } from './ScreenState.types';

declare class ScreenStateModule extends NativeModule<{
  onScreenState: (event: ScreenStateEvent) => void;
}> {
  isInteractive(): boolean;
  isUnlocked(): boolean;
  getSystemInsets(): { top: number; bottom: number; left: number; right: number };
}

export default requireNativeModule<ScreenStateModule>('ScreenState');
