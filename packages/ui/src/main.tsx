import './styles/base.css';
import { render } from 'solid-js/web';
import { App } from './App';

// TV-only styles hang off this class (e.g. no backdrop-filter over the video plane).
if (/web0s|webos/i.test(navigator.userAgent)) document.documentElement.classList.add('webos');

render(() => <App />, document.getElementById('root')!);
