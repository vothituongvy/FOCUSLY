import { AppRegistry } from 'react-native';
import App from './App';
import { installErrorReporting } from './src/sentry';

installErrorReporting();
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
