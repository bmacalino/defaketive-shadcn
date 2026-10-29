import './app.css';
import favicon from '#lib/assets/favicon.svg';
import { mount } from 'svelte';
import App from './App.svelte';

const icon = document.createElement('link');
icon.rel = 'icon';
icon.href = favicon;
document.head.append(icon);

mount(App, { target: document.getElementById('app')! });
