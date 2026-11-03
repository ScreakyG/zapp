import './styles/base.css';
import { render } from 'solid-js/web';
import { App } from './App';
import { isWebOS } from './player/engines';

// TV-only styles hang off this class (e.g. no backdrop-filter over the video plane).
if (isWebOS()) document.documentElement.classList.add('webos');

render(() => <App />, document.getElementById('root')!);
