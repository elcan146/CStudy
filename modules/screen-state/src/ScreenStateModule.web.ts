import { registerWebModule, NativeModule } from 'expo';

class ScreenStateModule extends NativeModule<{}> {}

export default registerWebModule(ScreenStateModule, 'ScreenStateModule');
